/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the datasource-resolver helpers exported from `index.ts`.
 *
 * These cover the bug surfaced by the e2e validation: when the unified
 * rules aggregator fanned a Prometheus `data-connection` id through the
 * OS-only resolver, `getAlertingClient` threw `not_found`, the rejection
 * propagated up to the fanout, and the user saw "ObservabilityStack_Prometheus:
 * [object Object]" because `String(notFoundErrorObject)` is `"[object Object]"`.
 *
 * The fix splits resolution: an OS `data-source` is still required for OS
 * dsIds, but a Prometheus `data-connection` id now resolves to the local
 * cluster client (Prometheus directquery runs on the local OS).
 */

import {
  getAlertingClient,
  resolveOpenSearchDatasource,
  resolvePrometheusDatasource,
} from '../index';

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

const localClient = { transport: { request: jest.fn() } } as never;
const mdsClient = { transport: { request: jest.fn() } } as never;

function makeCtx(opts: {
  // Simulate `data-source` SO lookup outcome
  osSO?: { id: string; attributes: { title?: string; endpoint?: string } } | null;
  // Simulate `data-connection` SO list outcome
  promSOs?: Array<{
    id: string;
    attributes: { connectionId?: string; type?: string };
  }>;
  hasMds?: boolean;
}) {
  const soClient = {
    get: jest.fn(async () => {
      if (opts.osSO) return opts.osSO;
      throw new Error('saved object not found');
    }),
    find: jest.fn(async () => ({ saved_objects: opts.promSOs ?? [] })),
  };
  const ctx: any = {
    core: {
      savedObjects: { client: soClient },
      opensearch: { client: { asCurrentUser: localClient } },
    },
  };
  if (opts.hasMds) {
    ctx.dataSource = { opensearch: { getClient: jest.fn(async () => mdsClient) } };
  }
  return { ctx, soClient };
}

describe('resolveOpenSearchDatasource', () => {
  it('returns a synthetic local-cluster descriptor when no dsId is given', async () => {
    const { ctx } = makeCtx({});
    const ds = await resolveOpenSearchDatasource(ctx, undefined);
    expect(ds).toMatchObject({ id: 'local-cluster', type: 'opensearch' });
  });

  it('returns the OS data-source descriptor when the SO exists', async () => {
    const { ctx } = makeCtx({
      osSO: { id: 'mds-1', attributes: { title: 'Cluster 1', endpoint: 'https://c1' } },
    });
    const ds = await resolveOpenSearchDatasource(ctx, 'mds-1');
    expect(ds).toMatchObject({ id: 'mds-1', name: 'Cluster 1', mdsId: 'mds-1' });
  });

  it('returns null when the SO lookup throws (unknown id)', async () => {
    const { ctx } = makeCtx({ osSO: null });
    const ds = await resolveOpenSearchDatasource(ctx, 'does-not-exist');
    expect(ds).toBeNull();
  });
});

describe('resolvePrometheusDatasource', () => {
  it('returns null when no Prometheus connections exist', async () => {
    const { ctx } = makeCtx({ promSOs: [] });
    const ds = await resolvePrometheusDatasource(ctx, 'anything');
    expect(ds).toBeNull();
  });

  it('matches by SO id', async () => {
    const { ctx } = makeCtx({
      promSOs: [{ id: 'so-prom', attributes: { type: 'Prometheus', connectionId: 'prom-1' } }],
    });
    const ds = await resolvePrometheusDatasource(ctx, 'so-prom');
    expect(ds).toMatchObject({ id: 'so-prom', type: 'prometheus', directQueryName: 'prom-1' });
  });

  it('matches by attributes.connectionId (the live UI uses this id form)', async () => {
    const { ctx } = makeCtx({
      promSOs: [{ id: 'so-prom', attributes: { type: 'Prometheus', connectionId: 'prom-1' } }],
    });
    const ds = await resolvePrometheusDatasource(ctx, 'prom-1');
    expect(ds).toMatchObject({ id: 'so-prom', directQueryName: 'prom-1' });
  });

  it('filters non-Prometheus connection types', async () => {
    const { ctx } = makeCtx({
      promSOs: [{ id: 's3', attributes: { type: 'S3', connectionId: 's3-1' } }],
    });
    const ds = await resolvePrometheusDatasource(ctx, 's3-1');
    expect(ds).toBeNull();
  });

  it('returns the first connection when no dsId is given', async () => {
    const { ctx } = makeCtx({
      promSOs: [
        { id: 'p1', attributes: { type: 'Prometheus', connectionId: 'first' } },
        { id: 'p2', attributes: { type: 'Prometheus', connectionId: 'second' } },
      ],
    });
    const ds = await resolvePrometheusDatasource(ctx, undefined);
    expect(ds).toMatchObject({ id: 'p1' });
  });
});

describe('getAlertingClient', () => {
  beforeEach(() => mockLogger.warn.mockClear());

  it('returns the local cluster client when no dsId is given', async () => {
    const { ctx } = makeCtx({});
    const client = await getAlertingClient(ctx, undefined, mockLogger);
    expect(client).toBe(localClient);
  });

  it('returns the local cluster client when MDS is not configured even with a dsId', async () => {
    // `hasMds: false` ⇒ ctx.dataSource is undefined ⇒ skip both SO lookups.
    const { ctx } = makeCtx({});
    const client = await getAlertingClient(ctx, 'whatever', mockLogger);
    expect(client).toBe(localClient);
  });

  it('returns an MDS client when the dsId resolves to a data-source SO', async () => {
    const { ctx } = makeCtx({
      hasMds: true,
      osSO: { id: 'mds-1', attributes: { title: 'C1' } },
    });
    const client = await getAlertingClient(ctx, 'mds-1', mockLogger);
    expect(client).toBe(mdsClient);
  });

  it('returns the local cluster client when the dsId resolves to a Prometheus data-connection', async () => {
    // PR follow-up: previously this path threw `not_found`, the fanout
    // surfaced "[object Object]" to the user. Now it falls through to local.
    const { ctx } = makeCtx({
      hasMds: true,
      osSO: null,
      promSOs: [{ id: 'prom-ds', attributes: { type: 'Prometheus', connectionId: 'prom-ds' } }],
    });
    const client = await getAlertingClient(ctx, 'prom-ds', mockLogger);
    expect(client).toBe(localClient);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('also resolves a Prometheus dsId given by connectionId (live-UI shape)', async () => {
    const { ctx } = makeCtx({
      hasMds: true,
      osSO: null,
      promSOs: [
        {
          id: 'so-1',
          attributes: { type: 'Prometheus', connectionId: 'ObservabilityStack_Prometheus' },
        },
      ],
    });
    const client = await getAlertingClient(ctx, 'ObservabilityStack_Prometheus', mockLogger);
    expect(client).toBe(localClient);
  });

  it('throws not_found when the dsId is neither an OS data-source nor a Prometheus data-connection', async () => {
    const { ctx } = makeCtx({ hasMds: true, osSO: null, promSOs: [] });
    await expect(getAlertingClient(ctx, 'unknown', mockLogger)).rejects.toMatchObject({
      kind: 'not_found',
      message: expect.stringContaining('Datasource not found'),
    });
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('rejects workspace-scoped dsIds (containing "::") without consulting saved objects', async () => {
    const { ctx, soClient } = makeCtx({ hasMds: true });
    await expect(getAlertingClient(ctx, 'ws-scoped::dsId', mockLogger)).rejects.toMatchObject({
      kind: 'not_found',
    });
    expect(soClient.get).not.toHaveBeenCalled();
    expect(soClient.find).not.toHaveBeenCalled();
  });
});

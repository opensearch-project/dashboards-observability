/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectDatasourceService } from '../saved_object_datasource_service';
import type { CloudWatchDatasourceConfig } from '../saved_object_datasource_service';
import type { CloudWatchTargets, Logger } from '../../../../common/types/alerting';

const noopLogger = (): Logger => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});

function makeSoClient(opts: {
  os?: Array<{ id: string; attributes: { title?: string; endpoint?: string } }>;
  dc?: Array<{ id: string; attributes: { connectionId?: string; type?: string } }>;
  osThrows?: boolean;
  dcThrows?: boolean;
}) {
  return {
    find: jest.fn(async ({ type }: { type: string }) => {
      if (type === 'data-source') {
        if (opts.osThrows) throw new Error('OS find boom');
        return { saved_objects: opts.os ?? [] };
      }
      if (type === 'data-connection') {
        if (opts.dcThrows) throw new Error('DC find boom');
        return { saved_objects: opts.dc ?? [] };
      }
      return { saved_objects: [] };
    }),
    get: jest.fn(async () => {
      throw new Error('saved object not found');
    }),
  } as unknown as ConstructorParameters<typeof SavedObjectDatasourceService>[0];
}

describe('SavedObjectDatasourceService.list', () => {
  it('emits the local-cluster fallback when no data-source SOs exist', async () => {
    const svc = new SavedObjectDatasourceService(makeSoClient({}), noopLogger());
    const all = await svc.list();
    expect(all).toEqual([
      {
        id: 'local-cluster',
        name: 'Local Cluster',
        type: 'opensearch',
        url: 'local',
        enabled: true,
      },
    ]);
  });

  it('still emits the local-cluster fallback when ONLY a Prometheus data-connection exists', async () => {
    // Repro: registering a DirectQuery Prometheus connection used to suppress
    // the local-cluster fallback (the gate was on `all.length === 0` — any
    // entry, not specifically an OS one). The unified-alerts route then saw
    // zero OS datasources and the UI silently lost every OS monitor / alert.
    const svc = new SavedObjectDatasourceService(
      makeSoClient({
        dc: [{ id: 'so-prom', attributes: { type: 'Prometheus', connectionId: 'prom-1' } }],
      }),
      noopLogger()
    );
    const all = await svc.list();
    expect(all.find((d) => d.id === 'local-cluster')).toBeDefined();
    expect(all.find((d) => d.directQueryName === 'prom-1')).toBeDefined();
  });

  it('does NOT emit the local-cluster fallback when an OS data-source SO is registered', async () => {
    const svc = new SavedObjectDatasourceService(
      makeSoClient({
        os: [{ id: 'mds-1', attributes: { title: 'Cluster 1', endpoint: 'https://c1' } }],
        dc: [{ id: 'so-prom', attributes: { type: 'Prometheus', connectionId: 'prom-1' } }],
      }),
      noopLogger()
    );
    const all = await svc.list();
    expect(all.find((d) => d.id === 'local-cluster')).toBeUndefined();
    expect(all.find((d) => d.id === 'mds-1')).toBeDefined();
    expect(all.find((d) => d.directQueryName === 'prom-1')).toBeDefined();
  });

  it('skips non-Prometheus data-connection types', async () => {
    const svc = new SavedObjectDatasourceService(
      makeSoClient({
        dc: [{ id: 's3', attributes: { type: 'S3', connectionId: 's3-1' } }],
      }),
      noopLogger()
    );
    const all = await svc.list();
    expect(all.find((d) => d.id === 's3')).toBeUndefined();
    // Local fallback still emitted because no OS data-source SOs exist.
    expect(all.find((d) => d.id === 'local-cluster')).toBeDefined();
  });

  it('still emits the local-cluster fallback when the data-source find throws', async () => {
    // A SO-API outage on the OS-data-source side shouldn't strand the user
    // with no datasources at all — the local cluster is always reachable
    // through the local OS client, so the fallback gives the unified-view
    // routes something to talk to.
    const svc = new SavedObjectDatasourceService(makeSoClient({ osThrows: true }), noopLogger());
    const all = await svc.list();
    expect(all.find((d) => d.id === 'local-cluster')).toBeDefined();
  });
});

describe('SavedObjectDatasourceService.get', () => {
  it('short-circuits the local-cluster id without consulting saved objects', async () => {
    const soClient = makeSoClient({});
    const svc = new SavedObjectDatasourceService(soClient, noopLogger());
    const ds = await svc.get('local-cluster');
    expect(ds).toMatchObject({ id: 'local-cluster', type: 'opensearch' });
    expect((soClient as { get: jest.Mock }).get).not.toHaveBeenCalled();
    expect((soClient as { find: jest.Mock }).find).not.toHaveBeenCalled();
  });

  it('returns null for an unknown id when no SOs match', async () => {
    const svc = new SavedObjectDatasourceService(makeSoClient({}), noopLogger());
    expect(await svc.get('nope')).toBeNull();
  });
});

describe('SavedObjectDatasourceService CloudWatch scopes and regions', () => {
  const targets: CloudWatchTargets = {
    regions: [
      { id: 'us-east-1', name: 'us-east-1' },
      { id: 'us-west-2', name: 'us-west-2' },
      { id: 'eu-west-1', name: 'eu-west-1' },
    ],
    defaultRegion: 'us-east-1',
    scopes: [
      { label: 'CloudWatch', relation: 'own', defaultRegion: 'us-east-1' },
      {
        id: 's1',
        label: 'Production',
        accountId: '210987654321',
        relation: 'other',
        defaultRegion: 'eu-west-1',
      },
    ],
  };

  const service = (
    cloudWatch: CloudWatchDatasourceConfig,
    soClient = makeSoClient({}),
    logger = noopLogger()
  ) => new SavedObjectDatasourceService(soClient, logger, cloudWatch);

  const soMock = (client: ReturnType<typeof makeSoClient>) =>
    client as unknown as { get: jest.Mock; find: jest.Mock };

  const cloudWatchRows = async (svc: SavedObjectDatasourceService) =>
    (await svc.list()).filter((d) => d.type === 'cloudwatch');

  it("lists today's single entry without targets", async () => {
    const svc = service({ enabled: true, region: 'us-west-2' });
    expect(await cloudWatchRows(svc)).toEqual([
      {
        id: 'cloudwatch',
        name: 'CloudWatch',
        type: 'cloudwatch',
        url: 'cloudwatch',
        enabled: true,
        region: 'us-west-2',
      },
    ]);
    expect(await svc.get('cloudwatch')).toMatchObject({ id: 'cloudwatch', region: 'us-west-2' });
    expect(await svc.get('cloudwatch_us-east-1')).toBeNull();
  });

  it("lists today's single entry when the source reports no targets", async () => {
    const svc = service({ enabled: true, region: 'us-west-2', targets: async () => undefined });
    expect((await cloudWatchRows(svc)).map((d) => [d.id, d.name])).toEqual([
      ['cloudwatch', 'CloudWatch'],
    ]);
  });

  it('lists one entry per scope at its default region', async () => {
    const svc = service({ enabled: true, targets: async () => targets });
    expect(await cloudWatchRows(svc)).toEqual([
      expect.objectContaining({ id: 'cloudwatch', name: 'CloudWatch', region: 'us-east-1' }),
      expect.objectContaining({
        id: 'cloudwatch_eu-west-1_s1',
        name: 'CloudWatch · Production · eu-west-1',
        region: 'eu-west-1',
        cloudWatchScope: 's1',
        cloudWatchScopeLabel: 'Production',
        accountId: '210987654321',
      }),
    ]);
  });

  it('resolves an offered scope and region', async () => {
    const svc = service({ enabled: true, targets: async () => targets });
    expect(await svc.get('cloudwatch_us-west-2_s1')).toMatchObject({
      id: 'cloudwatch_us-west-2_s1',
      name: 'CloudWatch · Production · us-west-2',
      type: 'cloudwatch',
      region: 'us-west-2',
      cloudWatchScope: 's1',
    });
    expect(await svc.get('cloudwatch_us-west-2')).toMatchObject({
      id: 'cloudwatch_us-west-2',
      region: 'us-west-2',
    });
    expect(await svc.get('cloudwatch')).toMatchObject({ id: 'cloudwatch', region: 'us-east-1' });
  });

  it.each([
    ['an unknown scope', 'cloudwatch_us-east-1_s9'],
    ['an unoffered region', 'cloudwatch_ap-south-1_s1'],
    ['an undecodable id', 'cloudwatch_us-east-1_s1_x'],
    ['a non-canonical id', 'cloudwatch_us-east-1'],
  ])('returns null for %s without a saved-object lookup', async (_, id) => {
    const soClient = makeSoClient({});
    const svc = service({ enabled: true, targets: async () => targets }, soClient);
    expect(await svc.get(id)).toBeNull();
    expect(soMock(soClient).get).not.toHaveBeenCalled();
    expect(soMock(soClient).find).not.toHaveBeenCalled();
  });

  it('returns null for `cloudwatch` when the source offers no default scope', async () => {
    const svc = service({
      enabled: true,
      targets: async () => ({ ...targets, scopes: [targets.scopes[1]] }),
    });
    expect(await svc.get('cloudwatch')).toBeNull();
  });

  it('asks for targets once per service instance', async () => {
    const getTargets = jest.fn(async () => targets);
    const svc = service({ enabled: true, targets: getTargets });
    await svc.list();
    await svc.get('cloudwatch');
    await svc.get('cloudwatch_us-west-2_s1');
    await svc.get('cloudwatch_us-east-1_s9');
    expect(getTargets).toHaveBeenCalledTimes(1);
  });

  it("falls back to today's entry when targets fail, logging only the error name", async () => {
    const logger = noopLogger();
    const svc = service(
      {
        enabled: true,
        region: 'us-west-2',
        targets: async () => {
          throw Object.assign(new Error('arn:aws:iam::123456789012:role/x denied'), {
            name: 'AccessDeniedException',
          });
        },
      },
      makeSoClient({}),
      logger
    );
    expect((await cloudWatchRows(svc)).map((d) => d.id)).toEqual(['cloudwatch']);
    expect(await svc.get('cloudwatch')).toMatchObject({ id: 'cloudwatch', region: 'us-west-2' });
    expect(await svc.get('cloudwatch_us-west-2_s1')).toBeNull();
    const logged = JSON.stringify((logger.debug as jest.Mock).mock.calls);
    expect(logged).toContain('AccessDeniedException');
    expect(logged).not.toContain('123456789012');
  });

  it('with the gate off, resolves no CloudWatch id and makes no saved-object call', async () => {
    const soClient = makeSoClient({});
    const getTargets = jest.fn(async () => targets);
    const svc = service({ enabled: async () => false, targets: getTargets }, soClient);
    expect(await svc.get('cloudwatch_us-east-1')).toBeNull();
    expect(await svc.get('cloudwatch')).toBeNull();
    expect(soMock(soClient).get).not.toHaveBeenCalled();
    expect(soMock(soClient).find).not.toHaveBeenCalled();
    expect(getTargets).not.toHaveBeenCalled();
    expect(await cloudWatchRows(svc)).toEqual([]);
  });
});

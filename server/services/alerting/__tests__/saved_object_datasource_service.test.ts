/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectDatasourceService } from '../saved_object_datasource_service';
import type { Logger } from '../../../../common/types/alerting';

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
  return ({
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
  } as unknown) as ConstructorParameters<typeof SavedObjectDatasourceService>[0];
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

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatasourceDiscoveryService } from '../datasource_discovery';
import { InMemoryDatasourceService } from '../datasource_service';
import type { Logger } from '../../../../common/types/alerting';

function noopLogger(): Logger {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

type FakeFindFn = (req: {
  type: string;
}) => Promise<{ saved_objects: Array<{ id: string; attributes: any }> }>;

function makeCtx(find: FakeFindFn): any {
  return {
    core: {
      savedObjects: { client: { find } },
    },
  };
}

describe('DatasourceDiscoveryService.ensure', () => {
  it('does not leak ds-N rows across repeated runs (M2 regression)', async () => {
    const ds = new InMemoryDatasourceService(noopLogger());
    // 0ms TTL — every call past the first is forced through `run()`, which is
    // the path the leak lived on.
    const discovery = new DatasourceDiscoveryService(ds, noopLogger(), 0);

    // No MDS local-cluster entry → discovery emits the "Local Cluster" sentinel.
    const find: FakeFindFn = async ({ type }) => {
      if (type === 'data-source') return { saved_objects: [] };
      if (type === 'data-connection') {
        return {
          saved_objects: [
            { id: 'so-prom', attributes: { connectionId: 'prod-prom', type: 'Prometheus' } },
          ],
        };
      }
      return { saved_objects: [] };
    };

    await discovery.ensure(makeCtx(find));
    const after1 = (await ds.list()).map((d) => d.id).sort();
    expect(after1).toHaveLength(2); // local + prod-prom

    await discovery.ensure(makeCtx(find));
    await discovery.ensure(makeCtx(find));
    await discovery.ensure(makeCtx(find));

    const afterN = (await ds.list()).map((d) => d.id).sort();
    expect(afterN).toEqual(after1);
  });

  it('keeps the local-cluster ds-N id stable across runs when MDS local entry exists', async () => {
    const ds = new InMemoryDatasourceService(noopLogger());
    const discovery = new DatasourceDiscoveryService(ds, noopLogger(), 0);

    const find: FakeFindFn = async ({ type }) => {
      if (type === 'data-source') {
        return {
          saved_objects: [
            {
              id: 'mds-local',
              attributes: { title: 'My Local', endpoint: 'http://localhost:9200' },
            },
          ],
        };
      }
      return { saved_objects: [] };
    };

    await discovery.ensure(makeCtx(find));
    const first = (await ds.list()).find((d) => d.mdsId === 'mds-local');
    expect(first).toBeDefined();
    const firstId = first!.id;

    await discovery.ensure(makeCtx(find));
    await discovery.ensure(makeCtx(find));

    const list = await ds.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(firstId);
  });
});

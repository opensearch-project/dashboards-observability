/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { registerAlertingRoutes } from '../index';
import type { Datasource } from '../../../../common/types/alerting/types';

// ---- Mocks ----

interface SavedObject {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
}

const mockRouter = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
};

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function createDatasourceService() {
  const store = new Map<string, Datasource>();
  let counter = 0;
  return {
    list: jest.fn(async () => Array.from(store.values())),
    get: jest.fn(async (id: string) => store.get(id) ?? null),
    create: jest.fn(async (input: Omit<Datasource, 'id'>) => {
      const id = `ds-${++counter}`;
      const ds = { id, ...input } as Datasource;
      store.set(id, ds);
      return ds;
    }),
    update: jest.fn(),
    delete: jest.fn(async (id: string) => store.delete(id)),
    seed: jest.fn((items: Array<Omit<Datasource, 'id'>>) => {
      for (const item of items) {
        const id = `ds-${++counter}`;
        store.set(id, { id, ...item } as Datasource);
      }
    }),
    testConnection: jest.fn(),
    setPrometheusBackend: jest.fn(),
  };
}

const mockAlertService = {
  getOSMonitors: jest.fn(),
  getOSMonitor: jest.fn(),
  createOSMonitor: jest.fn(),
  updateOSMonitor: jest.fn(),
  deleteOSMonitor: jest.fn(),
  getOSAlerts: jest.fn(),
  acknowledgeOSAlerts: jest.fn(),
  getPromRuleGroups: jest.fn(),
  getPromAlerts: jest.fn(),
  getUnifiedAlerts: jest.fn(),
  getUnifiedRules: jest.fn(),
  getRuleDetail: jest.fn(),
  getAlertDetail: jest.fn(),
  getPrometheusBackend: jest.fn(),
};

function makeSoClient(osSavedObjects: SavedObject[] = [], dcSavedObjects: SavedObject[] = []) {
  return {
    find: jest.fn((opts: { type: string }) => {
      if (opts.type === 'data-source') return { saved_objects: osSavedObjects };
      if (opts.type === 'data-connection') return { saved_objects: dcSavedObjects };
      return { saved_objects: [] };
    }),
  };
}

function makeCtx(soClient: ReturnType<typeof makeSoClient> | { find: jest.Mock }) {
  return {
    core: {
      savedObjects: { client: soClient },
      opensearch: { client: { asCurrentUser: {} } },
    },
  };
}

// ---- Helpers to invoke the GET /api/alerting/datasources handler ----

interface RouteConfig {
  path: string;
}
type RouteHandler = (...args: unknown[]) => unknown;

function getListDatasourcesHandler(): RouteHandler {
  // First router.get call is for /api/alerting/datasources
  const call = mockRouter.get.mock.calls.find(
    ([config]: [RouteConfig]) => config.path === '/api/alerting/datasources'
  );
  return call![1] as RouteHandler; // handler fn
}

// ---- Tests ----

describe('registerAlertingRoutes', () => {
  it('registers routes on all HTTP methods', () => {
    const dsSvc = createDatasourceService();
    registerAlertingRoutes(
      mockRouter as never,
      dsSvc as never,
      mockAlertService as never,
      mockLogger
    );
    expect(mockRouter.get).toHaveBeenCalled();
    expect(mockRouter.post).toHaveBeenCalled();
    expect(mockRouter.put).toHaveBeenCalled();
    expect(mockRouter.delete).toHaveBeenCalled();
  });

  it('registers expected route paths', () => {
    mockRouter.get.mockClear();
    mockRouter.post.mockClear();
    mockRouter.put.mockClear();
    mockRouter.delete.mockClear();
    const dsSvc = createDatasourceService();
    registerAlertingRoutes(
      mockRouter as never,
      dsSvc as never,
      mockAlertService as never,
      mockLogger
    );
    const getPaths = mockRouter.get.mock.calls.map(([c]: [RouteConfig]) => c.path);
    expect(getPaths).toContain('/api/alerting/datasources');
    expect(getPaths).toContain('/api/alerting/unified/alerts');
    expect(getPaths).toContain('/api/alerting/unified/rules');
    expect(getPaths).toContain('/api/alerting/alertmanager/config');
  });
});

describe('datasource discovery', () => {
  let dsSvc: ReturnType<typeof createDatasourceService>;

  beforeEach(() => {
    mockRouter.get.mockClear();
    mockRouter.post.mockClear();
    mockRouter.put.mockClear();
    mockRouter.delete.mockClear();
    dsSvc = createDatasourceService();
    registerAlertingRoutes(
      mockRouter as never,
      dsSvc as never,
      mockAlertService as never,
      mockLogger
    );
  });

  it('seeds default "Local Cluster" when no MDS saved objects exist', async () => {
    const soClient = makeSoClient([], []);
    const ctx = makeCtx(soClient);
    const res = { ok: jest.fn(<T>(x: T) => x) };
    const handler = getListDatasourcesHandler();
    await handler(ctx, {}, res);
    expect(dsSvc.seed).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'Local Cluster' })])
    );
  });

  it('uses MDS title instead of "Local Cluster" when MDS points at localhost', async () => {
    const localMds: SavedObject = {
      id: 'so-id-1',
      type: 'data-source',
      attributes: { title: 'MyLocal', endpoint: 'http://localhost:9200' },
    };
    const soClient = makeSoClient([localMds], []);
    const ctx = makeCtx(soClient);
    const res = { ok: jest.fn(<T>(x: T) => x) };
    await getListDatasourcesHandler()(ctx, {}, res);

    // First seed call should contain the user-named local entry, NOT "Local Cluster"
    const firstSeedArg = dsSvc.seed.mock.calls[0][0];
    expect(firstSeedArg).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'MyLocal', mdsId: 'so-id-1' })])
    );
    // "Local Cluster" should NOT appear in any seed call
    const allSeeded: Array<Partial<Datasource>> = dsSvc.seed.mock.calls.flatMap(
      ([items]: [Array<Partial<Datasource>>]) => items
    );
    expect(allSeeded.find((d) => d.name === 'Local Cluster')).toBeUndefined();
  });

  it('appends remote MDS after local seed', async () => {
    const localMds: SavedObject = {
      id: 'so-local',
      type: 'data-source',
      attributes: { title: 'Local', endpoint: 'http://127.0.0.1:9200' },
    };
    const remoteMds: SavedObject = {
      id: 'so-remote',
      type: 'data-source',
      attributes: { title: 'RemoteCluster', endpoint: 'https://os.example.com:9200' },
    };
    const soClient = makeSoClient([localMds, remoteMds], []);
    const ctx = makeCtx(soClient);
    const res = { ok: jest.fn(<T>(x: T) => x) };
    await getListDatasourcesHandler()(ctx, {}, res);

    // First seed: local entry
    expect(dsSvc.seed.mock.calls[0][0]).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Local', mdsId: 'so-local' })])
    );
    // Second seed: remote entry
    expect(dsSvc.seed.mock.calls[1][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'RemoteCluster', mdsId: 'so-remote' }),
      ])
    );
  });

  it('discovery failure still allows routes to respond', async () => {
    const soClient = {
      find: jest.fn(() => {
        throw new Error('SO unavailable');
      }),
    };
    const ctx = makeCtx(soClient);
    const res = { ok: jest.fn(<T>(x: T) => x) };
    await getListDatasourcesHandler()(ctx, {}, res);
    // Handler should still call res.ok (discovery error is caught)
    expect(res.ok).toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalled();
  });

  it('discovers Prometheus data-connections', async () => {
    const promDc: SavedObject = {
      id: 'dc-1',
      type: 'data-connection',
      attributes: { connectionId: 'my-prom', type: 'Prometheus' },
    };
    const soClient = makeSoClient([], [promDc]);
    const ctx = makeCtx(soClient);
    const res = { ok: jest.fn(<T>(x: T) => x) };
    await getListDatasourcesHandler()(ctx, {}, res);

    const allSeeded: Array<Partial<Datasource>> = dsSvc.seed.mock.calls.flatMap(
      ([items]: [Array<Partial<Datasource>>]) => items
    );
    expect(allSeeded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'my-prom',
          type: 'prometheus',
          directQueryName: 'my-prom',
        }),
      ])
    );
  });
});

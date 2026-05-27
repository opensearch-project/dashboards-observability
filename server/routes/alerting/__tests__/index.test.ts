/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Route-registration smoke tests for `registerAlertingRoutes`.
 *
 * The registrar wires:
 *   - 4 mutation routes (delegated to `registerAlertingMutationRoutes` —
 *     still observable on the mock router because the delegate uses the
 *     same router instance):
 *       POST   /api/alerting/opensearch/{dsId}/monitors
 *       POST   /api/alerting/opensearch/{dsId}/monitors/{monitorId}/acknowledge
 *       PUT    /api/alerting/opensearch/{dsId}/monitors/{monitorId}
 *       DELETE /api/alerting/opensearch/{dsId}/monitors/{monitorId}
 *   - 9 read routes + 1 destinations read route + 2 index-discovery read
 *     routes (indices, aliases) + 1 Alertmanager admin route registered
 *     inline (13 GETs)
 *   - 1 mappings POST route (POSTs index list in body to avoid URL limits)
 *   - 4 Prometheus metadata routes inside `if (enableMetadataRoutes)` (4 GETs)
 *
 * Datasource CRUD routes have been deleted — these tests also assert none
 * of them sneak back in.
 *
 * The stateful alerting services are no longer passed in as pre-built
 * singletons; they're constructed per-request inside the registrar, so the
 * tests only mock the stateless dependencies (backends, mutation service).
 */

import { registerAlertingRoutes } from '../index';

interface RouteConfig {
  path: string;
}

const mockRouter = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
};

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

const mockOsBackend = {} as never;
const mockPromBackend = {} as never;
const mockMutationSvc = {} as never;

describe('registerAlertingRoutes', () => {
  beforeEach(() => {
    mockRouter.get.mockClear();
    mockRouter.post.mockClear();
    mockRouter.put.mockClear();
    mockRouter.delete.mockClear();
  });

  it('registers all runtime routes when metadata routes are enabled (17 GET + 5 POST + 1 PUT + 1 DELETE = 24)', () => {
    registerAlertingRoutes(mockRouter as never, {
      osBackend: mockOsBackend,
      promBackend: mockPromBackend,
      mutationSvc: mockMutationSvc,
      logger: mockLogger,
      enableMetadataRoutes: true,
    });
    const total =
      mockRouter.get.mock.calls.length +
      mockRouter.post.mock.calls.length +
      mockRouter.put.mock.calls.length +
      mockRouter.delete.mock.calls.length;
    // 13 inline GETs (incl. destinations + indices + aliases) + 4 metadata GETs = 17 GETs
    // 2 monitor POSTs + 1 PUT + 1 DELETE + 1 mappings POST = 5 non-GET routes
    expect(total).toBe(22);
    expect(mockRouter.get.mock.calls.length).toBe(17);
  });

  it('skips the 4 metadata GET routes when enableMetadataRoutes is false (13 GET + 5 mutations = 18)', () => {
    registerAlertingRoutes(mockRouter as never, {
      osBackend: mockOsBackend,
      promBackend: mockPromBackend,
      mutationSvc: mockMutationSvc,
      logger: mockLogger,
      enableMetadataRoutes: false,
    });
    const total =
      mockRouter.get.mock.calls.length +
      mockRouter.post.mock.calls.length +
      mockRouter.put.mock.calls.length +
      mockRouter.delete.mock.calls.length;
    expect(total).toBe(18);
    expect(mockRouter.get.mock.calls.length).toBe(13);
  });

  it('registers the destinations read route', () => {
    registerAlertingRoutes(mockRouter as never, {
      osBackend: mockOsBackend,
      promBackend: mockPromBackend,
      mutationSvc: mockMutationSvc,
      logger: mockLogger,
      enableMetadataRoutes: false,
    });
    const getPaths = mockRouter.get.mock.calls.map(([c]: [RouteConfig]) => c.path);
    expect(getPaths).toContain('/api/alerting/opensearch/{dsId}/destinations');
  });

  it('registers the index-discovery routes', () => {
    registerAlertingRoutes(mockRouter as never, {
      osBackend: mockOsBackend,
      promBackend: mockPromBackend,
      mutationSvc: mockMutationSvc,
      logger: mockLogger,
      enableMetadataRoutes: false,
    });
    const getPaths = mockRouter.get.mock.calls.map(([c]: [RouteConfig]) => c.path);
    const postPaths = mockRouter.post.mock.calls.map(([c]: [RouteConfig]) => c.path);
    expect(getPaths).toContain('/api/alerting/opensearch/{dsId}/indices');
    expect(getPaths).toContain('/api/alerting/opensearch/{dsId}/aliases');
    expect(postPaths).toContain('/api/alerting/opensearch/{dsId}/mappings');
  });

  it('registers the 4 surviving mutation paths', () => {
    registerAlertingRoutes(mockRouter as never, {
      osBackend: mockOsBackend,
      promBackend: mockPromBackend,
      mutationSvc: mockMutationSvc,
      logger: mockLogger,
      enableMetadataRoutes: false,
    });
    const postPaths = mockRouter.post.mock.calls.map(([c]: [RouteConfig]) => c.path);
    const putPaths = mockRouter.put.mock.calls.map(([c]: [RouteConfig]) => c.path);
    const deletePaths = mockRouter.delete.mock.calls.map(([c]: [RouteConfig]) => c.path);

    expect(postPaths).toContain('/api/alerting/opensearch/{dsId}/monitors');
    expect(postPaths).toContain('/api/alerting/opensearch/{dsId}/monitors/{monitorId}/acknowledge');
    expect(putPaths).toContain('/api/alerting/opensearch/{dsId}/monitors/{monitorId}');
    expect(deletePaths).toContain('/api/alerting/opensearch/{dsId}/monitors/{monitorId}');
  });

  it('registers the Alertmanager admin route', () => {
    registerAlertingRoutes(mockRouter as never, {
      osBackend: mockOsBackend,
      promBackend: mockPromBackend,
      mutationSvc: mockMutationSvc,
      logger: mockLogger,
      enableMetadataRoutes: false,
    });
    const getPaths = mockRouter.get.mock.calls.map(([c]: [RouteConfig]) => c.path);
    expect(getPaths).toContain('/api/alerting/alertmanager/config');
  });

  it('does NOT register deleted datasource CRUD routes', () => {
    registerAlertingRoutes(mockRouter as never, {
      osBackend: mockOsBackend,
      promBackend: mockPromBackend,
      mutationSvc: mockMutationSvc,
      logger: mockLogger,
      enableMetadataRoutes: true,
    });
    const allPaths = [
      ...mockRouter.get.mock.calls.map(([c]: [RouteConfig]) => c.path),
      ...mockRouter.post.mock.calls.map(([c]: [RouteConfig]) => c.path),
      ...mockRouter.put.mock.calls.map(([c]: [RouteConfig]) => c.path),
      ...mockRouter.delete.mock.calls.map(([c]: [RouteConfig]) => c.path),
    ];

    // Paths that were intentionally moved to the client.
    const shouldNotExist = [
      '/api/alerting/datasources',
      '/api/alerting/datasources/{id}',
      '/api/alerting/datasources/{id}/test',
    ];

    for (const p of shouldNotExist) {
      expect(allPaths).not.toContain(p);
    }
  });

  // =========================================================================
  // timeRangeQuery applied to all three alerts routes.
  //
  // The three targeted routes are:
  //   GET /api/alerting/unified/alerts
  //   GET /api/alerting/opensearch/{dsId}/alerts
  //   GET /api/alerting/prometheus/{dsId}/alerts
  //
  // We reach into the `validate.query` schema object that `registerAlertingRoutes`
  // attached to each route and verify the startTime / endTime fields (a)
  // accept valid date-math, (b) reject malformed input, (c) are both optional.
  // =========================================================================

  describe('timeRangeQuery', () => {
    interface Route {
      path: string;
      validate?: { query?: unknown };
    }

    const register = () => {
      mockRouter.get.mockClear();
      registerAlertingRoutes(mockRouter as never, {
        osBackend: mockOsBackend,
        promBackend: mockPromBackend,
        mutationSvc: mockMutationSvc,
        logger: mockLogger,
        enableMetadataRoutes: false,
      });
    };

    const findRoute = (path: string): Route => {
      const call = mockRouter.get.mock.calls.find(([c]: [Route]) => c.path === path);
      if (!call) throw new Error(`route not registered: ${path}`);
      return call[0];
    };

    it.each([
      '/api/alerting/unified/alerts',
      '/api/alerting/opensearch/{dsId}/alerts',
      '/api/alerting/prometheus/{dsId}/alerts',
    ])('%s accepts valid date-math startTime/endTime', (path: string) => {
      register();
      const route = findRoute(path);
      // `validate.query` is an @osd/config-schema object schema. `.validate`
      // either returns the parsed value on success or throws on failure.
      const query = (route.validate as { query: { validate: (v: unknown) => unknown } }).query;
      expect(() => query.validate({ startTime: 'now-1h', endTime: 'now' })).not.toThrow();
    });

    it.each([
      '/api/alerting/unified/alerts',
      '/api/alerting/opensearch/{dsId}/alerts',
      '/api/alerting/prometheus/{dsId}/alerts',
    ])('%s rejects malformed startTime with a validation error', (path: string) => {
      register();
      const route = findRoute(path);
      const query = (route.validate as { query: { validate: (v: unknown) => unknown } }).query;
      expect(() => query.validate({ startTime: 'gibberish', endTime: 'now' })).toThrow(
        /invalid date-math/
      );
    });

    it.each([
      '/api/alerting/unified/alerts',
      '/api/alerting/opensearch/{dsId}/alerts',
      '/api/alerting/prometheus/{dsId}/alerts',
    ])('%s accepts absent params (legacy no-range behavior)', (path: string) => {
      register();
      const route = findRoute(path);
      const query = (route.validate as { query: { validate: (v: unknown) => unknown } }).query;
      expect(() => query.validate({})).not.toThrow();
    });

    it.each([
      '/api/alerting/unified/alerts',
      '/api/alerting/opensearch/{dsId}/alerts',
      '/api/alerting/prometheus/{dsId}/alerts',
    ])('%s rejects one-sided ranges (startTime without endTime)', (path: string) => {
      register();
      const route = findRoute(path);
      const query = (route.validate as { query: { validate: (v: unknown) => unknown } }).query;
      expect(() => query.validate({ startTime: 'now-1h' })).toThrow(
        /startTime and endTime must be supplied together/
      );
    });

    it.each([
      '/api/alerting/unified/alerts',
      '/api/alerting/opensearch/{dsId}/alerts',
      '/api/alerting/prometheus/{dsId}/alerts',
    ])('%s rejects one-sided ranges (endTime without startTime)', (path: string) => {
      register();
      const route = findRoute(path);
      const query = (route.validate as { query: { validate: (v: unknown) => unknown } }).query;
      expect(() => query.validate({ endTime: 'now' })).toThrow(
        /startTime and endTime must be supplied together/
      );
    });

    it.each([
      '/api/alerting/unified/alerts',
      '/api/alerting/opensearch/{dsId}/alerts',
      '/api/alerting/prometheus/{dsId}/alerts',
    ])('%s rejects inverted ranges (endTime before startTime)', (path: string) => {
      register();
      const route = findRoute(path);
      const query = (route.validate as { query: { validate: (v: unknown) => unknown } }).query;
      expect(() => query.validate({ startTime: 'now', endTime: 'now-1h' })).toThrow(
        /endTime must be on or after startTime/
      );
    });
  });

  // =========================================================================
  // Route error-handling: getAlertingClient throws AlertManagerError outside
  // the handler's own try/catch.
  //
  // Regression: before the runHandler wrapper, an unknown OS dsId caused
  // `getAlertingClient` to throw a plain `{kind:'not_found', message}` object
  // straight up to OSD's framework, which crashed with
  // "text.replace is not a function" when stringifying the non-Error value.
  // The route surfaced 500 with a redacted body, but the server log filled
  // with TypeErrors and the typed status (404) was lost.
  //
  // Each captured handler is invoked with a context whose savedObjects.get
  // throws (= unknown OS data-source) and find returns no Prometheus
  // connections (= unknown overall). The handler should resolve to a
  // properly-typed 404 ResponseError, not throw.
  // =========================================================================

  describe('runHandler error funneling', () => {
    interface Route {
      path: string;
      handler: (ctx: unknown, req: unknown, res: unknown) => Promise<unknown>;
    }

    const buildCtx = () => ({
      core: {
        savedObjects: {
          client: {
            get: jest.fn().mockRejectedValue(new Error('not found')),
            find: jest.fn().mockResolvedValue({ saved_objects: [] }),
          },
        },
        opensearch: { client: { asCurrentUser: { transport: { request: jest.fn() } } } },
      },
      // Crucially, MDS *is* configured. Without this, getAlertingClient
      // short-circuits to local-cluster and never throws — the regression
      // path requires the OS-data-source resolution to fail explicitly.
      dataSource: {
        opensearch: {
          getClient: jest.fn().mockResolvedValue({ transport: { request: jest.fn() } }),
        },
      },
    });

    const buildRes = () => {
      const calls: Record<string, unknown[]> = {};
      const make = (key: string) => (arg: unknown) => {
        calls[key] = calls[key] || [];
        calls[key].push(arg);
        return { key, arg };
      };
      return {
        ok: make('ok'),
        customError: make('customError'),
        notFound: make('notFound'),
        badRequest: make('badRequest'),
        unauthorized: make('unauthorized'),
        forbidden: make('forbidden'),
        conflict: make('conflict'),
        _calls: calls,
      };
    };

    const findRoute = (path: string): Route => {
      const all: Array<[unknown, unknown]> = [
        ...mockRouter.get.mock.calls,
        ...mockRouter.post.mock.calls,
        ...mockRouter.put.mock.calls,
        ...mockRouter.delete.mock.calls,
      ];
      const match = all.find(([cfg]) => (cfg as { path: string }).path === path);
      if (!match) throw new Error(`Route ${path} not registered`);
      return { path, handler: match[1] as Route['handler'] };
    };

    const register = () => {
      mockRouter.get.mockClear();
      mockRouter.post.mockClear();
      mockRouter.put.mockClear();
      mockRouter.delete.mockClear();
      registerAlertingRoutes(mockRouter as never, {
        osBackend: mockOsBackend,
        promBackend: mockPromBackend,
        mutationSvc: mockMutationSvc,
        logger: mockLogger,
        enableMetadataRoutes: true,
      });
    };

    // Each of these routes calls `getAlertingClientCtx` *outside* of any
    // handler-local try/catch. Without runHandler wrapping, the throw
    // would propagate to OSD and produce the "text.replace" 500.
    it.each([
      '/api/alerting/opensearch/{dsId}/monitors',
      '/api/alerting/opensearch/{dsId}/monitors/{monitorId}',
      '/api/alerting/opensearch/{dsId}/alerts',
      '/api/alerting/prometheus/{dsId}/rules',
      '/api/alerting/prometheus/{dsId}/alerts',
      '/api/alerting/rules/{dsId}/{ruleId}',
      '/api/alerting/alerts/{dsId}/{alertId}',
      '/api/alerting/prometheus/{dsId}/metadata/metrics',
      '/api/alerting/prometheus/{dsId}/metadata/labels',
      '/api/alerting/prometheus/{dsId}/metadata/label-values/{label}',
      '/api/alerting/prometheus/{dsId}/metadata/metric-metadata',
    ])('%s returns a typed 404 (not 500) when the dsId is unknown', async (path: string) => {
      register();
      const route = findRoute(path);
      const ctx = buildCtx();
      const res = buildRes();
      const req = {
        params: {
          dsId: 'unknown',
          monitorId: 'm1',
          ruleId: 'r1',
          alertId: 'a1',
          label: 'instance',
        },
        query: { search: '', metric: '', selector: '' },
      };

      // Must not throw — the wrapper should funnel the AlertManagerError
      // through toHandlerResult and emit res.customError(404, ...).
      await expect(route.handler(ctx, req, res)).resolves.toBeDefined();
      const errorCalls = res._calls.customError as Array<{ statusCode: number; body: unknown }>;
      expect(errorCalls).toBeDefined();
      expect(errorCalls.length).toBeGreaterThan(0);
      expect(errorCalls[0].statusCode).toBe(404);
    });
  });
});

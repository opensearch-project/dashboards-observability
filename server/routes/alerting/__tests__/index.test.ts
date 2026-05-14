/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Route-registration smoke tests for `registerAlertingRoutes`.
 *
 * Post-Phase-5 + concurrency-fix state the registrar wires:
 *   - 4 mutation routes (delegated to `registerAlertingMutationRoutes` —
 *     still observable on the mock router because the delegate uses the
 *     same router instance):
 *       POST   /api/alerting/opensearch/{dsId}/monitors
 *       POST   /api/alerting/opensearch/{dsId}/monitors/{monitorId}/acknowledge
 *       PUT    /api/alerting/opensearch/{dsId}/monitors/{monitorId}
 *       DELETE /api/alerting/opensearch/{dsId}/monitors/{monitorId}
 *   - 9 read routes + 1 destinations read route + 1 Alertmanager admin route
 *     registered inline (11 GETs)
 *   - 4 Prometheus metadata routes inside `if (enableMetadataRoutes)` (4 GETs)
 *
 * Datasource CRUD routes were deleted in Phase 3 — these tests also assert
 * none of them sneak back in.
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

  it('registers all runtime routes when metadata routes are enabled (15 GET + 4 mutations = 19)', () => {
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
    expect(total).toBe(19);
    // 11 inline GETs (incl. destinations) + 4 conditional metadata GETs = 15 GETs total
    expect(mockRouter.get.mock.calls.length).toBe(15);
  });

  it('skips the 4 metadata GET routes when enableMetadataRoutes is false (11 GET + 4 mutations = 15)', () => {
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
    expect(total).toBe(15);
    expect(mockRouter.get.mock.calls.length).toBe(11);
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

    // Paths that were intentionally moved to the client in Phase 3.
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
});

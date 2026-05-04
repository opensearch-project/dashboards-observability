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
 *   - 9 read routes + 1 Alertmanager admin route registered inline (10 GETs)
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

  it('registers all runtime routes when metadata routes are enabled (14 GET + 4 mutations = 18)', () => {
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
    expect(total).toBe(18);
    // 10 inline GETs + 4 conditional metadata GETs = 14 GETs total
    expect(mockRouter.get.mock.calls.length).toBe(14);
  });

  it('skips the 4 metadata GET routes when enableMetadataRoutes is false (10 GET + 4 mutations = 14)', () => {
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
    expect(total).toBe(14);
    expect(mockRouter.get.mock.calls.length).toBe(10);
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
});

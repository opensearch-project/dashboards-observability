/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Route-handler integration tests for `registerAlertingMutationRoutes`.
 *
 * These verify that:
 *   - The route handlers call `MonitorMutationService` methods with the
 *     correct arguments (client, monitorId, body).
 *   - The request body is forwarded as-is (no schema mangling) — a regression
 *     guard against the `@osd/config-schema` stripping PPL trigger fields.
 *   - Error paths surface the right HTTP status codes.
 */
import { registerAlertingMutationRoutes } from '../mutations';

type Handler = (ctx: unknown, req: unknown, res: unknown) => Promise<unknown>;

interface CapturedRoute {
  path: string;
  validate: unknown;
  handler: Handler;
}

const capturedRoutes: Record<string, CapturedRoute[]> = {
  post: [],
  put: [],
  delete: [],
};

const mockRouter = {
  post: jest.fn((config: unknown, handler: Handler) => {
    capturedRoutes.post.push({ ...(config as any), handler });
  }),
  put: jest.fn((config: unknown, handler: Handler) => {
    capturedRoutes.put.push({ ...(config as any), handler });
  }),
  delete: jest.fn((config: unknown, handler: Handler) => {
    capturedRoutes.delete.push({ ...(config as any), handler });
  }),
};

const mockMutationSvc = {
  createMonitor: jest.fn(),
  updateMonitor: jest.fn(),
  deleteMonitor: jest.fn(),
  acknowledgeAlerts: jest.fn(),
};

const mockClient = { transport: { request: jest.fn() } };
const mockGetClient = jest.fn().mockResolvedValue(mockClient);

const resOk = jest.fn((body: unknown) => ({ ok: true, body }));
const resNotFound = jest.fn((body: unknown) => ({ notFound: true, body }));
const resConflict = jest.fn((body: unknown) => ({ conflict: true, body }));
const resCustomError = jest.fn((opts: unknown) => ({ error: true, opts }));

const mockRes = {
  ok: resOk,
  notFound: resNotFound,
  conflict: resConflict,
  customError: resCustomError,
};

function findRoute(method: string, pathSuffix: string): CapturedRoute | undefined {
  return capturedRoutes[method]?.find((r) => r.path.includes(pathSuffix));
}

describe('registerAlertingMutationRoutes — handler wiring', () => {
  beforeAll(() => {
    registerAlertingMutationRoutes(
      mockRouter as never,
      mockMutationSvc as never,
      mockGetClient as never
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ======================================================================
  // CREATE
  // ======================================================================
  describe('POST /monitors (create)', () => {
    it('passes the raw body to mutationSvc.createMonitor without mangling', async () => {
      const pplBody = {
        type: 'monitor',
        monitor_type: 'ppl_monitor',
        name: 'my-ppl-monitor',
        enabled: true,
        schedule: { period: { interval: 5, unit: 'MINUTES' } },
        inputs: [
          { ppl_input: { query: 'source = logs-* | stats count() as cnt', query_language: 'ppl' } },
        ],
        triggers: [
          {
            ppl_trigger: {
              name: 'trig-1',
              severity: '2',
              actions: [],
              type: 'number_of_results',
              num_results_condition: '>',
              num_results_value: 10,
            },
          },
        ],
      };
      mockMutationSvc.createMonitor.mockResolvedValueOnce({ id: 'new-1', ...pplBody });

      const route = findRoute('post', '/monitors');
      expect(route).toBeDefined();

      const req = { params: { dsId: 'ds-os' }, body: pplBody };
      await route!.handler({}, req, mockRes);

      expect(mockGetClient).toHaveBeenCalledWith({}, 'ds-os');
      expect(mockMutationSvc.createMonitor).toHaveBeenCalledWith(mockClient, pplBody);
      expect(resOk).toHaveBeenCalled();
    });

    it('returns 500 on unexpected error', async () => {
      mockMutationSvc.createMonitor.mockRejectedValueOnce(new Error('connection reset'));
      const route = findRoute('post', '/monitors');
      const req = { params: { dsId: 'ds-os' }, body: { name: 'x' } };
      await route!.handler({}, req, mockRes);
      expect(resCustomError).toHaveBeenCalled();
      const call = resCustomError.mock.calls[0][0] as { statusCode: number };
      expect(call.statusCode).toBe(500);
    });
  });

  // ======================================================================
  // UPDATE
  // ======================================================================
  describe('PUT /monitors/{monitorId} (update)', () => {
    it('passes monitorId + body to mutationSvc.updateMonitor', async () => {
      const updated = { id: 'mon-1', name: 'renamed' };
      mockMutationSvc.updateMonitor.mockResolvedValueOnce(updated);

      const route = findRoute('put', '/monitors/');
      const req = { params: { dsId: 'ds-os', monitorId: 'mon-1' }, body: { name: 'renamed' } };
      await route!.handler({}, req, mockRes);

      expect(mockMutationSvc.updateMonitor).toHaveBeenCalledWith(mockClient, 'mon-1', {
        name: 'renamed',
      });
      expect(resOk).toHaveBeenCalledWith({ body: updated });
    });

    it('returns 404 when monitor not found', async () => {
      mockMutationSvc.updateMonitor.mockResolvedValueOnce(null);
      const route = findRoute('put', '/monitors/');
      const req = { params: { dsId: 'ds-os', monitorId: 'missing' }, body: { name: 'x' } };
      await route!.handler({}, req, mockRes);
      expect(resNotFound).toHaveBeenCalled();
    });
  });

  // ======================================================================
  // DELETE
  // ======================================================================
  describe('DELETE /monitors/{monitorId} (delete)', () => {
    it('calls mutationSvc.deleteMonitor and returns success', async () => {
      mockMutationSvc.deleteMonitor.mockResolvedValueOnce(true);
      const route = findRoute('delete', '/monitors/');
      const req = { params: { dsId: 'ds-os', monitorId: 'mon-1' } };
      await route!.handler({}, req, mockRes);
      expect(mockMutationSvc.deleteMonitor).toHaveBeenCalledWith(mockClient, 'mon-1');
      expect(resOk).toHaveBeenCalled();
    });

    it('returns 404 when monitor not found', async () => {
      mockMutationSvc.deleteMonitor.mockResolvedValueOnce(false);
      const route = findRoute('delete', '/monitors/');
      const req = { params: { dsId: 'ds-os', monitorId: 'gone' } };
      await route!.handler({}, req, mockRes);
      expect(resNotFound).toHaveBeenCalled();
    });
  });

  // ======================================================================
  // ACKNOWLEDGE
  // ======================================================================
  describe('POST /monitors/{monitorId}/acknowledge', () => {
    it('passes monitorId + alertIds to mutationSvc.acknowledgeAlerts', async () => {
      mockMutationSvc.acknowledgeAlerts.mockResolvedValueOnce({ success: true });
      const route = findRoute('post', '/acknowledge');
      const req = { params: { dsId: 'ds-os', monitorId: 'mon-1' }, body: { alerts: ['a1', 'a2'] } };
      await route!.handler({}, req, mockRes);
      expect(mockMutationSvc.acknowledgeAlerts).toHaveBeenCalledWith(mockClient, 'mon-1', [
        'a1',
        'a2',
      ]);
      expect(resOk).toHaveBeenCalled();
    });
  });
});

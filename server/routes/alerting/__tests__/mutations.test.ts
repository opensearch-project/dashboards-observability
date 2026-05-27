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
import {
  monitorAcknowledgeBodySchema,
  monitorMutationBodySchema,
  SCHEMA_LIMITS,
} from '../mutations/body_schema';

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

// ==========================================================================
// Body schema validation
// ==========================================================================

describe('monitorMutationBodySchema', () => {
  it('accepts a fully-specified PPL monitor body with arbitrary trigger wrapper keys', () => {
    expect(() =>
      monitorMutationBodySchema.validate({
        type: 'monitor',
        monitor_type: 'ppl_monitor',
        name: 'pp-1',
        enabled: true,
        schedule: { period: { interval: 5, unit: 'MINUTES' } },
        inputs: [
          { ppl_input: { query: 'source = logs-* | stats count()', query_language: 'ppl' } },
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
      })
    ).not.toThrow();
  });

  it('rejects bodies that omit name', () => {
    expect(() =>
      monitorMutationBodySchema.validate({
        type: 'monitor',
        triggers: [],
      } as any)
    ).toThrow();
  });

  it('rejects bodies whose name exceeds the alerting plugin cap', () => {
    expect(() =>
      monitorMutationBodySchema.validate({
        name: 'x'.repeat(SCHEMA_LIMITS.ALERTING_NAME_MAX + 1),
      } as any)
    ).toThrow();
  });

  it('rejects bodies with too many triggers', () => {
    const triggers = Array.from({ length: SCHEMA_LIMITS.TRIGGERS_MAX + 1 }, (_, i) => ({
      ppl_trigger: { name: `t${i}` },
    }));
    expect(() =>
      monitorMutationBodySchema.validate({
        name: 'm',
        triggers,
      } as any)
    ).toThrow();
  });

  it('rejects bodies whose ppl_input.query exceeds the PPL query cap', () => {
    expect(() =>
      monitorMutationBodySchema.validate({
        name: 'm',
        inputs: [
          {
            ppl_input: {
              query: 'x'.repeat(SCHEMA_LIMITS.PPL_QUERY_MAX + 1),
              query_language: 'ppl',
            },
          },
        ],
      } as any)
    ).toThrow();
  });

  it('accepts bodies whose ppl_input.query is at exactly the PPL query cap', () => {
    expect(() =>
      monitorMutationBodySchema.validate({
        name: 'm',
        inputs: [
          {
            ppl_input: {
              query: 'x'.repeat(SCHEMA_LIMITS.PPL_QUERY_MAX),
              query_language: 'ppl',
            },
          },
        ],
      } as any)
    ).not.toThrow();
  });
});

describe('monitorAcknowledgeBodySchema', () => {
  it('accepts a single id', () => {
    expect(() => monitorAcknowledgeBodySchema.validate({ alerts: ['a1'] })).not.toThrow();
  });

  it('rejects an id that exceeds the per-id cap', () => {
    expect(() =>
      monitorAcknowledgeBodySchema.validate({
        alerts: ['x'.repeat(SCHEMA_LIMITS.ACK_ID_MAX + 1)],
      })
    ).toThrow();
  });

  it('rejects an empty id', () => {
    expect(() => monitorAcknowledgeBodySchema.validate({ alerts: [''] })).toThrow();
  });
});

// ==========================================================================
// Logger wiring (F3 / F4)
// ==========================================================================

describe('mutation handlers — logger wiring', () => {
  const localCaptured: Record<string, CapturedRoute[]> = { post: [], put: [], delete: [] };
  const localRouter = {
    post: jest.fn((cfg: unknown, h: Handler) => {
      localCaptured.post.push({ ...(cfg as any), handler: h });
    }),
    put: jest.fn((cfg: unknown, h: Handler) => {
      localCaptured.put.push({ ...(cfg as any), handler: h });
    }),
    delete: jest.fn((cfg: unknown, h: Handler) => {
      localCaptured.delete.push({ ...(cfg as any), handler: h });
    }),
  };
  const localSvc = {
    createMonitor: jest.fn(),
    updateMonitor: jest.fn(),
    deleteMonitor: jest.fn(),
    acknowledgeAlerts: jest.fn(),
  };
  const localClient = { transport: { request: jest.fn() } };
  const localGetClient = jest.fn().mockResolvedValue(localClient);
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const localRes = {
    ok: jest.fn((b: unknown) => ({ ok: true, body: b })),
    notFound: jest.fn((b: unknown) => ({ notFound: true, body: b })),
    conflict: jest.fn((b: unknown) => ({ conflict: true, body: b })),
    customError: jest.fn((opts: unknown) => ({ error: true, opts })),
  };

  beforeAll(() => {
    registerAlertingMutationRoutes(
      localRouter as never,
      localSvc as never,
      localGetClient as never,
      logger as never
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function find(method: 'post' | 'put' | 'delete', suffix: string): CapturedRoute {
    const r = localCaptured[method].find((x) => x.path.includes(suffix));
    if (!r) throw new Error(`route not found: ${method} ${suffix}`);
    return r;
  }

  it('logs an info audit line on successful create', async () => {
    localSvc.createMonitor.mockResolvedValueOnce({ id: 'm-1' });
    await find('post', '/monitors').handler!(
      {},
      { params: { dsId: 'ds-1' }, body: { name: 'x' } },
      localRes as never
    );
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('createMonitor success'));
  });

  it('logs an info audit line on successful update', async () => {
    localSvc.updateMonitor.mockResolvedValueOnce({ id: 'm-1' });
    await find('put', '/monitors/').handler!(
      {},
      { params: { dsId: 'ds-1', monitorId: 'm-1' }, body: { name: 'x' } },
      localRes as never
    );
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('updateMonitor success'));
  });

  it('logs an info audit line on successful delete', async () => {
    localSvc.deleteMonitor.mockResolvedValueOnce(true);
    await find('delete', '/monitors/').handler!(
      {},
      { params: { dsId: 'ds-1', monitorId: 'm-1' } },
      localRes as never
    );
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('deleteMonitor success'));
  });

  it('logs an info audit line on successful acknowledge', async () => {
    localSvc.acknowledgeAlerts.mockResolvedValueOnce({ success: true });
    await find('post', '/acknowledge').handler!(
      {},
      { params: { dsId: 'ds-1', monitorId: 'm-1' }, body: { alerts: ['a1'] } },
      localRes as never
    );
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('acknowledgeAlerts success'));
  });

  it('passes the logger into toHandlerResult on error so failures are visible server-side', async () => {
    localSvc.createMonitor.mockRejectedValueOnce(new Error('upstream down'));
    await find('post', '/monitors').handler!(
      {},
      { params: { dsId: 'ds-1' }, body: { name: 'x' } },
      localRes as never
    );
    expect(logger.error).toHaveBeenCalledWith('upstream down');
  });
});

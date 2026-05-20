/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Handler-level tests for W2.4 — admin `_reconcile` endpoint.
 *
 * Framework-agnostic: exercises `handleReconcile` directly, same pattern as
 * the sibling `handlers_repair_and_health.test.ts`. No real OSD router is
 * involved; the router-level wiring lives in `reconcile_route.ts` and is
 * exercised in Phase 2's integration suite (W2.7).
 */

import { handleReconcile, registerSloReconcileRoute } from '../reconcile_route';
import type { Logger } from '../../../../common/types/alerting/types';

function noopLogger(): Logger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  };
}

/**
 * Minimal shape stand-in for the Phase-2 `ReconcileResult`. We don't import
 * the real type here — the handler treats the value as opaque and the peer
 * W2.1 agent owns the authoritative definition. This test only cares that
 * whatever object `reconcileOnce` resolves to round-trips through the
 * handler body unchanged.
 */
interface FakeReconcileResult {
  sweepId: string;
  datasourceIds: string[];
  orphans: number;
  missingRuleGroups: number;
  errors: number;
}

/**
 * Shape-matched fake of the (type-only) `SloReconciler` import in
 * `reconcile_route.ts`. Declared as a concrete interface so the mock
 * expectations are type-checked even though the real type is owned by the
 * peer agent.
 */
interface FakeReconciler {
  reconcileOnce: jest.Mock<Promise<FakeReconcileResult>, [{ datasourceIds?: string[] }]>;
}

function makeReconciler(result: FakeReconcileResult): FakeReconciler {
  return {
    reconcileOnce: jest.fn(async () => result),
  };
}

// Cast helper keeps the `any` off the call sites. The handler parameter is
// typed as `SloReconciler | undefined`, a type-only import that babel-jest
// erases at runtime, so a structurally compatible fake is sufficient.
function asReconciler(r: FakeReconciler | undefined) {
  return (r as unknown) as Parameters<typeof handleReconcile>[0];
}

describe('handleReconcile', () => {
  const fixtureResult: FakeReconcileResult = {
    sweepId: 'sweep-abc-123',
    datasourceIds: ['ds-a', 'ds-b'],
    orphans: 2,
    missingRuleGroups: 1,
    errors: 0,
  };

  it('returns 501 when the reconciler dep is missing', async () => {
    const result = await handleReconcile(asReconciler(undefined), undefined, noopLogger());

    expect(result.status).toBe(501);
    expect(result.body).toEqual({ error: 'Reconciler not configured in this environment' });
  });

  it('returns 200 with the ReconcileResult verbatim on happy path', async () => {
    const reconciler = makeReconciler(fixtureResult);

    const result = await handleReconcile(asReconciler(reconciler), undefined, noopLogger());

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ result: fixtureResult });
    expect(reconciler.reconcileOnce).toHaveBeenCalledTimes(1);
  });

  it('passes the datasource filter through to reconcileOnce', async () => {
    const reconciler = makeReconciler(fixtureResult);

    await handleReconcile(asReconciler(reconciler), ['ds-a', 'ds-b'], noopLogger());

    expect(reconciler.reconcileOnce).toHaveBeenCalledTimes(1);
    expect(reconciler.reconcileOnce).toHaveBeenCalledWith({
      datasourceIds: ['ds-a', 'ds-b'],
    });
  });

  it('normalizes an undefined filter to { datasourceIds: undefined }', async () => {
    const reconciler = makeReconciler(fixtureResult);

    await handleReconcile(asReconciler(reconciler), undefined, noopLogger());

    expect(reconciler.reconcileOnce).toHaveBeenCalledTimes(1);
    expect(reconciler.reconcileOnce).toHaveBeenCalledWith({ datasourceIds: undefined });
  });

  it('normalizes an empty filter array to { datasourceIds: undefined }', async () => {
    const reconciler = makeReconciler(fixtureResult);

    await handleReconcile(asReconciler(reconciler), [], noopLogger());

    expect(reconciler.reconcileOnce).toHaveBeenCalledTimes(1);
    expect(reconciler.reconcileOnce).toHaveBeenCalledWith({ datasourceIds: undefined });
  });

  it('propagates reconcileOnce errors as 500 with the error message', async () => {
    const reconciler: FakeReconciler = {
      reconcileOnce: jest.fn(async () => {
        throw new Error('boom — downstream ruler offline');
      }),
    };

    const result = await handleReconcile(asReconciler(reconciler), undefined, noopLogger());

    expect(result.status).toBe(500);
    // `toHandlerResult` collapses generic errors to the internal-error body
    // so we don't leak stack detail to callers.
    expect(result.body).toEqual({ error: 'An internal error occurred' });
    expect(reconciler.reconcileOnce).toHaveBeenCalledTimes(1);
  });

  it('surfaces validation-shaped errors as 400 via toHandlerResult', async () => {
    // Second branch of `toHandlerResult` message classification — verifies the
    // standard error-mapping path is wired, so callers that emit
    // `new Error('validation …')` from the reconciler pipeline still produce
    // a 4xx instead of an opaque 500.
    const reconciler: FakeReconciler = {
      reconcileOnce: jest.fn(async () => {
        throw new Error('validation failed: datasourceIds must be non-empty strings');
      }),
    };

    const result = await handleReconcile(asReconciler(reconciler), ['bad,value'], noopLogger());

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: expect.stringContaining('validation'),
    });
  });
});

/**
 * Route-adapter regression guard for follow-up #3: the reconcile route must
 * call `discoveryService.ensure(ctx)` BEFORE the reconciler reads the
 * in-memory datasource registry. Prior to the fix, a fresh-booted OSD whose
 * first external call was `POST /_reconcile` hit an empty registry and the
 * reconciler's per-datasource lookup rejected every caller as "Datasource
 * not registered".
 */
describe('registerSloReconcileRoute — discovery priming', () => {
  interface RouteConfig {
    path: string;
  }
  type RouteHandler = (...args: unknown[]) => Promise<unknown>;

  function makeRouter() {
    return {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    };
  }

  function makeRes() {
    const ok = jest.fn((body: unknown) => ({ status: 200, body }));
    const customError = jest.fn((body: { statusCode: number; body: unknown }) => ({
      status: body.statusCode,
      body: body.body,
    }));
    return { ok, customError };
  }

  function getReconcileHandler(router: ReturnType<typeof makeRouter>): RouteHandler {
    const call = router.post.mock.calls.find(([cfg]: [RouteConfig]) =>
      /\/api\/observability\/v1\/slos\/_reconcile$/.test(cfg.path)
    );
    if (!call) throw new Error('POST _reconcile route not registered');
    return call[1] as RouteHandler;
  }

  it('calls discoveryService.ensure(ctx) before reconciler.reconcileOnce on a cold registry', async () => {
    const callOrder: string[] = [];
    const ensure = jest.fn(async () => {
      callOrder.push('ensure');
    });
    const reconcileOnce = jest.fn(async () => {
      callOrder.push('reconcileOnce');
      return {
        sweepId: 'sweep-cold-1',
        datasourceIds: [],
        orphans: 0,
        missingRuleGroups: 0,
        errors: 0,
      };
    });

    const router = makeRouter();
    const reconciler = ({ reconcileOnce } as unknown) as Parameters<
      typeof registerSloReconcileRoute
    >[1];
    const discoveryService = ({ ensure } as unknown) as Parameters<
      typeof registerSloReconcileRoute
    >[2];

    registerSloReconcileRoute(router as never, reconciler, discoveryService, noopLogger());

    const ctx = { core: { savedObjects: { client: {} } } };
    const res = makeRes();
    await getReconcileHandler(router)(ctx, { query: {} }, res);

    expect(ensure).toHaveBeenCalledTimes(1);
    expect(ensure).toHaveBeenCalledWith(ctx);
    expect(reconcileOnce).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['ensure', 'reconcileOnce']);
    expect(res.ok).toHaveBeenCalled();
  });

  it('tolerates an undefined discoveryService (legacy wiring) without breaking the handler', async () => {
    // Defensive branch — `discoveryService` is optional so offline-dev and
    // partial-wiring tests keep working. When undefined, the handler must
    // still dispatch to the reconciler.
    const reconcileOnce = jest.fn(async () => ({
      sweepId: 'sweep-no-discovery',
      datasourceIds: [],
      orphans: 0,
      missingRuleGroups: 0,
      errors: 0,
    }));
    const router = makeRouter();
    const reconciler = ({ reconcileOnce } as unknown) as Parameters<
      typeof registerSloReconcileRoute
    >[1];

    registerSloReconcileRoute(router as never, reconciler, undefined, noopLogger());

    const ctx = { core: { savedObjects: { client: {} } } };
    const res = makeRes();
    await getReconcileHandler(router)(ctx, { query: {} }, res);

    expect(reconcileOnce).toHaveBeenCalledTimes(1);
    expect(res.ok).toHaveBeenCalled();
  });
});

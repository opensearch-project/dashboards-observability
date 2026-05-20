/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 2 / W2.4 — admin `_reconcile` endpoint.
 *
 * Framework-agnostic handler (`handleReconcile`) + OSD route adapter
 * (`registerSloReconcileRoute`). Kept in its own module rather than in
 * `handlers.ts` because the reconcile surface is cross-cutting — it sweeps
 * every SLO for the configured datasource set rather than operating on a
 * single SLO — and it ships with a dedicated admin dependency (the
 * `SloReconciler`) that the per-SLO CRUD handlers don't need.
 *
 * Authorization: this route is intentionally open to any authenticated
 * caller in the workspace. SLOs are pre-GA and the feature flag is the
 * only gate today. A runtime admin-role check may be added later once a
 * real multi-user threat model exists; until then, don't introduce one.
 */

import { schema } from '@osd/config-schema';
import type { IRouter, Logger } from '../../../../../src/core/server';
import { OBSERVABILITY_BASE } from '../../../common/constants/shared';
import type { HandlerResult } from '../alerting/route_utils';
import { toHandlerResult } from '../alerting/route_utils';
import type { DatasourceDiscoveryService } from '../../services/alerting/datasource_discovery';
// NB: `reconciler.ts` is authored by the W2.1 parallel agent in this same
// batch. We pull only types here — no runtime binding — so the route file
// stays safe to import even while the peer lands, and `babel-jest` strips
// the type-only import at test time.
import type { ReconcileResult, SloReconciler } from '../../services/slo/reconciler';

const SLO_BASE = `${OBSERVABILITY_BASE}/v1/slos`;

/**
 * Framework-agnostic reconcile handler.
 *
 * - 501 when the reconciler dep is missing (mirrors the 501 pattern used by
 *   `handleRepairSLO` when the rule-health checker isn't configured).
 * - 200 with `{ result }` on success, passing the `ReconcileResult` through
 *   verbatim — downstream UI / Phase 4 consumers own the shape.
 * - 500 via `toHandlerResult` on any uncaught error from `reconcileOnce`.
 *
 * The `datasourceIds` arg is the already-parsed list (route adapter splits
 * the comma-separated query param). Passing `undefined` / `[]` means "all
 * datasources" — we normalize to `undefined` so the reconciler doesn't have
 * to branch on an empty array meaning the same thing.
 */
export async function handleReconcile(
  reconciler: SloReconciler | undefined,
  datasourceIds: string[] | undefined,
  logger?: Logger
): Promise<HandlerResult> {
  try {
    if (!reconciler) {
      return {
        status: 501,
        body: { error: 'Reconciler not configured in this environment' },
      };
    }
    const normalizedDatasourceIds =
      datasourceIds && datasourceIds.length > 0 ? datasourceIds : undefined;
    const result: ReconcileResult = await reconciler.reconcileOnce({
      datasourceIds: normalizedDatasourceIds,
    });
    return { status: 200, body: { result } };
  } catch (e) {
    return toHandlerResult(e, logger);
  }
}

/**
 * Register `POST /api/observability/v1/slos/_reconcile`.
 *
 * Query param:
 *   - `datasourceId` (optional, comma-separated list): when supplied, the
 *     reconciler only sweeps those datasources. Empty / missing = all.
 *
 * When `reconciler` is `undefined` we still register the route so callers
 * get a stable 501 (not a 404) — same defensive wiring used for repair /
 * rule_health when the health checker is off.
 */
export function registerSloReconcileRoute(
  router: IRouter,
  reconciler: SloReconciler | undefined,
  discoveryService: DatasourceDiscoveryService | undefined,
  logger: Logger
): void {
  router.post(
    {
      path: `${SLO_BASE}/_reconcile`,
      validate: {
        query: schema.object({
          datasourceId: schema.maybe(schema.string()),
        }),
      },
    },
    async (ctx, req, res) => {
      // Access to this endpoint is intentionally open to any authenticated
      // caller in the workspace. SLOs are pre-GA and the feature flag
      // (observability.slo.ruleDedup.enabled) is the only gate today. A
      // runtime admin-role check may be added later once a real multi-user
      // threat model exists; until then, don't introduce one.
      //
      // Prime the datasource registry before the reconciler reads it. On a
      // fresh-booted OSD whose first external call is `_reconcile`, the
      // in-memory registry is empty until discovery runs once — causing the
      // reconciler's per-datasource lookup to fail with "Datasource not
      // registered". `ensure` is TTL-gated + shares in-flight promises, so
      // the steady-state cost is near-zero; every other SLO route already
      // calls it before touching the registry.
      if (discoveryService) {
        await discoveryService.ensure(ctx);
      }
      const raw = req.query.datasourceId;
      const datasourceIds = raw
        ? raw
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : undefined;
      const result = await handleReconcile(reconciler, datasourceIds, logger);
      if (result.status === 200) {
        return res.ok({ body: result.body });
      }
      return res.customError({
        statusCode: result.status,
        body: {
          message: String((result.body as { error?: string }).error ?? 'Reconcile failed'),
          attributes: result.body as Record<string, unknown>,
        },
      });
    }
  );
}

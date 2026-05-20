/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 4 (W4.6) — SLO rule-adoption HTTP endpoints.
 *
 *   GET  /api/observability/v1/slos/_orphans
 *   POST /api/observability/v1/slos/_recover
 *
 * Both are admin-gated by the combination of two feature flags:
 *   - `observability.slo.ruleDedup.enabled`   (Phase 3)
 *   - `observability.slo.ruleAdoption.enabled` (Phase 4)
 *
 * When either flag is off, the endpoint returns HTTP 412 Precondition Failed
 * with an envelope that names the missing flag(s). The gate runs first on
 * every request — before schema validation and before any deploy-context
 * resolution — so the precondition failure is cheap and deterministic.
 *
 * Service-call + error-code translation lives in the framework-agnostic
 * handlers (`handlers.ts`). This module owns:
 *   - route registration + schema validation
 *   - the 412 feature-flag gate
 *   - deploy-context construction (same `buildDeployContext` pattern used
 *     by create/update/delete — shared here via a private helper that
 *     mirrors the one in `index.ts`)
 *
 * External dashboards: intentionally none. This plugin emits
 * Prometheus-compatible rule groups and the orphan adoption surface reads
 * those groups only; no external visualization product is in scope.
 */

import { schema } from '@osd/config-schema';
import type { IRouter, Logger, RequestHandlerContext } from '../../../../../src/core/server';
import { OBSERVABILITY_BASE } from '../../../common/constants/shared';
import type { SloDeployContext } from '../../../common/slo/slo_service';
import { SloService, SloValidationError } from '../../../common/slo/slo_service';
import type { AlertingOSClient, Datasource } from '../../../common/types/alerting/types';
import type { InMemoryDatasourceService } from '../../services/alerting/datasource_service';
import type { DatasourceDiscoveryService } from '../../services/alerting/datasource_discovery';
import type { RulerClient } from '../../services/slo/ruler_client';
import type { SloReconciler } from '../../services/slo/reconciler';
import { handleListOrphans, handleRecoverSlo } from './handlers';
import type { RecoverSloInputLite, SloAdoptionServiceLite, SloReconcilerLite } from './handlers';

const SLO_BASE = `${OBSERVABILITY_BASE}/v1/slos`;

/** Context type mirroring the one in `index.ts` — kept local so the
 * adoption module doesn't re-export the internal type just for a side
 * import. */
type SloHandlerContext = RequestHandlerContext & {
  dataSource?: {
    opensearch: {
      getClient: (id: string) => Promise<AlertingOSClient>;
    };
  };
};

/**
 * Envelope returned by the 412 feature-flag gate. `missingFlags` is
 * populated with whichever one(s) are disabled — the caller UI can render
 * the exact flag name the operator needs to flip. Order is deterministic
 * (`ruleDedup` before `ruleAdoption`) so snapshot tests don't flake.
 */
interface PreconditionFailure {
  error: 'PRECONDITION_FAILED';
  message: string;
  missingFlags: Array<'ruleDedup' | 'ruleAdoption'>;
}

function buildPreconditionFailure(
  ruleDedupEnabled: boolean,
  ruleAdoptionEnabled: boolean
): PreconditionFailure | null {
  const missingFlags: Array<'ruleDedup' | 'ruleAdoption'> = [];
  if (!ruleDedupEnabled) missingFlags.push('ruleDedup');
  if (!ruleAdoptionEnabled) missingFlags.push('ruleAdoption');
  if (missingFlags.length === 0) return null;
  return {
    error: 'PRECONDITION_FAILED',
    message:
      'Orphan adoption requires observability.slo.ruleDedup.enabled and observability.slo.ruleAdoption.enabled',
    missingFlags,
  };
}

export interface RegisterSloAdoptionRoutesOptions {
  router: IRouter;
  sloService: SloService;
  logger: Logger;
  rulerClient?: RulerClient;
  datasourceService?: InMemoryDatasourceService;
  discoveryService?: DatasourceDiscoveryService;
  reconciler?: SloReconciler;
  ruleDedupEnabled: boolean;
  ruleAdoptionEnabled: boolean;
}

/**
 * Build a `SloDeployContext` for the adoption endpoints. Pattern mirrors
 * `buildDeployContext` in `server/routes/slo/index.ts` but pared down to
 * what recover/clone need. Throws `SloValidationError` when the datasource
 * is missing or isn't a DirectQuery Prometheus connection — the route
 * adapter catches and returns 400.
 */
async function buildAdoptionDeployContext(
  ctx: SloHandlerContext,
  datasourceId: string,
  workspaceId: string | undefined,
  rulerClient: RulerClient | undefined,
  datasourceService: InMemoryDatasourceService | undefined,
  discoveryService: DatasourceDiscoveryService | undefined
): Promise<SloDeployContext> {
  if (!rulerClient) {
    throw new SloValidationError({
      'spec.datasourceId': 'Ruler client not configured; cannot reach the ruler.',
    });
  }
  if (!datasourceService) {
    throw new SloValidationError({
      'spec.datasourceId': 'Datasource service not configured; cannot resolve datasource.',
    });
  }
  if (discoveryService) {
    await discoveryService.ensure(ctx);
  }
  const ds = await datasourceService.get(datasourceId);
  if (!ds) {
    throw new SloValidationError({
      'spec.datasourceId': `Datasource "${datasourceId}" is not registered. Pick one from /api/alerting/datasources.`,
    });
  }
  if (!ds.directQueryName) {
    throw new SloValidationError({
      'spec.datasourceId': `Datasource "${ds.name}" is not a DirectQuery Prometheus connection; SLO rules can only be deployed to Prometheus-backed datasources.`,
    });
  }
  const client: AlertingOSClient =
    ds.mdsId && ctx.dataSource
      ? await ctx.dataSource.opensearch.getClient(ds.mdsId)
      : ctx.core.opensearch.client.asCurrentUser;
  return {
    ruler: rulerClient,
    client,
    datasource: ds as Datasource,
    // workspaceId === datasourceId shorthand until W3-follow-up wires real
    // workspace scoping (matches the pattern in `index.ts#buildDeployContext`).
    workspaceId: workspaceId ?? datasourceId,
  };
}

/**
 * Register the W4.6 adoption endpoints. Each handler applies the 412 gate
 * up front; unflagged plugins still see the endpoints (so UI error
 * surfaces don't have to branch on 404-vs-412) but get a consistent 412
 * envelope back.
 */
export function registerSloAdoptionRoutes(options: RegisterSloAdoptionRoutesOptions): void {
  const {
    router,
    sloService,
    logger,
    rulerClient,
    datasourceService,
    discoveryService,
    reconciler,
    ruleDedupEnabled,
    ruleAdoptionEnabled,
  } = options;

  // The structural service interface that the handlers consume. SloService
  // grows `recover` + `clone` in B2A (W4.4/W4.5); until that lands the
  // cast keeps typecheck quiet. Once B2A ships, the cast becomes a no-op.
  const adoptionService = (sloService as unknown) as SloAdoptionServiceLite;

  // --------------------------------------------------------------------------
  // GET /api/observability/v1/slos/_orphans
  // --------------------------------------------------------------------------
  router.get(
    {
      path: `${SLO_BASE}/_orphans`,
      validate: {
        query: schema.object({
          datasourceId: schema.maybe(schema.string()),
        }),
      },
    },
    async (ctx, req, res) => {
      const precondition = buildPreconditionFailure(ruleDedupEnabled, ruleAdoptionEnabled);
      if (precondition) {
        return res.customError({
          statusCode: 412,
          body: {
            message: precondition.message,
            attributes: precondition,
          },
        });
      }
      // Prime the datasource registry on a cold boot — same reason
      // `_reconcile` does it. `_recover` already gets this through
      // `buildAdoptionDeployContext`, but `_orphans` skips that path
      // (it delegates straight to the reconciler), so it needs its own
      // call before the reconciler reads the registry.
      if (discoveryService) {
        await discoveryService.ensure(ctx as SloHandlerContext);
      }
      const result = await handleListOrphans(
        reconciler as SloReconcilerLite | undefined,
        req.query.datasourceId,
        logger
      );
      if (result.status === 200) return res.ok({ body: result.body });
      return res.customError({
        statusCode: result.status,
        body: {
          message: String((result.body as { error?: string }).error ?? 'List orphans failed'),
          attributes: result.body as Record<string, unknown>,
        },
      });
    }
  );

  // --------------------------------------------------------------------------
  // POST /api/observability/v1/slos/_recover
  // --------------------------------------------------------------------------
  const recoverBody = schema.object({
    sloId: schema.string({ minLength: 1 }),
    datasourceId: schema.string({ minLength: 1 }),
    workspaceId: schema.maybe(schema.string()),
    acknowledgeTombstone: schema.maybe(schema.boolean()),
  });

  router.post(
    {
      path: `${SLO_BASE}/_recover`,
      validate: { body: recoverBody },
    },
    async (ctx, req, res) => {
      const precondition = buildPreconditionFailure(ruleDedupEnabled, ruleAdoptionEnabled);
      if (precondition) {
        return res.customError({
          statusCode: 412,
          body: {
            message: precondition.message,
            attributes: precondition,
          },
        });
      }
      const input: RecoverSloInputLite = {
        sloId: req.body.sloId,
        datasourceId: req.body.datasourceId,
        workspaceId: req.body.workspaceId,
        acknowledgeTombstone: req.body.acknowledgeTombstone,
      };
      let deploy: SloDeployContext;
      try {
        deploy = await buildAdoptionDeployContext(
          ctx as SloHandlerContext,
          input.datasourceId,
          input.workspaceId,
          rulerClient,
          datasourceService,
          discoveryService
        );
      } catch (e) {
        if (e instanceof SloValidationError) {
          return res.customError({
            statusCode: 400,
            body: {
              message: 'Validation failed',
              attributes: { error: 'Validation failed', errors: e.errors },
            },
          });
        }
        throw e;
      }
      const result = await handleRecoverSlo(adoptionService, input, deploy, logger);
      if (result.status === 200) return res.ok({ body: result.body });
      return res.customError({
        statusCode: result.status,
        body: {
          message: String((result.body as { error?: string }).error ?? 'Recover failed'),
          attributes: result.body as Record<string, unknown>,
        },
      });
    }
  );
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Server-side per-service SLO health aggregate. Collapses what the browser
 * previously did with an `apiClient.list` fan-out into a single round-trip:
 * the client sends a services CSV + datasource id, the server loads the
 * relevant SLO summaries once, rolls them up per service with the shared
 * `rollupSloHealth` classifier, and returns `{ bySvc: Record<svc, bucket> }`.
 *
 * Sharing `common/slo/classifier.ts` with the client keeps both surfaces
 * producing identical shapes, so the client-side fallback (on 404 from an
 * older OSD server) renders the same UI as the primary path.
 */

import { schema } from '@osd/config-schema';
import type { IRouter, Logger, RequestHandlerContext } from '../../../../../src/core/server';
import { OBSERVABILITY_BASE } from '../../../common/constants/shared';
import { rollupSloHealth } from '../../../common/slo/classifier';
import type {
  SloAggregateBucket,
  SloAggregateResponse,
  SloListFilters,
} from '../../../common/slo/slo_types';
import type { SloService, SloStatusAggregationContext } from '../../../common/slo/slo_service';
import type { AlertingOSClient } from '../../../common/types/alerting';
import type { InMemoryDatasourceService } from '../../services/alerting/datasource_service';
import type { DatasourceDiscoveryService } from '../../services/alerting/datasource_discovery';

type AggregateHandlerContext = RequestHandlerContext & {
  dataSource?: {
    opensearch: {
      getClient: (id: string) => Promise<AlertingOSClient>;
    };
  };
};

const AGGREGATE_PATH = `${OBSERVABILITY_BASE}/v1/slos/_aggregate`;

/** Hard cap. The wizard and listing pages don't approach this in practice. */
export const MAX_SERVICES_PER_AGGREGATE_CALL = 200;

/**
 * Pure helper: given a flat list of summaries and the caller's services set,
 * produce the per-service envelope shape the route ships over the wire.
 * Factored out so the jest unit tests can drive the rollup directly without
 * spinning up a router.
 */
export function buildAggregateResponse(
  serviceNames: string[],
  summaries: Parameters<typeof rollupSloHealth>[1]
): SloAggregateResponse {
  const { bySvc } = rollupSloHealth(serviceNames, summaries);
  const out: Record<string, SloAggregateBucket> = {};
  for (const name of serviceNames) {
    const bucket = bySvc.get(name);
    out[name] = bucket
      ? {
          total: bucket.total,
          ok: bucket.ok,
          warning: bucket.warning,
          breached: bucket.breached,
          noData: bucket.noData,
          stale: bucket.stale,
          disabled: bucket.disabled,
          rulesMissing: bucket.rulesMissing,
          hasAvailability: bucket.hasAvailability,
          hasLatency: bucket.hasLatency,
          missingCanonicalPair: bucket.missingCanonicalPair,
          slos: bucket.slos,
        }
      : {
          total: 0,
          ok: 0,
          warning: 0,
          breached: 0,
          noData: 0,
          stale: 0,
          disabled: 0,
          rulesMissing: 0,
          hasAvailability: false,
          hasLatency: false,
          missingCanonicalPair: true,
          slos: [],
        };
  }
  return { bySvc: out };
}

export function registerSloAggregateRoute(
  router: IRouter,
  sloService: SloService,
  logger: Logger,
  buildStatusContext: (
    ctx: AggregateHandlerContext,
    req?: import('../../../../../src/core/server').OpenSearchDashboardsRequest
  ) => SloStatusAggregationContext | undefined,
  datasourceService?: InMemoryDatasourceService,
  discoveryService?: DatasourceDiscoveryService
): void {
  router.get(
    {
      path: AGGREGATE_PATH,
      validate: {
        query: schema.object({
          services: schema.string({ minLength: 1 }),
          datasourceId: schema.string({ minLength: 1 }),
        }),
      },
    },
    async (ctx, req, res) => {
      const services = req.query.services
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (services.length === 0) {
        return res.customError({
          statusCode: 400,
          body: { message: 'services parameter must contain at least one service name' },
        });
      }
      if (services.length > MAX_SERVICES_PER_AGGREGATE_CALL) {
        return res.customError({
          statusCode: 400,
          body: {
            message: `services parameter exceeds cap of ${MAX_SERVICES_PER_AGGREGATE_CALL} (got ${services.length})`,
          },
        });
      }

      // Resolve the datasource the same way probe-sli does so an unknown
      // datasource id returns a clean 400 instead of leaking a generic 500
      // (and so the listing path can't be coerced into reading SLOs from a
      // datasource the caller doesn't have access to).
      let resolvedDsName = req.query.datasourceId;
      if (datasourceService) {
        if (discoveryService) {
          await discoveryService.ensure(ctx as AggregateHandlerContext);
        }
        const ds = await datasourceService.get(req.query.datasourceId);
        if (!ds) {
          return res.customError({
            statusCode: 400,
            body: { message: `Datasource "${req.query.datasourceId}" is not registered.` },
          });
        }
        // SLO docs persist `spec.datasourceId = ds.name` (see
        // `SloService.create`). Filter the list with the canonical name so
        // requests using the volatile `ds-N` id still return the right rows.
        resolvedDsName = ds.name;
      }

      try {
        const filters: SloListFilters = {
          service: services,
          datasourceId: [resolvedDsName],
        };
        const statusCtx = buildStatusContext(ctx as AggregateHandlerContext, req);
        // Use `list` (not `getPaginated`) so the server's 100-row pageSize
        // cap doesn't silently truncate the rollup. Customer SLO counts per
        // service stay well within a single sweep (see `classifier.ts` —
        // canonical pair is 2 availability + 2 latency per service, so even
        // at 200 services we're under 800 rows).
        const summaries = await sloService.list(filters, statusCtx, req);
        const body = buildAggregateResponse(services, summaries);
        return res.ok({ body });
      } catch (e) {
        logger.error(`SLO aggregate route failed: ${e instanceof Error ? e.message : String(e)}`);
        return res.customError({
          statusCode: 500,
          body: { message: e instanceof Error ? e.message : 'Aggregate failed' },
        });
      }
    }
  );
}

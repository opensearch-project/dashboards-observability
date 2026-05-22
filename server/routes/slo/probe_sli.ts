/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Probe-SLI route — wizard dry-run of an SLI's good/total queries against
 * the target Prometheus backend. Answers "does this PromQL actually match
 * series?" before the user clicks Create and discovers the answer minutes
 * later via `no_data` on the listing.
 *
 * Deliberately small and query-level: the client already holds the full
 * spec; we only need two opaque PromQL strings + a lookback window. Queries
 * are routed through the same `DirectQueryPrometheusBackend` the status
 * aggregator uses so a healthy probe implies the deployed rules will scrape
 * the same series.
 *
 * Response shape privileges partial success: per-query errors go into
 * `errors.{good,total}` and a failing side does not mask a passing one.
 */

import { schema } from '@osd/config-schema';
import type { IRouter, Logger, RequestHandlerContext } from '../../../../../src/core/server';
import { OBSERVABILITY_BASE } from '../../../common/constants/shared';
import type { AlertingOSClient, Datasource } from '../../../common/types/alerting';
import { PROMQL_SIZE_CAP, validateCustomPromQL } from '../../../common/slo/slo_validators';
import type { InMemoryDatasourceService } from '../../services/alerting/datasource_service';
import type { DatasourceDiscoveryService } from '../../services/alerting/datasource_discovery';
import type { DirectQueryPrometheusBackend } from '../../services/alerting/directquery_prometheus_backend';

type ProbeSliHandlerContext = RequestHandlerContext & {
  dataSource?: {
    opensearch: {
      getClient: (id: string) => Promise<AlertingOSClient>;
    };
  };
};

const PROBE_BASE = `${OBSERVABILITY_BASE}/v1/slos/probe-sli`;

/** Lookback → seconds. Fixed set so the schema stays closed. */
const LOOKBACK_SECONDS: Record<'1h' | '24h' | '7d', number> = {
  '1h': 60 * 60,
  '24h': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
};

/** Sparkline point budget — caps the range-query step so the server doesn't
 *  return a dense series by accident. */
const SAMPLE_POINT_COUNT = 20;

/** Per-query timeout (ms). A blown probe budget shouldn't block the wizard. */
const QUERY_TIMEOUT_MS = 5000;

const probeBody = schema.object({
  datasourceId: schema.string({ minLength: 1 }),
  goodQuery: schema.string({ minLength: 1, maxLength: PROMQL_SIZE_CAP }),
  totalQuery: schema.string({ minLength: 1, maxLength: PROMQL_SIZE_CAP }),
  lookback: schema.maybe(
    schema.oneOf([schema.literal('1h'), schema.literal('24h'), schema.literal('7d')])
  ),
});

interface ProbeSamplePoint {
  t: number;
  v: number;
}

interface ProbeSliResponse {
  goodCount?: number;
  totalCount?: number;
  sliRatio?: number;
  samplePoints?: ProbeSamplePoint[];
  emptyVector?: boolean;
  errors?: { good?: string; total?: string };
}

/**
 * Race a promise against a timeout so the route returns to the wizard fast
 * even if the upstream Prometheus query is slow. The promise this races is
 * already plumbed with `requestTimeoutMs` so the OS client aborts the
 * underlying HTTP socket on its own — the local timer is the safety net for
 * the case where the transport's timer mechanism never fires (e.g. resolved
 * locally by an upstream proxy that holds the connection open). In that
 * worst case the route still returns; the upstream socket is freed when the
 * OS client's timeout cancels it shortly after.
 */
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    // @ts-expect-error timer is assigned synchronously inside the Promise constructor
    clearTimeout(timer);
  }
}

/**
 * Resolve a datasource by logical id → the Datasource record the backend
 * operates on. Mirrors the status-aggregator / deploy-context resolution
 * path, hydrating the in-memory registry from OSD saved objects first so a
 * cold-start probe doesn't spuriously miss a present datasource.
 */
async function resolveDatasource(
  ctx: ProbeSliHandlerContext,
  datasourceId: string,
  datasourceService: InMemoryDatasourceService | undefined,
  discoveryService: DatasourceDiscoveryService | undefined
): Promise<{ ds: Datasource; client: AlertingOSClient } | { error: string }> {
  if (!datasourceService) {
    return { error: 'Datasource service is not available on this server' };
  }
  if (discoveryService) {
    await discoveryService.ensure(ctx);
  }
  const ds = await datasourceService.get(datasourceId);
  if (!ds) {
    return { error: `Datasource "${datasourceId}" is not registered.` };
  }
  if (!ds.directQueryName) {
    return {
      error: `Datasource "${ds.name}" is not a DirectQuery Prometheus connection.`,
    };
  }
  const client: AlertingOSClient =
    ds.mdsId && ctx.dataSource
      ? await ctx.dataSource.opensearch.getClient(ds.mdsId)
      : ctx.core.opensearch.client.asCurrentUser;
  return { ds: ds as Datasource, client };
}

/**
 * Sum the point-in-time values across every series Prometheus returned. An
 * instant query over a bare `sum(rate(...))` returns one series, but we sum
 * defensively in case the user's PromQL happens to emit multiple.
 */
function reduceInstant(points: Array<{ value: number }>): { count: number; vectorEmpty: boolean } {
  if (points.length === 0) return { count: 0, vectorEmpty: true };
  let total = 0;
  for (const p of points) total += p.value;
  return { count: total, vectorEmpty: false };
}

export function registerProbeSliRoute(
  router: IRouter,
  logger: Logger,
  prometheusBackend: DirectQueryPrometheusBackend,
  datasourceService?: InMemoryDatasourceService,
  discoveryService?: DatasourceDiscoveryService
) {
  router.post({ path: PROBE_BASE, validate: { body: probeBody } }, async (ctx, req, res) => {
    const { datasourceId, goodQuery, totalQuery } = req.body;
    const lookback = (req.body.lookback ?? '1h') as '1h' | '24h' | '7d';

    // Run the same shape check the wizard runs so the probe and create paths
    // reject the same class of input. Without this, a client could DoS the
    // upstream Prometheus by submitting unbalanced / control-char-laden
    // PromQL the create path would have rejected.
    const goodErr = validateCustomPromQL(goodQuery);
    const totalErr = validateCustomPromQL(totalQuery);
    if (goodErr || totalErr) {
      const fieldErrors: Record<string, string> = {};
      if (goodErr) fieldErrors.goodQuery = goodErr;
      if (totalErr) fieldErrors.totalQuery = totalErr;
      return res.customError({
        statusCode: 400,
        body: {
          message: goodErr ?? totalErr ?? 'Invalid PromQL',
          attributes: { fieldErrors },
        },
      });
    }

    const resolved = await resolveDatasource(
      ctx as ProbeSliHandlerContext,
      datasourceId,
      datasourceService,
      discoveryService
    );
    if ('error' in resolved) {
      return res.customError({
        statusCode: 400,
        body: {
          message: resolved.error,
          attributes: { error: resolved.error },
        },
      });
    }
    const { ds } = resolved;

    const windowSeconds = LOOKBACK_SECONDS[lookback];
    const endSec = Math.floor(Date.now() / 1000);
    const startSec = endSec - windowSeconds;
    // Range step — 20 evenly-spaced points. Floor so we never overshoot the
    // point budget; clamp to >= 1s for Prometheus validity.
    const stepSec = Math.max(1, Math.floor(windowSeconds / SAMPLE_POINT_COUNT));

    const errors: { good?: string; total?: string } = {};

    // Instant counts (good + total) — fan out in parallel. Each side is
    // timeout-guarded and any throw becomes a per-query error string. The
    // `time` argument is required by the SQL plugin's PrometheusQueryHandler
    // (it rejects instant requests without one), so pass endSec explicitly.
    // `requestTimeoutMs` is forwarded to the search strategy as a per-query
    // timeout hint; the local `withTimeout` race remains the safety net for
    // the upstream socket.
    const [goodInstant, totalInstant] = await Promise.all([
      withTimeout(
        prometheusBackend.queryInstant(ctx, ds, goodQuery, endSec, {
          requestTimeoutMs: QUERY_TIMEOUT_MS,
        }),
        QUERY_TIMEOUT_MS,
        'good-query instant'
      ).catch((e) => {
        errors.good = e instanceof Error ? e.message : String(e);
        logger.debug(`probe-sli good instant failed: ${errors.good}`);
        return null;
      }),
      withTimeout(
        prometheusBackend.queryInstant(ctx, ds, totalQuery, endSec, {
          requestTimeoutMs: QUERY_TIMEOUT_MS,
        }),
        QUERY_TIMEOUT_MS,
        'total-query instant'
      ).catch((e) => {
        errors.total = e instanceof Error ? e.message : String(e);
        logger.debug(`probe-sli total instant failed: ${errors.total}`);
        return null;
      }),
    ]);

    // Sparkline uses the ratio `good / total` — a single series the user
    // can read as "did SLI move over the window". Range-query the ratio
    // rather than good alone so the chart reflects what the SLO records.
    const ratioRangeQuery = `(${goodQuery}) / (${totalQuery})`;
    const rangePoints = await withTimeout(
      prometheusBackend.queryRange(ctx, ds, ratioRangeQuery, startSec, endSec, stepSec, {
        requestTimeoutMs: QUERY_TIMEOUT_MS,
      }),
      QUERY_TIMEOUT_MS,
      'ratio range'
    ).catch((e) => {
      logger.debug(`probe-sli ratio range failed: ${e instanceof Error ? e.message : e}`);
      // Sparkline failure alone shouldn't populate `errors.{good,total}` —
      // those are reserved for per-query PromQL diagnostics the UI shows
      // in-line on the respective query field.
      return null;
    });

    const response: ProbeSliResponse = {};
    if (goodInstant !== null) {
      const { count, vectorEmpty } = reduceInstant(goodInstant);
      response.goodCount = count;
      if (totalInstant !== null) {
        const t = reduceInstant(totalInstant);
        response.totalCount = t.count;
        // `emptyVector` captures both "no series from either side" and
        // "zero denominator" — both imply the SLI will record `no_data`
        // once deployed.
        const anyEmpty = vectorEmpty || t.vectorEmpty || t.count === 0;
        response.emptyVector = anyEmpty;
        if (!anyEmpty) {
          const ratio = count / t.count;
          response.sliRatio = Math.max(0, Math.min(1, ratio));
        }
      }
    } else if (totalInstant !== null) {
      response.totalCount = reduceInstant(totalInstant).count;
    }

    if (rangePoints && rangePoints.length > 0) {
      response.samplePoints = rangePoints
        .slice(0, SAMPLE_POINT_COUNT)
        .map((p) => ({ t: p.timestamp, v: Number.isFinite(p.value) ? p.value : 0 }));
    }

    if (Object.keys(errors).length > 0) {
      response.errors = errors;
    }

    return res.ok({ body: response });
  });
}

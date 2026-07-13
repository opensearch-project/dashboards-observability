/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Probe-SLI route — wizard dry-run of an SLI's good/total queries, so the user
 * learns "does this PromQL match any series?" before Create rather than via
 * `no_data` later. Routes through the same `DirectQueryPrometheusBackend` the
 * status aggregator uses, so a healthy probe implies the deployed rules will
 * scrape the same series. Partial success: per-query errors go into
 * `errors.{good,total}`; a failing side doesn't mask a passing one.
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
 * Race a promise against a timeout so the route returns fast even when the
 * upstream query stalls. The query is already plumbed with `requestTimeoutMs`
 * (the OS client aborts its own socket); this local timer is the safety net
 * for when that transport timer never fires (e.g. a proxy holding the
 * connection open).
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
 * Resolve a datasource id → the Datasource record the backend operates on.
 * Hydrates the in-memory registry from saved objects first so a cold-start
 * probe doesn't spuriously miss a present datasource.
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

/** Latest finite point of a single series, or null when it carried none. */
function latestFinite(points: Array<{ timestamp: number; value: number }>): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    if (Number.isFinite(points[i].value)) return points[i].value;
  }
  return null;
}

/**
 * Reduce a multi-series range result to one count by SUMMING each series'
 * most-recent finite point. Summing (vs. keeping only the first series) is
 * what stops an un-aggregated good/total query — one series per dimension
 * value — from under-reporting. Ranging over the lookback rather than an
 * instant lets a slow counter's `rate(metric[5m])` return a value instead of
 * an empty vector. Returns `vectorEmpty: true` when no series had any finite
 * point (→ the SLI would record `no_data`).
 */
function reduceRange(
  series: Array<{ values: Array<{ timestamp: number; value: number }> }> | null
): { count: number; vectorEmpty: boolean } {
  if (!series || series.length === 0) return { count: 0, vectorEmpty: true };
  let sum = 0;
  let anyFinite = false;
  for (const s of series) {
    const v = latestFinite(s.values || []);
    if (v !== null) {
      sum += v;
      anyFinite = true;
    }
  }
  if (!anyFinite) return { count: 0, vectorEmpty: true };
  return { count: sum, vectorEmpty: false };
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

    // Same shape check as create, so the probe can't be used to push PromQL
    // (unbalanced / control-char-laden) the create path would reject.
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

    // Good + total counts over the lookback range, in parallel. The matrix
    // variant is required so multi-series queries are summed in `reduceRange`
    // (the single-series `queryRange` keeps only `result[0]`). Each side is
    // timeout-guarded; a throw becomes a per-query error the UI shows inline.
    const [goodRange, totalRange] = await Promise.all([
      withTimeout(
        prometheusBackend.queryRangeMatrix(ctx, ds, goodQuery, startSec, endSec, stepSec, {
          requestTimeoutMs: QUERY_TIMEOUT_MS,
          sourceRequest: req,
        }),
        QUERY_TIMEOUT_MS,
        'good-query range'
      ).catch((e) => {
        errors.good = e instanceof Error ? e.message : String(e);
        logger.debug(`probe-sli good range failed: ${errors.good}`);
        return null;
      }),
      withTimeout(
        prometheusBackend.queryRangeMatrix(ctx, ds, totalQuery, startSec, endSec, stepSec, {
          requestTimeoutMs: QUERY_TIMEOUT_MS,
          sourceRequest: req,
        }),
        QUERY_TIMEOUT_MS,
        'total-query range'
      ).catch((e) => {
        errors.total = e instanceof Error ? e.message : String(e);
        logger.debug(`probe-sli total range failed: ${errors.total}`);
        return null;
      }),
    ]);

    // Sparkline ranges the ratio `good / total` so the chart reflects what
    // the SLO actually records over the window.
    const ratioRangeQuery = `(${goodQuery}) / (${totalQuery})`;
    const rangePoints = await withTimeout(
      prometheusBackend.queryRange(ctx, ds, ratioRangeQuery, startSec, endSec, stepSec, {
        requestTimeoutMs: QUERY_TIMEOUT_MS,
        sourceRequest: req,
      }),
      QUERY_TIMEOUT_MS,
      'ratio range'
    ).catch((e) => {
      logger.debug(`probe-sli ratio range failed: ${e instanceof Error ? e.message : e}`);
      // Sparkline failure doesn't touch `errors.{good,total}` (reserved for
      // per-query diagnostics shown inline on each query field).
      return null;
    });

    const response: ProbeSliResponse = {};
    if (goodRange !== null) {
      const { count, vectorEmpty } = reduceRange(goodRange);
      response.goodCount = count;
      if (totalRange !== null) {
        const t = reduceRange(totalRange);
        response.totalCount = t.count;
        // `emptyVector` covers both "no series" and "zero denominator" — both
        // mean the deployed SLI would record `no_data`.
        const anyEmpty = vectorEmpty || t.vectorEmpty || t.count === 0;
        response.emptyVector = anyEmpty;
        if (!anyEmpty) {
          const ratio = count / t.count;
          response.sliRatio = Math.max(0, Math.min(1, ratio));
        }
      }
    } else if (totalRange !== null) {
      response.totalCount = reduceRange(totalRange).count;
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

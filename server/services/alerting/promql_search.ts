/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Adapter that routes PromQL execution through the data plugin's search
 * service via `strategy: 'PROMQL'` (registered by the query-enhancements
 * plugin) instead of crafting a raw POST against
 * `/_plugins/_directquery/_query/{dqName}`.
 *
 * The strategy returns an `IDataFrameResponse` whose payload is a flat row
 * table (Time / Series / Labels / Value). Status-aggregator and
 * probe-sli still consume the original DirectQuery envelope shape
 * (`{ resultType, result: [{ metric, value | values }] }`), so this module
 * reconstructs that shape on the way out — keeping
 * `parseInstantResponseWithNonFinite`, `parseRangeQueryResponse`, and
 * `reduceInstant` untouched.
 *
 * Reconstruction notes (intentional, since `createDataFrame` controls the
 * row format):
 *   - `Series` is `formatMetricLabels(metric)` (single-query) — i.e.
 *     `{__name__="...", k1="v1", k2="v2"}` with the keys sorted. The leading
 *     metric name lives ONLY there (the row's `Labels` map drops `__name__`),
 *     so we pull `__name__` out of `Series` and merge it back into the
 *     reconstructed `metric` map. `Series` precedes any `: ` query-label
 *     prefix only in multi-query mode; we always issue single-query requests
 *     here, so the prefix doesn't apply.
 *   - `Number(value)` in the strategy preserves NaN / Infinity as JS NaN;
 *     we pass it through as a string so downstream parsers can apply their
 *     own finite-vs-non-finite logic. That's how `parseInstantResponseWithNonFinite`
 *     distinguishes "rule fires NaN" (`source_idle`) from "ruler returned
 *     nothing" (`no_data`).
 */

import type {
  OpenSearchDashboardsRequest,
  RequestHandlerContext,
  StartServicesAccessor,
} from '../../../../../src/core/server';
import type { IDataFrameResponse } from '../../../../../src/plugins/data/common';
import type { ISearchStart } from '../../../../../src/plugins/data/server';

/**
 * Hard-coded to match `SEARCH_STRATEGY.PROMQL` in
 * `src/plugins/query_enhancements/common/constants.ts`. We don't import that
 * value so this plugin doesn't take a `requiredPlugins` (or even
 * `optionalPlugins`) entry on `queryEnhancements` for a single string — the
 * data plugin's strategy registry is what's actually called at runtime, and
 * `queryEnhancements` registers the `promql` strategy at its own setup.
 */
const PROMQL_STRATEGY = 'promql';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Minimum start-services *deps map* contract the alerting and SLO surfaces
 * need to route PromQL through the search-strategy registry. Captured
 * behind a deferred accessor so plugin setup doesn't block on a `start`
 * dependency. The shape mirrors what
 * `core.getStartServices()` resolves with as the second tuple element —
 * an object keyed by required-plugin id, here narrowed to just the `data`
 * plugin's `search` contract.
 */
export interface PromQLStartDepsLike {
  data: { search: Pick<ISearchStart, 'search'> };
}

export interface PromQLSearchOptions {
  /**
   * MDS saved-object id when the datasource is multi-data-source–scoped.
   * Mirrors the `request.dataSourceId` channel the
   * `prometheusManager.initializeDefaultQueryExecutor` query executor reads
   * to pick between `context.dataSource.opensearch.legacy.getClient(...)`
   * and the in-process scoped client.
   */
  dataSourceId?: string;
  /** Maps to the strategy's `timeout` (seconds) per-query budget. */
  timeoutSeconds?: number;
  /**
   * The originating inbound request, forwarded opaquely so the `promql`
   * strategy's datasource client can derive the caller's auth from it.
   * Server-initiated reads (SLO status aggregator, probe-sli, alert preview,
   * historical-alert matrix) construct a *synthetic* request to hold the
   * PromQL `body`; the synthetic request alone has none of the inbound auth
   * context. We don't inspect this — whatever the datasource client reads off
   * the request (auth `headers`, `request.auth`, etc.) travels untouched.
   *
   * Note: `buildSearchRequest` shallow-spreads this into a plain object, so the
   * result is not an `instanceof OpenSearchDashboardsRequest`. The request's
   * own-enumerable fields (`headers`, `auth`, …) are preserved, which is what
   * the DirectQuery datasource client reads; but core's `asScoped` treats a
   * non-branded request as header-less and won't re-run `getAuthHeaders`. That
   * is acceptable here: the forwarded raw `headers`/`auth` are what the
   * datasource client needs, and forwarding the whole request (rather than
   * cherry-picking `headers`) keeps every field present so we don't regress as
   * that client evolves. Override is limited to `body` / `dataSourceId`. Omit
   * for callers (tests / non-scoped deployments) with no request to forward.
   */
  sourceRequest?: OpenSearchDashboardsRequest;
}

export interface PromQLInstantArgs extends PromQLSearchOptions {
  /** DirectQuery datasource name (the SQL plugin's `dataconnection` id). */
  dqName: string;
  /** PromQL expression to evaluate. */
  query: string;
  /** Evaluation time in epoch seconds. The strategy requires this. */
  timeSec: number;
}

export interface PromQLRangeArgs extends PromQLSearchOptions {
  dqName: string;
  query: string;
  startSec: number;
  endSec: number;
  stepSec: number;
}

/**
 * `parseInstantResponseWithNonFinite` and `extractPrometheusResult` already
 * understand this shape — keep the adapter's output identical so downstream
 * parsers stay unchanged.
 */
export interface DirectQueryEnvelope {
  results: {
    [datasourceName: string]: {
      resultType: 'matrix' | 'vector' | 'scalar' | 'string';
      result: Array<{
        metric: Record<string, string>;
        value?: [number, string];
        values?: Array<[number, string]>;
      }>;
    };
  };
}

// ---------------------------------------------------------------------------
// Searcher injection — set during plugin start
// ---------------------------------------------------------------------------

/**
 * Bound at plugin start via `setPromQLSearcher`. We intentionally don't
 * capture `core.getStartServices` at module scope because tests need to
 * stub the searcher without dragging in the data plugin.
 */
let cachedSearcher: PromQLSearcher | undefined;

/** Function shape that matches `data.search.search`. */
export type PromQLSearcher = (
  context: RequestHandlerContext,
  request:
    | OpenSearchDashboardsRequest
    | {
        dataSourceId?: string;
        body: unknown;
        [k: string]: unknown;
      },
  options: { strategy: string }
) => Promise<IDataFrameResponse>;

/** Test seam — clears the cached searcher between Jest cases. */
export function resetPromQLSearcherForTests(): void {
  cachedSearcher = undefined;
}

/** Direct injection (used by both prod wiring and tests). */
export function setPromQLSearcher(searcher: PromQLSearcher | undefined): void {
  cachedSearcher = searcher;
}

/**
 * Wire the searcher from the data plugin's start contract via the
 * accessor. The first prom-query after start lazily resolves it; we cache
 * the search function so subsequent calls don't re-await.
 */
export function bindPromQLSearcherFromStartServices<TDeps extends PromQLStartDepsLike>(
  getStartServices: StartServicesAccessor<{}, TDeps>
): void {
  setPromQLSearcher(async (ctx, request, options) => {
    const [, deps] = await getStartServices();
    return deps.data.search.search(
      ctx,
      // Cast through the accepted `IOpenSearchDashboardsSearchRequest`
      // shape — the strategy reads `body` and `dataSourceId` off the
      // request object directly, which our literal already provides.
      request as Parameters<TDeps['data']['search']['search']>[1],
      options
    );
  });
}

function getSearcher(): PromQLSearcher {
  if (!cachedSearcher) {
    throw new Error(
      'PromQL searcher not bound. Call setPromQLSearcher / bindPromQLSearcherFromStartServices ' +
        'during plugin start before issuing PromQL queries.'
    );
  }
  return cachedSearcher;
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export async function runPromQLInstant(
  ctx: RequestHandlerContext,
  args: PromQLInstantArgs
): Promise<DirectQueryEnvelope> {
  const request = buildSearchRequest(args.dqName, args.query, args.dataSourceId, {
    options: { queryType: 'INSTANT', time: args.timeSec.toString() },
    timeoutSeconds: args.timeoutSeconds,
    sourceRequest: args.sourceRequest,
  });
  const response = await getSearcher()(ctx, request, { strategy: PROMQL_STRATEGY });
  return rebuildEnvelope(response, args.dqName, /* isRange */ false);
}

export async function runPromQLRange(
  ctx: RequestHandlerContext,
  args: PromQLRangeArgs
): Promise<DirectQueryEnvelope> {
  const request = buildSearchRequest(args.dqName, args.query, args.dataSourceId, {
    options: { step: args.stepSec },
    timeRange: { from: args.startSec.toString(), to: args.endSec.toString() },
    timeoutSeconds: args.timeoutSeconds,
    sourceRequest: args.sourceRequest,
  });
  const response = await getSearcher()(ctx, request, { strategy: PROMQL_STRATEGY });
  return rebuildEnvelope(response, args.dqName, /* isRange */ true);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function buildSearchRequest(
  dqName: string,
  query: string,
  dataSourceId: string | undefined,
  extras: {
    options?: Record<string, unknown>;
    timeRange?: { from: string; to: string };
    timeoutSeconds?: number;
    sourceRequest?: OpenSearchDashboardsRequest;
  }
): {
  dataSourceId?: string;
  body: Record<string, unknown>;
  [k: string]: unknown;
} {
  const body: Record<string, unknown> = {
    query: {
      query,
      language: 'PROMQL',
      dataset: { id: dqName, type: 'PROMETHEUS' },
      format: 'jdbc',
    },
  };
  if (extras.options) body.options = extras.options;
  if (extras.timeRange) body.timeRange = extras.timeRange;
  // The strategy hardcodes a 30s `timeout` today; keep the field on the
  // request for forward compatibility — when the strategy starts honoring
  // a per-request override (or when the executor passes through), this
  // value flows through without us having to revisit the call sites.
  if (extras.timeoutSeconds !== undefined) {
    (body.query as Record<string, unknown>).timeout = extras.timeoutSeconds;
  }
  // Spread the originating request first so all of its scoped-client context
  // (`headers`, `auth`, and anything else the deployment's client wrapper
  // reads) is present, then override `body` / `dataSourceId` with the
  // synthetic PromQL payload. The strategy reads `body` + `dataSourceId`; the
  // DirectQuery client wrapper reads `headers` + `auth` off the same object.
  // When no source request is supplied (tests / non-scoped deployments) the
  // result is just `{ body, dataSourceId? }` — `asScoped` tolerates a
  // header-less fake request.
  const request: { dataSourceId?: string; body: Record<string, unknown>; [k: string]: unknown } = {
    ...((extras.sourceRequest as unknown) as Record<string, unknown>),
    body,
  };
  if (dataSourceId) request.dataSourceId = dataSourceId;
  return request;
}

interface VizRow {
  Time: number;
  Series: string;
  Labels: Record<string, string>;
  Value: number;
}

/**
 * Pull rows out of the dataframe response. Returns `null` if the response
 * isn't a default dataframe (error / polling) so callers can degrade.
 */
function rowsFromResponse(response: IDataFrameResponse): VizRow[] | null {
  const body = (response as { body?: unknown }).body;
  if (!body || typeof body !== 'object') return null;
  const fields = (body as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return null;

  const fieldMap = new Map<string, unknown[]>();
  for (const f of fields) {
    if (
      f &&
      typeof f === 'object' &&
      typeof (f as { name?: unknown }).name === 'string' &&
      Array.isArray((f as { values?: unknown }).values)
    ) {
      fieldMap.set((f as { name: string }).name, (f as { values: unknown[] }).values);
    }
  }
  const time = fieldMap.get('Time') ?? [];
  const series = fieldMap.get('Series') ?? [];
  const labels = fieldMap.get('Labels') ?? [];
  const value = fieldMap.get('Value') ?? [];
  const rowCount = Math.min(time.length, series.length, labels.length, value.length);

  const out: VizRow[] = [];
  for (let i = 0; i < rowCount; i++) {
    out.push({
      Time: Number(time[i]),
      Series: typeof series[i] === 'string' ? (series[i] as string) : '',
      Labels:
        labels[i] && typeof labels[i] === 'object' ? (labels[i] as Record<string, string>) : {},
      Value: Number(value[i]),
    });
  }
  return out;
}

/**
 * `Series` is `formatMetricLabels(metric)` for a single-query response —
 * i.e. `{__name__="...", k="v"}`. We undo the bracket escaping the strategy
 * applies for Vega (`[` / `]`) and pull the `__name__` out. Other labels
 * are read off `row.Labels` directly to avoid re-parsing values that may
 * contain commas / quotes / equals.
 */
function nameFromSeries(series: string): string {
  if (!series) return '';
  const unescaped = series.replace(/\\\[/g, '[').replace(/\\]/g, ']');
  const match = unescaped.match(/__name__="([^"]*)"/);
  return match ? match[1] : '';
}

/**
 * Group rows back into per-series buckets keyed by (metricName + sorted
 * labels). The strategy already sorts label keys in `formatMetricLabels`
 * and emits one row per (timestamp × series), so we just rehydrate.
 */
function rebuildEnvelope(
  response: IDataFrameResponse,
  dqName: string,
  isRange: boolean
): DirectQueryEnvelope {
  const rows = rowsFromResponse(response);
  if (!rows) {
    return {
      results: {
        [dqName]: { resultType: isRange ? 'matrix' : 'vector', result: [] },
      },
    };
  }

  interface Bucket {
    metric: Record<string, string>;
    points: Array<[number, string]>;
  }
  const buckets = new Map<string, Bucket>();

  for (const row of rows) {
    const metricName = nameFromSeries(row.Series);
    // Sorted label key sequence keys identical metric label sets to the
    // same bucket — matches what `formatMetricLabels` already produced.
    const metric: Record<string, string> = { ...row.Labels };
    if (metricName) metric.__name__ = metricName;
    const bucketKey = stableMetricKey(metric);
    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = { metric, points: [] };
      buckets.set(bucketKey, bucket);
    }
    // The strategy stores Time as ms (`timeMs = timestamp * 1000`); the
    // DirectQuery wire format is seconds. Convert back so the existing
    // parsers (which expect seconds and re-multiply by 1000) stay
    // unchanged. NaN / Infinity round-trip as the literal strings the
    // parsers' `parseFloat(String(...))` already handles.
    const tsSec = Number.isFinite(row.Time) ? row.Time / 1000 : Number.NaN;
    bucket.points.push([tsSec, valueToWire(row.Value)]);
  }

  const result = Array.from(buckets.values()).map((b) => {
    if (isRange) {
      return { metric: b.metric, values: b.points };
    }
    // Instant: keep only the last point per series — matches Prometheus
    // vector semantics. Rows for an instant query should already collapse
    // to one per series (the strategy folds via `instantDataMap`), but be
    // defensive in case multiple slip through.
    const last = b.points[b.points.length - 1] ?? [0, 'NaN'];
    return { metric: b.metric, value: last };
  });

  return {
    results: {
      [dqName]: {
        resultType: isRange ? 'matrix' : 'vector',
        result,
      },
    },
  };
}

function stableMetricKey(metric: Record<string, string>): string {
  // Sort to match the strategy's own ordering so labels with the same
  // values key into the same bucket regardless of iteration order.
  return Object.entries(metric)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\x00');
}

function valueToWire(v: number): string {
  if (Number.isFinite(v)) return String(v);
  if (Number.isNaN(v)) return 'NaN';
  return v > 0 ? '+Inf' : '-Inf';
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PromQL builders for SLO visualizations.
 *
 * The SLI math itself comes from `common/slo/slo_promql_generator.ts`
 * (`buildErrorRatioExpr` / `buildSliEventQueries`), so the charts render
 * exactly what the recording rules record — there is no second copy to drift.
 *
 * Separated from `slo_visualizations.tsx` so the burn-rate panel and detail
 * page share one code path for turning an (SLO, objective, window) triple into
 * a runnable PromQL query.
 */

import type { Objective, SingleSli, SloDocument } from '../../../../../common/slo/slo_types';
import {
  SPAN_DERIVED_LATENCY_BUCKETS_SECONDS,
  buildErrorRatioExpr,
  buildSliEventQueries,
  effectiveMetricTemporality,
  ensureBucketMetric,
  ensureCountMetric,
  leValuePattern,
  substituteWindowToken,
} from '../../../../../common/slo/slo_promql_generator';

/** The SLO's single Prometheus SLI, or null when it can't be charted. */
function promSli(slo: SloDocument): SingleSli | null {
  if (slo.spec.sli.type !== 'single') return null;
  return slo.spec.sli.definition.backend === 'prometheus' ? slo.spec.sli : null;
}

function isDelta(sli: SingleSli): boolean {
  return effectiveMetricTemporality(sli) === 'delta';
}

/**
 * Builds the PromQL selector body for the given SLO. When `includeGoodFilter`
 * is true and the SLI definition carries a `goodEventsFilter`, that filter is
 * appended so `{...}` restricts to "good" events.
 *
 * Returns the content of `{...}` (no braces). Caller is responsible for
 * wrapping.
 */
export function buildSelectors(slo: SloDocument, includeGoodFilter: boolean): string {
  if (slo.spec.sli.type !== 'single') return '';
  const sli = slo.spec.sli;
  const parts = sli.dimensions.map(
    (d) => `${d.name}="${d.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  );
  if (includeGoodFilter && sli.definition.backend === 'prometheus') {
    const g = sli.definition.goodEventsFilter?.trim();
    if (g) parts.push(g);
  }
  return parts.join(', ');
}

/**
 * Error ratio over a configurable window — the generator's own
 * `buildErrorRatioExpr`, so the detail-page 5m chart and the burn-rate
 * panel's short/long window scalars chart exactly what the recording rules
 * record.
 */
export function buildErrorRatioExprForWindow(
  slo: SloDocument,
  objective: Objective,
  window: string
): string | null {
  const sli = promSli(slo);
  return sli ? buildErrorRatioExpr(sli, objective, window) : null;
}

/** Convenience — detail page's primary 5m query. */
export function buildErrorRatioQuery(slo: SloDocument, objective: Objective): string | null {
  return buildErrorRatioExprForWindow(slo, objective, '5m');
}

/** Good/total event counts over `window`; null for custom SLIs (unknown units). */
function eventCounts(
  slo: SloDocument,
  objective: Objective,
  window: string
): { good: string; total: string } | null {
  const sli = promSli(slo);
  if (!sli || sli.definition.type === 'custom') return null;
  const q = buildSliEventQueries(sli, objective, window, 'count');
  return q && !('errorRatio' in q) ? q : null;
}

/**
 * Raw "good events" count over a window. Used by the detail page's Events
 * stat to surface good/total alongside the ratio.
 *
 * Returns `null` for custom SLIs or when the SLI shape cannot emit a count —
 * callers render the Events card with em-dashes + "waiting for samples".
 */
export function buildGoodEventsCountQuery(
  slo: SloDocument,
  objective: Objective,
  window: string
): string | null {
  return eventCounts(slo, objective, window)?.good ?? null;
}

/**
 * Raw "total events" count over a window. Pairs with
 * `buildGoodEventsCountQuery` so the UI can show `good / total · ratio%`.
 */
export function buildTotalEventsCountQuery(
  slo: SloDocument,
  objective: Objective,
  window: string
): string | null {
  return eventCounts(slo, objective, window)?.total ?? null;
}

/**
 * "Any-data" coverage probe — a PromQL expression that returns a non-empty
 * vector when the SLI's source metric has *any* matching series in the
 * datasource, regardless of whether the current chart window is populated.
 *
 * Subtlety: `sum(<metric>{<sel>})` over an empty selector yields `0`, not an
 * empty vector. That would mask the "no matching series" case. To avoid the
 * false positive we probe the *raw* selector (no aggregation) for availability
 * / latency SLIs, and for custom SLIs we require a nonzero value over a
 * lookback window — stale zero is treated as "metric missing from operator's
 * point of view".
 *
 *   - availability: `count(last_over_time(<metric>{<dim>}[1h]))`
 *   - latency:      `count(last_over_time(<count series>{<dim>}[1h]))`
 *   - custom:       `(max_over_time((<totalQuery>)[1h:5m])) > 0`
 *
 * Returns `null` for SLIs where a probe can't be formed (composite, opensearch
 * backend, or custom without an expression).
 */
export function buildCoverageProbeQuery(slo: SloDocument, _objective: Objective): string | null {
  const sli = promSli(slo);
  if (!sli || sli.definition.backend !== 'prometheus') return null;
  const def = sli.definition;

  if (def.type === 'custom') {
    if (!def.customExpr) return null;
    const base =
      def.customExpr.mode === 'raw' ? def.customExpr.errorRatioQuery : def.customExpr.totalQuery;
    if (!base) return null;
    // `max_over_time(<expr>[1h:5m]) > 0` keeps the result vector only when
    // the expression produced a nonzero value in the last hour. An expression
    // whose selectors match nothing emits `sum=0` → filtered out; a real
    // traffic-backed service emits >0 at least once per hour → kept.
    return `(max_over_time((${substituteWindowToken(base, '5m')})[1h:5m])) > 0`;
  }

  const dim = buildSelectors(slo, false);
  if (def.type === 'availability') {
    if (!def.metric) return null;
    return `count(last_over_time(${def.metric}{${dim}}[1h]))`;
  }
  // latency_threshold — the count series exists for cumulative and delta
  // histograms alike.
  return `count(last_over_time(${ensureCountMetric(def.metric ?? '')}{${dim}}[1h]))`;
}

/** Request rate per second, evaluated with the SLI's dimensions. */
export function buildRequestRateQuery(slo: SloDocument): string | null {
  const sli = promSli(slo);
  if (!sli || sli.definition.backend !== 'prometheus') return null;
  const def = sli.definition;
  if (def.type === 'custom' || !def.metric) return null;
  const dim = buildSelectors(slo, false);
  const metric = def.type === 'availability' ? def.metric : ensureCountMetric(def.metric);
  // Delta gauges carry per-interval counts: sum the last 5m and divide.
  return isDelta(sli)
    ? `sum(sum_over_time(${metric}{${dim}}[5m])) / 300`
    : `sum(rate(${metric}{${dim}}[5m]))`;
}

/**
 * Histogram quantile query. `q` must be in [0, 1].
 *
 * `histogram_quantile` needs cumulative buckets. A delta (span-derived)
 * histogram's buckets are non-cumulative, so they're re-accumulated first:
 * one `le="<b>"` series per known bound = the sum of every bucket <= b, plus
 * `le="+Inf"` = the count.
 */
export function buildLatencyPercentileQuery(slo: SloDocument, q: number): string | null {
  const sli = promSli(slo);
  if (!sli || sli.definition.backend !== 'prometheus') return null;
  const def = sli.definition;
  if (def.type !== 'latency_threshold') return null;
  const bucket = ensureBucketMetric(def.metric ?? '');
  const dim = buildSelectors(slo, false);
  if (!isDelta(sli)) {
    return `histogram_quantile(${q}, sum(rate(${bucket}{${dim}}[5m])) by (le))`;
  }
  const sel = (extra: string) => (dim ? `${dim}, ${extra}` : extra);
  const cumulative = SPAN_DERIVED_LATENCY_BUCKETS_SECONDS.map((b, i, all) => {
    const le = all
      .slice(0, i + 1)
      .map(leValuePattern)
      .join('|');
    return `label_replace(sum(sum_over_time(${bucket}{${sel(
      `le=~"${le}"`
    )}}[5m])), "le", "${b}", "", "")`;
  });
  cumulative.push(
    `label_replace(sum(sum_over_time(${ensureCountMetric(
      def.metric ?? ''
    )}{${dim}}[5m])), "le", "+Inf", "", "")`
  );
  return `histogram_quantile(${q}, ${cumulative.join(' or ')})`;
}

/**
 * Cumulative error ratio from the start of the current SLO window to "now",
 * averaged across the full window. For rolling windows we approximate by
 * running the recorded error ratio over the configured window duration so the
 * chart smoothly rises as bad events accumulate.
 *
 * Returns null for calendar windows (P0 — not yet supported by rules) or when
 * the SLO cannot be queried.
 */
export function buildWindowErrorRatioQuery(slo: SloDocument, objective: Objective): string | null {
  if (slo.spec.window.type !== 'rolling') return null;
  return buildErrorRatioExprForWindow(slo, objective, slo.spec.window.duration);
}

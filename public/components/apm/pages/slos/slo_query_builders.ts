/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PromQL builders for SLO visualizations.
 *
 * Kept in sync with `common/slo/slo_promql_generator.ts` so the charts render
 * the same math the recording rules will emit. Any divergence leads to UI that
 * misrepresents alerting state — extend both files together.
 *
 * Separated from `slo_visualizations.tsx` so the burn-rate panel and detail
 * page share one code path for turning an (SLO, objective, window) triple into
 * a runnable PromQL query.
 */

import type { Objective, SloDocument } from '../../../../../common/slo/slo_types';

/** Prometheus counter suffix normalization — matches generator's ensureBucketMetric. */
function ensureBucketMetric(metric: string): string {
  const base = metric
    .replace(/_total$/, '')
    .replace(/_count$/, '')
    .replace(/_sum$/, '')
    .replace(/_bucket$/, '');
  return `${base}_bucket`;
}

function ensureCountMetric(metric: string): string {
  const base = metric
    .replace(/_total$/, '')
    .replace(/_count$/, '')
    .replace(/_sum$/, '')
    .replace(/_bucket$/, '');
  return `${base}_count`;
}

function formatLeBound(bound: number, unit: 'seconds' | 'milliseconds'): string {
  const seconds = unit === 'milliseconds' ? bound / 1000 : bound;
  return parseFloat(seconds.toPrecision(10)).toString();
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
 * Error ratio over a configurable window — same math as
 * `errorRatioExpr` in the generator but with the window passed in so the same
 * helper builds the detail-page 5m chart and the burn-rate panel's
 * short/long window scalars.
 */
export function buildErrorRatioExprForWindow(
  slo: SloDocument,
  objective: Objective,
  window: string
): string | null {
  if (slo.spec.sli.type !== 'single') return null;
  const def = slo.spec.sli.definition;
  if (def.backend !== 'prometheus') return null;

  if (def.type === 'custom') {
    if (!def.customExpr) return null;
    if (def.customExpr.mode === 'raw') return def.customExpr.errorRatioQuery;
    // Wrap each sub-expression in its own parens — PromQL `/` binds tighter
    // than `-`/`+`, so an unparenthesized `sum(a) - sum(b) / sum(c)` parses
    // as `sum(a) - (sum(b) / sum(c))` rather than the operator-intended
    // `(sum(a) - sum(b)) / sum(c)`. Seen in the wild: a goodQuery of
    // `sum(request) - sum(fault)` + totalQuery `sum(request)` produced an
    // errorRatio of `-1` (→ budget-remaining `20,100%`) when the real ratio
    // was `0`.
    return `1 - ((${def.customExpr.goodQuery}) / (${def.customExpr.totalQuery}))`;
  }

  const dim = buildSelectors(slo, false);
  const good = buildSelectors(slo, true);

  if (def.type === 'availability') {
    const metric = def.metric;
    if (!metric) return null;
    const counter = metric.endsWith('_total') ? metric : ensureCountMetric(metric);
    return (
      `1 - (\n` +
      `  sum(rate(${counter}{${good}}[${window}]))\n` +
      `  /\n` +
      `  sum(rate(${counter}{${dim}}[${window}]))\n` +
      `)`
    );
  }

  // latency_threshold
  const bucket = ensureBucketMetric(def.metric ?? '');
  const le = formatLeBound(objective.latencyThreshold ?? 0, def.latencyThresholdUnit ?? 'seconds');
  return (
    `1 - (\n` +
    `  sum(rate(${bucket}{${dim}, le="${le}"}[${window}]))\n` +
    `  /\n` +
    `  sum(rate(${bucket}{${dim}, le="+Inf"}[${window}]))\n` +
    `)`
  );
}

/** Convenience — detail page's primary 5m query. */
export function buildErrorRatioQuery(slo: SloDocument, objective: Objective): string | null {
  return buildErrorRatioExprForWindow(slo, objective, '5m');
}

/**
 * Raw "good events" count over a window. Returned as the PromQL expression
 * for `sum(increase(<counter>{good_selectors}[window]))`. Used by the detail
 * page's Events stat to surface good/total alongside the ratio.
 *
 * Returns `null` for custom SLIs or when the SLI shape cannot emit a count —
 * callers render the Events card with em-dashes + "waiting for samples".
 */
export function buildGoodEventsCountQuery(
  slo: SloDocument,
  objective: Objective,
  window: string
): string | null {
  if (slo.spec.sli.type !== 'single') return null;
  const def = slo.spec.sli.definition;
  if (def.backend !== 'prometheus') return null;
  if (def.type === 'custom') return null;

  const good = buildSelectors(slo, true);

  if (def.type === 'availability') {
    const metric = def.metric;
    if (!metric) return null;
    const counter = metric.endsWith('_total') ? metric : ensureCountMetric(metric);
    return `sum(increase(${counter}{${good}}[${window}]))`;
  }

  // latency_threshold: "good" = requests under the latency bucket bound.
  const bucket = ensureBucketMetric(def.metric ?? '');
  const dim = buildSelectors(slo, false);
  const le = formatLeBound(objective.latencyThreshold ?? 0, def.latencyThresholdUnit ?? 'seconds');
  return `sum(increase(${bucket}{${dim}, le="${le}"}[${window}]))`;
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
  if (slo.spec.sli.type !== 'single') return null;
  const def = slo.spec.sli.definition;
  if (def.backend !== 'prometheus') return null;
  if (def.type === 'custom') return null;

  const dim = buildSelectors(slo, false);

  if (def.type === 'availability') {
    const metric = def.metric;
    if (!metric) return null;
    const counter = metric.endsWith('_total') ? metric : ensureCountMetric(metric);
    return `sum(increase(${counter}{${dim}}[${window}]))`;
  }

  const bucket = ensureBucketMetric(def.metric ?? '');
  return `sum(increase(${bucket}{${dim}, le="+Inf"}[${window}]))`;
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
 *   - latency:      `count(last_over_time(<bucket>{<dim>, le="+Inf"}[1h]))`
 *   - custom:       `(max_over_time((<totalQuery>)[1h:5m])) > bool 0`
 *
 * Returns `null` for SLIs where a probe can't be formed (composite, opensearch
 * backend, or custom without an expression).
 */
export function buildCoverageProbeQuery(slo: SloDocument, _objective: Objective): string | null {
  if (slo.spec.sli.type !== 'single') return null;
  const def = slo.spec.sli.definition;
  if (def.backend !== 'prometheus') return null;

  if (def.type === 'custom') {
    if (!def.customExpr) return null;
    const base =
      def.customExpr.mode === 'raw' ? def.customExpr.errorRatioQuery : def.customExpr.totalQuery;
    if (!base) return null;
    // `max_over_time(<expr>[1h:5m]) > 0` keeps the result vector only when
    // the expression produced a nonzero value in the last hour. An expression
    // whose selectors match nothing emits `sum=0` → filtered out; a real
    // traffic-backed service emits >0 at least once per hour → kept.
    return `(max_over_time((${base})[1h:5m])) > 0`;
  }

  const dim = buildSelectors(slo, false);
  if (def.type === 'availability') {
    const metric = def.metric;
    if (!metric) return null;
    const counter = metric.endsWith('_total') ? metric : ensureCountMetric(metric);
    return `count(last_over_time(${counter}{${dim}}[1h]))`;
  }

  // latency_threshold
  const bucket = ensureBucketMetric(def.metric ?? '');
  return `count(last_over_time(${bucket}{${dim}, le="+Inf"}[1h]))`;
}

/** Request rate per second, evaluated with the SLI's dimensions. */
export function buildRequestRateQuery(slo: SloDocument): string | null {
  if (slo.spec.sli.type !== 'single') return null;
  const def = slo.spec.sli.definition;
  if (def.backend !== 'prometheus') return null;
  const dim = buildSelectors(slo, false);

  if (def.type === 'availability') {
    const metric = def.metric;
    if (!metric) return null;
    const counter = metric.endsWith('_total') ? metric : ensureCountMetric(metric);
    return `sum(rate(${counter}{${dim}}[5m]))`;
  }
  if (def.type === 'latency_threshold') {
    const bucket = ensureBucketMetric(def.metric ?? '');
    return `sum(rate(${bucket}{${dim}, le="+Inf"}[5m]))`;
  }
  return null;
}

/** Histogram quantile query. `q` must be in [0, 1]. */
export function buildLatencyPercentileQuery(slo: SloDocument, q: number): string | null {
  if (slo.spec.sli.type !== 'single') return null;
  const def = slo.spec.sli.definition;
  if (def.backend !== 'prometheus' || def.type !== 'latency_threshold') return null;
  const bucket = ensureBucketMetric(def.metric ?? '');
  const dim = buildSelectors(slo, false);
  return `histogram_quantile(${q}, sum(rate(${bucket}{${dim}}[5m])) by (le))`;
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

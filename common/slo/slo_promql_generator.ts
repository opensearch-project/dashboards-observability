/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure PromQL generator for SLO definitions.
 *
 * Input: an SloDocument. Output: a GeneratedRuleGroup containing one set of
 * rules per objective in the SLO. No I/O, no side effects.
 *
 * Used both server-side (for deployment) and client-side (for the wizard's
 * preview panel) so what the user sees is exactly what gets deployed.
 *
 * Label contract:
 *   slo_severity, slo_alarm_type, slo_id, slo_name, slo_objective,
 *   slo_service, slo_owner_team, slo_owner_teams, slo_tier, slo_window,
 *   slo_burn_rate_multiplier, slo_window_approximated, slo_budget_threshold,
 *   slo_label_<key>
 */

import { createHash } from 'crypto';
import { dump as yamlDump } from 'js-yaml';
import type {
  BurnRateConfig,
  GeneratedRule,
  GeneratedRuleGroup,
  Objective,
  SingleSli,
  SloDocument,
  SloSpec,
} from './slo_types';

// ============================================================================
// Constants
// ============================================================================

/** Pre-computed error-ratio windows. Longest window covers the 3d approximation. */
export const RECORDING_WINDOWS = ['5m', '30m', '1h', '2h', '6h', '1d', '3d'] as const;

/** Evaluation interval for the generated rule group. */
const DEFAULT_INTERVAL_SECONDS = 60;

/** Ruler namespace that receives the generated groups. */
export const SLO_RULER_NAMESPACE = 'slo-generated';

/**
 * Placeholder a custom SLI query uses for the evaluation window (Sloth's
 * convention). Substituted with each recording window (`5m` … `3d`) so a
 * custom query such as `sum(increase(x_total[{{.window}}]))` records a real
 * per-window ratio instead of one instant value copied into every window.
 */
export const SLI_WINDOW_TOKEN = '{{.window}}';

/**
 * Label stamped on every generated recording rule. Bump the value whenever
 * the recorded math changes: the rule-health checker reports groups without
 * the current value as outdated so they get re-provisioned in place (rule
 * names are fingerprint- or id-derived and don't change with the math).
 */
export const SLO_RULES_VERSION_LABEL = 'slo_rules_version';
export const SLO_RULES_VERSION = '3';

/**
 * Bucket bounds (seconds) of the span-derived `latency_seconds` histogram
 * the trace pipeline's service-map processor emits. Those buckets are
 * per-interval and non-cumulative — each `le` holds only its own slice and
 * `+Inf` is just the overflow — so "requests under X" is the sum of every
 * bucket whose bound is <= X, not the single `le="X"` series.
 */
export const SPAN_DERIVED_LATENCY_BUCKETS_SECONDS: readonly number[] = [
  0, 0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10,
];

/**
 * Default MWMBR tiers per the Google SRE Workbook Ch. 5 Table 5-8 and Sloth's
 * google-30d.yaml. Consumers can override per-SLO.
 */
export const DEFAULT_MWMBR_TIERS: readonly BurnRateConfig[] = [
  {
    shortWindow: '5m',
    longWindow: '1h',
    burnRateMultiplier: 14.4,
    severity: 'critical',
    createAlarm: true,
    forDuration: '2m',
  },
  {
    shortWindow: '30m',
    longWindow: '6h',
    burnRateMultiplier: 6,
    severity: 'critical',
    createAlarm: true,
    forDuration: '5m',
  },
  {
    shortWindow: '2h',
    longWindow: '1d',
    burnRateMultiplier: 3,
    severity: 'warning',
    createAlarm: true,
    forDuration: '10m',
  },
  {
    shortWindow: '6h',
    longWindow: '3d',
    burnRateMultiplier: 1,
    severity: 'warning',
    createAlarm: true,
    forDuration: '30m',
  },
];

/** Burn-rate tier labels in index order. */
const MWMBR_TIER_LABELS = ['PageQuick', 'PageSlow', 'TicketQuick', 'TicketSlow'] as const;

/** Hard cap on burn-rate tiers — matches the canonical labels above. */
export const MWMBR_MAX_TIERS = MWMBR_TIER_LABELS.length;

// ============================================================================
// Name helpers
// ============================================================================

/**
 * Slugify an SLO name + objective name into a rule-safe token.
 * Lowercases, collapses non-alphanumerics to `_`, truncates to 40 chars.
 * Uniqueness across SLOs comes from the hash suffix, not this slug.
 */
export function slugifySloObjective(sloName: string, objectiveName: string): string {
  return `${sloName}_${objectiveName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/**
 * Deterministic 8-char suffix for the (workspace, sloId, objectiveName) triple.
 * Workspace-scoped so multi-tenant rulers don't collide; objective-scoped so
 * multi-objective SLOs don't collide within their own rule group.
 *
 * First 8 hex chars of sha256 over the concatenated tuple — commits to a
 * stable rule-name contract so external dashboards, Alertmanager silences,
 * and GitOps manifests that pin rule names stay stable across
 * implementations. Not a security primitive; chosen for collision-resistance
 * and portability (identical hex in any sha256 implementation).
 */
export function ruleSuffix(workspaceId: string, sloId: string, objectiveName: string): string {
  // The `:` separator assumes none of the inputs contains a literal colon.
  // `workspaceId` is bounded by `WORKSPACE_ID_RE` and `sloId` by `SLO_ID_RE`,
  // both of which forbid `:`. Today `objectiveName` is OSD-issued and
  // colon-free; if it ever becomes user-controlled, escape before composing.
  const input = `${workspaceId}:${sloId}:${objectiveName}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 8);
}

/** Parse a Prometheus duration (e.g. "5m", "1h", "3d") to milliseconds. */
export function parseDurationToMs(duration: string): number {
  const match = duration.match(/^(\d+)(s|m|h|d|w)$/);
  if (!match) return 0;
  const val = parseInt(match[1], 10);
  switch (match[2]) {
    case 's':
      return val * 1_000;
    case 'm':
      return val * 60_000;
    case 'h':
      return val * 3_600_000;
    case 'd':
      return val * 86_400_000;
    case 'w':
      return val * 604_800_000;
    default:
      return 0;
  }
}

/**
 * Find the closest recording-rule window >= `windowDuration`. If the SLO window
 * is longer than every RECORDING_WINDOWS entry, return the longest one. Callers
 * that take this branch must attach `slo_window_approximated: "true"`.
 */
export function findClosestRecordingWindow(windowDuration: string): string {
  const targetMs = parseDurationToMs(windowDuration);
  for (const w of RECORDING_WINDOWS) {
    if (parseDurationToMs(w) >= targetMs) return w;
  }
  return RECORDING_WINDOWS[RECORDING_WINDOWS.length - 1];
}

// ============================================================================
// Label builders
// ============================================================================

/**
 * Build the PromQL selector fragment from a SingleSli's dimensions plus
 * an optional good-events filter. Returns the comma-separated body of `{...}`.
 */
function buildSelectors(sli: SingleSli, includeGoodFilter: boolean): string {
  const pairs: string[] = sli.dimensions.map((d) => `${d.name}="${escapeLabelValue(d.value)}"`);
  if (includeGoodFilter && sli.definition.backend === 'prometheus') {
    const good = sli.definition.goodEventsFilter?.trim();
    if (good) pairs.push(good);
  }
  return pairs.join(', ');
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Common labels attached to every recording rule + every alerting rule for
 * a given SLO/objective. Caller adds rule-specific labels (window, severity, ...).
 */
function commonLabels(spec: SloSpec, sloId: string, objective: Objective): Record<string, string> {
  const labels: Record<string, string> = {
    slo_id: sloId,
    slo_name: spec.name,
    slo_objective: objective.name,
    slo_service: spec.service,
  };
  if (spec.owner.teams.length > 0) {
    labels.slo_owner_team = spec.owner.teams[0];
    if (spec.owner.teams.length > 1) {
      labels.slo_owner_teams = spec.owner.teams.join(',');
    }
  }
  if (spec.tier) labels.slo_tier = spec.tier;
  // User labels — propagated as slo_label_<key>. Array values comma-joined.
  for (const [k, v] of Object.entries(spec.labels || {})) {
    labels[`slo_label_${k}`] = Array.isArray(v) ? v.join(',') : String(v);
  }
  return labels;
}

// ============================================================================
// Recording rules (per-objective, one per window)
// ============================================================================

/**
 * Generate the 7 error-ratio recording rules for one objective. The math for
 * every SLI shape lives in `buildSliEventQueries`; each rule records
 * `1 - (good / total)` for its window.
 */
function generateRecordingRules(
  spec: SloSpec,
  sloId: string,
  suffix: string,
  slug: string,
  objective: Objective
): GeneratedRule[] {
  if (spec.sli.type !== 'single') return [];
  const sli = spec.sli;
  if (sli.definition.backend !== 'prometheus') return [];

  const base = commonLabels(spec, sloId, objective);
  const rules: GeneratedRule[] = [];

  for (const window of RECORDING_WINDOWS) {
    const name = `slo:sli_error:ratio_rate_${window}:${slug}_${suffix}`;
    const expr = errorRatioExpr(sli, window, objective);
    rules.push({
      type: 'recording',
      name,
      expr,
      labels: { ...base, slo_window: window, [SLO_RULES_VERSION_LABEL]: SLO_RULES_VERSION },
      description: `Pre-computed error ratio over the ${window} window`,
    });
  }
  return rules;
}

/**
 * Error-ratio PromQL for one SLI over `window` — exactly what the recording
 * rule for that window evaluates. Exported so the status reader can evaluate
 * the same expression inline when a recorded sample is missing, and the UI
 * can chart it. Returns null when the SLI can't be queried (composite,
 * non-Prometheus, custom without an expression).
 */
export function buildErrorRatioExpr(
  sli: SingleSli,
  objective: Objective,
  window: string
): string | null {
  const q = buildSliEventQueries(sli, objective, window);
  if (!q) return null;
  if ('errorRatio' in q) return q.errorRatio;
  // Wrap each sub-expression in its own parens — PromQL `/` binds tighter
  // than `-`/`+`, so an unparenthesized `sum(a) - sum(b) / sum(c)` parses
  // as `sum(a) - (sum(b) / sum(c))`.
  return `1 - (\n  (${q.good})\n  /\n  (${q.total})\n)`;
}

function errorRatioExpr(sli: SingleSli, window: string, objective: Objective): string {
  return (
    buildErrorRatioExpr(sli, objective, window) ??
    `# SLI has no query (missing metric or customExpr)`
  );
}

/**
 * Good / total event queries for one SLI over `window`, or the raw error
 * ratio for a raw custom SLI. Single source of truth for the recording
 * rules, the probe, the inline status fallback and the detail-page charts.
 *
 * `mode: 'ratio'` (default) yields per-second rates for cumulative counters;
 * `mode: 'count'` yields event counts over the window (`increase`). Delta
 * gauges are summed over the window in both modes — the ratio is the same.
 *
 * Shapes:
 *   - availability: good `sum(f(m{dims, good}[w])) or vector(0)`, total
 *     `sum(f(m{dims}[w]))`. The `or vector(0)` keeps a total outage (no
 *     series matches the good filter) from reading as "no data".
 *   - latency_threshold, cumulative histogram: good = the `le` bucket at the
 *     threshold, total = the `+Inf` bucket. `le` is matched numerically
 *     tolerant (`0.5`, `0.50`, `1`, `1.0`) since producers format it
 *     differently, and falls back to the bound in milliseconds for
 *     histograms whose `_seconds` name hides millisecond buckets.
 *   - latency_threshold, delta histogram (span-derived): good = every bucket
 *     with a bound <= threshold, total = `<metric>_count`.
 *   - latency_threshold, `per_range` bucket layout (each bucket holds only its
 *     own range, `+Inf` only the overflow): good = every discovered bucket
 *     with a bound <= threshold, total = `<metric>_count`, read with
 *     `rate`/`increase` since the buckets still grow over time. The bounds
 *     and their unit come from the SLI, so no unit is guessed.
 *   - custom: the user's queries with `{{.window}}` substituted; the exact
 *     legacy instant span-derived draft/template shapes are upgraded to
 *     windowed sums.
 */
export function buildSliEventQueries(
  sli: SingleSli,
  objective: Objective,
  window: string,
  mode: 'ratio' | 'count' = 'ratio'
): { good: string; total: string } | { errorRatio: string } | null {
  const prom = sli.definition;
  if (prom.backend !== 'prometheus') return null;

  if (prom.type === 'custom') {
    const custom = prom.customExpr;
    if (!custom) return null;
    if (custom.mode === 'raw') {
      return { errorRatio: substituteWindowToken(custom.errorRatioQuery, window) };
    }
    return windowCustomPair(custom.goodQuery, custom.totalQuery, window);
  }

  if (!prom.metric) return null;
  const delta = effectiveMetricTemporality(sli) === 'delta';
  const over = (selector: string): string => {
    if (delta) return `sum(sum_over_time(${selector}[${window}]))`;
    return `sum(${mode === 'count' ? 'increase' : 'rate'}(${selector}[${window}]))`;
  };
  const dims = sli.dimensions.map((d) => `${d.name}="${escapeLabelValue(d.value)}"`);
  const goodFilter = prom.goodEventsFilter?.trim();

  if (prom.type === 'availability') {
    const metric = prom.metric;
    return {
      good: `${over(`${metric}{${joinMatchers(...dims, goodFilter)}}`)} or vector(0)`,
      total: over(`${metric}{${joinMatchers(...dims)}}`),
    };
  }

  // latency_threshold
  const bucketMetric = ensureBucketMetric(prom.metric || '');
  const boundSeconds = toSeconds(objective.latencyThreshold ?? 0, prom.latencyThresholdUnit);
  if (delta) {
    const bounds = SPAN_DERIVED_LATENCY_BUCKETS_SECONDS.filter((b) => b <= boundSeconds);
    const le = `le=~"${bounds.map(leValuePattern).join('|')}"`;
    return {
      good: over(`${bucketMetric}{${joinMatchers(...dims, le)}}`),
      total: over(`${ensureCountMetric(prom.metric || '')}{${joinMatchers(...dims)}}`),
    };
  }
  if (prom.bucketLayout === 'per_range') {
    const bounds = perRangeBoundsUnder(prom.bucketBounds ?? [], prom.bucketUnit, boundSeconds);
    if (bounds.length === 0) return null;
    const le = `le=~"${bounds.map(leValuePattern).join('|')}"`;
    return {
      good: `${over(`${bucketMetric}{${joinMatchers(...dims, le)}}`)} or vector(0)`,
      total: over(`${ensureCountMetric(prom.metric || '')}{${joinMatchers(...dims)}}`),
    };
  }
  const bucketAt = (le: number) =>
    over(`${bucketMetric}{${joinMatchers(...dims, `le=~"${leValuePattern(le)}"`)}}`);
  const inf = over(`${bucketMetric}{${joinMatchers(...dims, 'le="+Inf"')}}`);
  // A known bucket unit reads the one bucket at the threshold, no guessing.
  if (prom.bucketUnit) {
    const le = prom.bucketUnit === 'milliseconds' ? boundSeconds * 1000 : boundSeconds;
    return { good: bucketAt(le), total: inf };
  }
  // Some producers export a millisecond histogram under a `_seconds` name
  // (bounds 5, 10, … 10000): there is no `le="0.5"` series, only `le="500"`.
  // Fall back to the bound scaled by 1000 — `or` only takes the right side
  // when the left is empty, so correctly scaled histograms are unaffected.
  // Kept for SLIs saved without a `bucketUnit`; suggestions only offer a
  // cumulative draft when the threshold bucket exists in the probed unit.
  return {
    good: `(${bucketAt(boundSeconds)} or ${bucketAt(boundSeconds * 1000)})`,
    total: inf,
  };
}

/**
 * The `bounds` (in `unit`) of a `per_range` histogram that sit at or under
 * `thresholdSeconds`, sorted ascending. A tiny tolerance absorbs float noise
 * from unit conversion (0.1 s → 100.00000000000001 ms).
 */
export function perRangeBoundsUnder(
  bounds: readonly number[],
  unit: 'seconds' | 'milliseconds' | undefined,
  thresholdSeconds: number
): number[] {
  const threshold = unit === 'milliseconds' ? thresholdSeconds * 1000 : thresholdSeconds;
  return [...new Set(bounds)]
    .filter((b) => Number.isFinite(b) && b >= 0 && b <= threshold * (1 + 1e-9))
    .sort((a, b) => a - b);
}

/**
 * Traffic on the source metric of a `latency_threshold` SLI over `window` —
 * the number of observations its histogram recorded (`<metric>_count`).
 * Read when the SLI evaluates to NaN: a NaN with traffic means the SLI can't
 * be computed from this metric, not that the source is idle. Null for SLI
 * types whose NaN can only mean "no traffic".
 */
export function buildSourceTrafficQuery(sli: SingleSli, window: string): string | null {
  const prom = sli.definition;
  if (prom.backend !== 'prometheus' || prom.type !== 'latency_threshold' || !prom.metric) {
    return null;
  }
  const selector = `${ensureCountMetric(prom.metric)}{${joinMatchers(
    ...sli.dimensions.map((d) => `${d.name}="${escapeLabelValue(d.value)}"`)
  )}}`;
  return effectiveMetricTemporality(sli) === 'delta'
    ? `sum(sum_over_time(${selector}[${window}]))`
    : `sum(increase(${selector}[${window}]))`;
}

/**
 * Whether the SLI's source metric is a cumulative counter/histogram (the
 * Prometheus norm — read with `rate`/`increase`) or a per-interval delta
 * gauge (read with `sum_over_time`). An explicit `metricTemporality` wins;
 * otherwise SLIs scoped to `namespace="span_derived"` are delta, since
 * every span-derived RED metric is.
 */
export function effectiveMetricTemporality(sli: SingleSli): 'cumulative' | 'delta' {
  const def = sli.definition;
  if (def.backend === 'prometheus' && def.metricTemporality) return def.metricTemporality;
  return sli.dimensions.some((d) => d.name === 'namespace' && d.value === 'span_derived')
    ? 'delta'
    : 'cumulative';
}

/** Replace every `{{.window}}` token with `window`. */
export function substituteWindowToken(query: string, window: string): string {
  return query.split(SLI_WINDOW_TOKEN).join(window);
}

/**
 * Window a custom good/total pair. Queries carrying `{{.window}}` get it
 * substituted. The exact instant-read shapes that earlier suggestion drafts
 * and templates produced for span-derived gauges — e.g.
 * `sum(request{S}) - sum(fault{S})` over `sum(request{S})` with
 * `namespace="span_derived"` in `S` — are upgraded to windowed sums: an
 * instant read of a sparse per-interval gauge ignores the window and goes
 * empty between emissions. Anything else is returned unchanged.
 */
function windowCustomPair(
  goodQuery: string,
  totalQuery: string,
  window: string
): { good: string; total: string } {
  const good = goodQuery.trim();
  const total = totalQuery.trim();
  if (good.includes(SLI_WINDOW_TOKEN) || total.includes(SLI_WINDOW_TOKEN)) {
    return {
      good: substituteWindowToken(good, window),
      total: substituteWindowToken(total, window),
    };
  }
  const upgraded = upgradeLegacySpanDerivedPair(good, total, window);
  return upgraded ?? { good, total };
}

const SPAN_SELECTOR = '([^{}"]*(?:"[^"]*"[^{}"]*)*)';

/** Exact legacy instant shapes → windowed equivalents, or null when `good`/`total` aren't one. */
function upgradeLegacySpanDerivedPair(
  good: string,
  total: string,
  window: string
): { good: string; total: string } | null {
  const isSpan = (sel: string) => /(^|,)\s*namespace\s*=\s*"span_derived"/.test(sel);
  const sum = (metric: string, sel: string) => `sum(sum_over_time(${metric}{${sel}}[${window}]))`;

  // Availability: sum(request{S}) - sum(fault{S})  /  sum(request{S})
  const availGood = good.match(
    new RegExp(`^sum\\(request\\{${SPAN_SELECTOR}\\}\\) - sum\\(fault\\{${SPAN_SELECTOR}\\}\\)$`)
  );
  const availTotal = total.match(new RegExp(`^sum\\(request\\{${SPAN_SELECTOR}\\}\\)$`));
  if (availGood && availTotal) {
    const sel = availTotal[1];
    if (isSpan(sel) && availGood[1] === sel && availGood[2] === sel) {
      return {
        good: `${sum('request', sel)} - (${sum('fault', sel)} or vector(0))`,
        total: sum('request', sel),
      };
    }
  }

  // Latency: sum(latency_seconds_bucket{S,le="X"})  /  sum(latency_seconds_bucket{S,le="+Inf"})
  const latGood = good.match(
    new RegExp(`^sum\\(latency_seconds_bucket\\{${SPAN_SELECTOR},\\s*le="([^"]+)"\\}\\)$`)
  );
  const latTotal = total.match(
    new RegExp(`^sum\\(latency_seconds_bucket\\{${SPAN_SELECTOR},\\s*le="\\+Inf"\\}\\)$`)
  );
  if (latGood && latTotal) {
    const sel = latTotal[1];
    const bound = Number(latGood[2]);
    if (isSpan(sel) && latGood[1] === sel && Number.isFinite(bound)) {
      const le = `le=~"${SPAN_DERIVED_LATENCY_BUCKETS_SECONDS.filter((b) => b <= bound)
        .map(leValuePattern)
        .join('|')}"`;
      return {
        good: sum('latency_seconds_bucket', joinMatchers(sel, le)),
        total: sum('latency_seconds_count', sel),
      };
    }
  }
  return null;
}

/** Join non-empty label matchers with `, `. */
function joinMatchers(...parts: Array<string | undefined>): string {
  return parts.filter((p): p is string => !!p && p.trim().length > 0).join(', ');
}

function toSeconds(bound: number, unit: 'seconds' | 'milliseconds' | undefined): number {
  return unit === 'milliseconds' ? bound / 1000 : bound;
}

/**
 * RE2 pattern (escaped for a PromQL string literal) matching an `le` label
 * for `seconds` however the producer formats it: `0.5` also matches `0.50`,
 * `1` also matches `1.0`. Bucket labels must match literally, and producers
 * disagree on trailing zeros (OTel SDKs emit `1`, the span-derived pipeline
 * emits `1.0`), so an exact `le="1"` silently misses half of them.
 */
export function leValuePattern(seconds: number): string {
  const canonical = formatLatencyBoundLe(seconds, 'seconds');
  const [intPart, frac] = canonical.split('.');
  if (frac === undefined) return `${intPart}(\\\\.0*)?`;
  // A sub-second bound may also be written without its leading zero (`.5`).
  return `${intPart === '0' ? '0?' : intPart}\\\\.${frac}0*`;
}

/**
 * Normalize a histogram metric name to its `_bucket` suffix.
 * Accepts `x_total`, `x_count`, `x`, or `x_bucket`.
 */
export function ensureBucketMetric(metric: string): string {
  return `${histogramBase(metric)}_bucket`;
}

/** Normalize a histogram metric name to its `_count` suffix. */
export function ensureCountMetric(metric: string): string {
  return `${histogramBase(metric)}_count`;
}

function histogramBase(metric: string): string {
  return metric
    .replace(/_total$/, '')
    .replace(/_count$/, '')
    .replace(/_sum$/, '')
    .replace(/_bucket$/, '');
}

/**
 * Convert a latency bound + unit into the canonical decimal string for a
 * histogram `le` label, in seconds (the Prometheus convention).
 *
 * The output stays in fixed decimal notation regardless of magnitude — using
 * `parseFloat(toPrecision)` would emit scientific notation (e.g. `"1e-7"`)
 * for very small bounds and silently miss the bucket. We pick `toFixed(9)`
 * (the smallest histogram bucket Prometheus emits is `1ns = 1e-9 s`) and trim
 * trailing zeros so common bounds like `0.5`, `1`, `30` stay terse.
 */
export function formatLatencyBoundLe(bound: number, unit: 'seconds' | 'milliseconds'): string {
  const seconds = unit === 'milliseconds' ? bound / 1000 : bound;
  if (!Number.isFinite(seconds) || seconds <= 0) return '0';
  return trimTrailingZeros(seconds.toFixed(9));
}

function trimTrailingZeros(decimal: string): string {
  if (!decimal.includes('.')) return decimal;
  return decimal.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

// ============================================================================
// MWMBR burn-rate alerts
// ============================================================================

function generateBurnRateAlerts(
  spec: SloSpec,
  sloId: string,
  suffix: string,
  slug: string,
  objective: Objective
): GeneratedRule[] {
  const errorBudget = 1 - objective.target;
  const base = commonLabels(spec, sloId, objective);
  const tiers = spec.alerting.strategy === 'mwmbr' ? spec.alerting.burnRates : [];
  const rules: GeneratedRule[] = [];

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    // Shadow mode suppresses alerts; only recording rules deploy.
    if (spec.mode === 'shadow' || !tier.createAlarm) continue;

    const threshold = roundThreshold(tier.burnRateMultiplier * errorBudget);
    const shortRec = `slo:sli_error:ratio_rate_${tier.shortWindow}:${slug}_${suffix}`;
    const longRec = `slo:sli_error:ratio_rate_${tier.longWindow}:${slug}_${suffix}`;
    const tierLabel = MWMBR_TIER_LABELS[i] ?? `Tier${i + 1}`;
    const name = `SLO_BurnRate_${tierLabel}_${slug}_${suffix}`;

    // The short- and long-window recording rules carry different `slo_window`
    // label values (e.g. 5m vs 1h), so a bare `and` produces an empty vector
    // join. Ignore `slo_window` on the match so both sides intersect on the
    // remaining SLO labels.
    const expr =
      `${shortRec}{slo_id="${sloId}"} > ${threshold}\n` +
      `and ignoring(slo_window)\n` +
      `${longRec}{slo_id="${sloId}"} > ${threshold}`;

    rules.push({
      type: 'alerting',
      name,
      expr,
      for: tier.forDuration,
      labels: {
        ...base,
        slo_severity: tier.severity,
        slo_alarm_type: 'burn_rate',
        slo_burn_rate_multiplier: String(tier.burnRateMultiplier),
        slo_window: `${tier.shortWindow}/${tier.longWindow}`,
      },
      annotations: {
        summary: `SLO burn rate ${tier.severity} — ${tier.burnRateMultiplier}x budget consumption (${tier.shortWindow}/${tier.longWindow})`,
        description:
          `Error budget for ${spec.name} (${objective.name}) is being consumed at ` +
          `${tier.burnRateMultiplier}x the allowed rate. Both the ${tier.shortWindow} and ` +
          `${tier.longWindow} error ratios exceed ${threshold}.`,
      },
      description: `MWMBR burn-rate alert: ${tier.burnRateMultiplier}x (${tier.shortWindow}/${tier.longWindow}), severity=${tier.severity}`,
    });
  }

  return rules;
}

function roundThreshold(n: number): string {
  // The threshold lands inside the alert expr (`... > <threshold>`) and as a
  // label value on burn-rate alerts. PromQL accepts scientific notation for
  // numeric literals, so for values that toFixed(6) would round to zero we
  // fall back to `toExponential` to keep the threshold non-zero — otherwise a
  // legal target=0.99999 + multiplier=0.001 underflows to "0" and the alert
  // fires on any non-zero error ratio. Plain-decimal output is preserved for
  // typical magnitudes so dashboards that scrape the label stay readable.
  if (!Number.isFinite(n) || n <= 0) return '0';
  const fixed = trimTrailingZeros(n.toFixed(6));
  if (fixed !== '0') return fixed;
  // 6-decimal print rounded to zero — fall back to exponential. Trim the
  // exponential mantissa's trailing zeros (`1.000000e-8` → `1e-8`).
  const exp = n.toExponential();
  return exp.replace(/(\.\d*?)0+e/, '$1e').replace(/\.e/, 'e');
}

// ============================================================================
// Supplemental alerts — §3.4 (all off by default except budgetWarning)
// ============================================================================

/** SLI health — fires when 5m error ratio exceeds the full error budget. */
function generateSliHealthAlert(
  spec: SloSpec,
  sloId: string,
  suffix: string,
  slug: string,
  objective: Objective
): GeneratedRule | null {
  if (!spec.alarms.sliHealth.enabled || spec.mode === 'shadow') return null;
  const errorBudget = 1 - objective.target;
  const base = commonLabels(spec, sloId, objective);
  const rec = `slo:sli_error:ratio_rate_5m:${slug}_${suffix}`;
  return {
    type: 'alerting',
    name: `SLO_SLIHealth_${slug}_${suffix}`,
    expr: `${rec}{slo_id="${sloId}"} > ${roundThreshold(errorBudget)}`,
    for: '5m',
    labels: {
      ...base,
      slo_severity: 'warning',
      slo_alarm_type: 'sli_health',
      slo_window: '5m',
    },
    annotations: {
      summary: `SLI health degraded — error ratio exceeds error budget for ${spec.name} (${objective.name})`,
    },
    description: `SLI health alert — fires when 5m error ratio exceeds error budget`,
  };
}

/** Attainment — fires when the full-window ratio exceeds budget (3d proxy if > 3d). */
function generateAttainmentAlert(
  spec: SloSpec,
  sloId: string,
  suffix: string,
  slug: string,
  objective: Objective
): GeneratedRule | null {
  if (!spec.alarms.attainmentBreach.enabled || spec.mode === 'shadow') return null;
  if (spec.window.type !== 'rolling') return null;
  const errorBudget = 1 - objective.target;
  const recWindow = findClosestRecordingWindow(spec.window.duration);
  const approximated = recWindow !== spec.window.duration;
  const rec = `slo:sli_error:ratio_rate_${recWindow}:${slug}_${suffix}`;
  const base = commonLabels(spec, sloId, objective);
  const labels: Record<string, string> = {
    ...base,
    slo_severity: 'critical',
    slo_alarm_type: 'attainment',
    slo_window: recWindow,
  };
  if (approximated) labels.slo_window_approximated = 'true';
  return {
    type: 'alerting',
    name: `SLO_Attainment_${slug}_${suffix}`,
    expr: `${rec}{slo_id="${sloId}"} > ${roundThreshold(errorBudget)}`,
    for: '5m',
    labels,
    annotations: {
      summary: `SLO attainment breached — ${spec.name} (${objective.name}) below target over ${spec.window.duration}`,
    },
    description: `Attainment breach — full-window error ratio exceeds budget${
      approximated ? ' (3d proxy)' : ''
    }`,
  };
}

/** Budget warning — one alert per (objective × threshold) when enabled. */
function generateBudgetWarningAlerts(
  spec: SloSpec,
  sloId: string,
  suffix: string,
  slug: string,
  objective: Objective
): GeneratedRule[] {
  if (!spec.alarms.budgetWarning.enabled || spec.mode === 'shadow') return [];
  if (spec.window.type !== 'rolling') return [];
  const errorBudget = 1 - objective.target;
  const recWindow = findClosestRecordingWindow(spec.window.duration);
  const approximated = recWindow !== spec.window.duration;
  const rec = `slo:sli_error:ratio_rate_${recWindow}:${slug}_${suffix}`;
  const base = commonLabels(spec, sloId, objective);

  return spec.budgetWarningThresholds.map((bw, i) => {
    const expr =
      `1 - (\n` +
      `  ${rec}{slo_id="${sloId}"}\n` +
      `  / ${roundThreshold(errorBudget)}\n` +
      `) < ${roundThreshold(bw.threshold)}`;
    const pct = Math.round(bw.threshold * 100);
    const labels: Record<string, string> = {
      ...base,
      slo_severity: bw.severity,
      slo_alarm_type: 'error_budget_warning',
      slo_budget_threshold: String(bw.threshold),
      slo_window: recWindow,
    };
    if (approximated) labels.slo_window_approximated = 'true';
    // Suffix index keeps multiple thresholds collision-free.
    return {
      type: 'alerting',
      name: `SLO_Warning_${pct}pct_${slug}_${suffix}${
        spec.budgetWarningThresholds.length > 1 ? `_${i}` : ''
      }`,
      expr,
      for: '15m',
      labels,
      annotations: {
        summary: `SLO warning — less than ${pct}% error budget remaining for ${spec.name} (${objective.name})`,
      },
      description: `Budget warning — remaining budget < ${pct}%`,
    };
  });
}

/** No-data — fires when the SLI query returns no samples for forDuration. */
function generateNoDataAlert(
  spec: SloSpec,
  sloId: string,
  suffix: string,
  slug: string,
  objective: Objective
): GeneratedRule | null {
  if (!spec.alarms.noData.enabled || spec.mode === 'shadow') return null;
  if (spec.sli.type !== 'single' || spec.sli.definition.backend !== 'prometheus') return null;
  const prom = spec.sli.definition;
  const base = commonLabels(spec, sloId, objective);
  const dimSelectors = buildSelectors(spec.sli, false);
  // For custom/raw SLIs there is no obvious `absent()` target; skip to avoid false alerts.
  if (prom.type === 'custom') return null;
  const metric =
    prom.type === 'availability' ? prom.metric || '' : ensureBucketMetric(prom.metric || '');
  return {
    type: 'alerting',
    name: `SLO_NoData_${slug}_${suffix}`,
    expr: `absent_over_time(${metric}{${dimSelectors}}[${spec.alarms.noData.forDuration}])`,
    for: spec.alarms.noData.forDuration,
    labels: {
      ...base,
      slo_severity: 'warning',
      slo_alarm_type: 'no_data',
    },
    annotations: {
      summary: `SLI returned no data for ${spec.alarms.noData.forDuration} — ${spec.name} (${objective.name})`,
    },
    description: `No-data alert — SLI query empty for ${spec.alarms.noData.forDuration}`,
  };
}

// ============================================================================
// YAML serializer
// ============================================================================

function formatInterval(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

/**
 * Serialize a Prometheus rule group via `js-yaml` so the same library both
 * the wizard preview AND the ruler dual-write share — the YAML the user
 * sees in preview is the YAML Prometheus receives.
 *
 * The homemade emitter previously open-coded escapeYaml() to handle
 * backslash and double-quote, but a literal LF/CR/TAB in `rule.labels.*`
 * (e.g. a `spec.name` containing `\n`) would terminate the YAML
 * double-quoted scalar mid-line. js-yaml emits a literal block (`expr: |`)
 * for multi-line strings and escapes control chars correctly inside flow
 * scalars.
 */
function rulesToYaml(groupName: string, interval: number, rules: GeneratedRule[]): string {
  const doc: Record<string, unknown> = {
    name: groupName,
    interval: formatInterval(interval),
    rules: rules.map((rule) => {
      const out: Record<string, unknown> = {};
      if (rule.type === 'recording') out.record = rule.name;
      else out.alert = rule.name;
      out.expr = rule.expr;
      if (rule.for) out.for = rule.for;
      if (rule.labels && Object.keys(rule.labels).length > 0) {
        out.labels = stringifyMap(rule.labels);
      }
      if (rule.annotations && Object.keys(rule.annotations).length > 0) {
        out.annotations = stringifyMap(rule.annotations);
      }
      return out;
    }),
  };
  return yamlDump(doc, { noRefs: true, lineWidth: -1, sortKeys: false });
}

/**
 * Coerce label / annotation values to strings before handing them to
 * `js-yaml`. Defensive against callers passing through `undefined` or
 * non-string values via the caller-controlled provenance JSON-string
 * (`buildAlertProvenance`); without this the emitter passes the raw object
 * to js-yaml, which serializes `undefined` as YAML `null` and Prometheus
 * rejects the rule.
 */
function stringifyMap(map: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    out[k] = v == null ? '' : String(v);
  }
  return out;
}

// ============================================================================
// Main entry
// ============================================================================

/**
 * Generate the complete rule group for an SLO document.
 *
 * - One set of rules per objective: 7 recording rules + up to 4 burn-rate
 *   alerts + supplemental alarms + budget warnings
 * - Preview and deployment share this function so what the user sees matches
 *   what the ruler gets
 *
 * @param doc full SLO document (id + spec); `status` is not read
 * @param opts.workspaceId workspace identifier used in the rule-name hash
 */
export function generateSloRuleGroup(
  doc: SloDocument,
  opts: { workspaceId?: string } = {}
): GeneratedRuleGroup {
  const { spec, id } = doc;
  const workspaceId = opts.workspaceId ?? 'default';
  const rules: GeneratedRule[] = [];

  if (spec.sli.type !== 'single') {
    return {
      groupName: `slo:${id}`,
      interval: DEFAULT_INTERVAL_SECONDS,
      rules: [],
      yaml: `# composite SLOs are reserved for P2\n`,
    };
  }

  for (const objective of spec.objectives) {
    const suffix = ruleSuffix(workspaceId, id, objective.name);
    const slug = slugifySloObjective(spec.name, objective.name);
    rules.push(...generateRecordingRules(spec, id, suffix, slug, objective));
    rules.push(...generateBurnRateAlerts(spec, id, suffix, slug, objective));
    const sliHealth = generateSliHealthAlert(spec, id, suffix, slug, objective);
    if (sliHealth) rules.push(sliHealth);
    const attainment = generateAttainmentAlert(spec, id, suffix, slug, objective);
    if (attainment) rules.push(attainment);
    rules.push(...generateBudgetWarningAlerts(spec, id, suffix, slug, objective));
    const noData = generateNoDataAlert(spec, id, suffix, slug, objective);
    if (noData) rules.push(noData);
  }

  // Per-SLO group naming — one group per SLO keeps reconciliation simple.
  const groupSlug = slugifySloObjective(spec.name, 'group');
  const firstSuffix = ruleSuffix(workspaceId, id, 'group');
  const groupName = `slo:${groupSlug}_${firstSuffix}`;

  return {
    groupName,
    interval: DEFAULT_INTERVAL_SECONDS,
    rules,
    yaml: rulesToYaml(groupName, DEFAULT_INTERVAL_SECONDS, rules),
  };
}

// ============================================================================
// Dedup-mode split generation
//
// In dedup mode the service layer emits two kinds of ruler groups:
//
//   - N shared *recording* groups (one per unique SLI fingerprint).
//     Group name: `slo:rec:<fp>`. Recording rules are named
//     `slo:sli_error:ratio_rate_<w>:sli_<fp>` and carry NO SLO-identity
//     labels — they evaluate the same expression regardless of which SLO
//     references them, so attaching identity labels would defeat the dedup.
//
//   - 1 per-SLO *alert* group. Group name: `slo:alerts:<slug>_<suffix>`.
//     Alerts look up recording rules by their fingerprint-derived name; no
//     `{slo_id=...}` selector (the recording series doesn't carry that
//     label any more). Alerts attach the full SLO identity labels
//     themselves, so downstream routing still gets everything it needs.
//
// Shared with the single-group path:
//   - The alerting-rule templates (burn-rate MWMBR, sli_health, attainment,
//     budget warnings, no_data). Only their recording-rule references are
//     rewritten to use fingerprint-named rules.
//   - `commonLabels`, `slugifySloObjective`, `ruleSuffix`.
//
// Pure. Identical inputs → identical outputs, byte for byte. Specifically:
//
//     recordingRulesFor(fpA) === recordingRulesFor(fpB)   iff fpA === fpB
//
// Which is the invariant that lets the registry skip the ruler upsert when
// `incrementRef.wasZero === false`.
// ============================================================================

/**
 * Name of the recording rule for a given fingerprint + window.
 * Dedup rules: `slo:sli_error:ratio_rate_<w>:sli_<fp>`.
 */
export function dedupRecordingRuleName(fingerprint: string, window: string): string {
  return `slo:sli_error:ratio_rate_${window}:sli_${fingerprint}`;
}

/** Name of the shared recording group for a fingerprint: `slo:rec:<fp>`. */
export function dedupRecordingGroupName(fingerprint: string): string {
  return `slo:rec:${fingerprint}`;
}

/**
 * Per-SLO alert group name, computed the same way `generateAlertGroupFor` does.
 * Exported so callers (service delete/rollback paths) can reference the group
 * without first building the full group object.
 */
export function dedupAlertGroupName(specName: string, workspaceId: string, sloId: string): string {
  const slug = slugifySloObjective(specName, 'group');
  const suffix = ruleSuffix(workspaceId, sloId, 'group');
  return `slo:alerts:${slug}_${suffix}`;
}

/**
 * Build the shared recording group for a single fingerprint. Returns `null`
 * when the SLI is composite / OpenSearch-backed — those cases have no
 * Prometheus recording rules. The returned group's rules carry ONLY
 * `slo_window` labels (and `slo_window_approximated` when relevant via
 * alerts — recording rules themselves don't need approximation flags).
 *
 * Note: the input requires a "representative" `SingleSli` that produced
 * the fingerprint. Any SLO that matches the same fingerprint will produce
 * byte-equal output; the service layer picks one arbitrarily per
 * fingerprint when deploying.
 */
export function generateRecordingGroupForFingerprint(input: {
  fingerprint: string;
  sli: SingleSli;
  /** Required only when the SLI is a `latency_threshold` type. */
  objectiveLatencyThreshold?: number;
}): GeneratedRuleGroup | null {
  const def = input.sli.definition;
  if (def.backend !== 'prometheus') return null;
  const { fingerprint, sli } = input;

  // Build a minimal Objective stand-in so `errorRatioExpr` can read
  // `latencyThreshold` the same way it does for legacy rules. Name/target
  // aren't referenced here, so any placeholder is fine.
  const objectiveStub: Objective = {
    name: `fp-${fingerprint}`,
    target: 0,
    latencyThreshold: input.objectiveLatencyThreshold,
  };

  const rules: GeneratedRule[] = [];
  for (const window of RECORDING_WINDOWS) {
    const name = dedupRecordingRuleName(fingerprint, window);
    const expr = errorRatioExpr(sli, window, objectiveStub);
    rules.push({
      type: 'recording',
      name,
      expr,
      labels: { slo_window: window, [SLO_RULES_VERSION_LABEL]: SLO_RULES_VERSION },
      description: `Pre-computed error ratio over the ${window} window (fingerprint ${fingerprint})`,
    });
  }

  const groupName = dedupRecordingGroupName(fingerprint);
  return {
    groupName,
    interval: DEFAULT_INTERVAL_SECONDS,
    rules,
    yaml: rulesToYaml(groupName, DEFAULT_INTERVAL_SECONDS, rules),
  };
}

/**
 * Build the per-SLO alert group. Alerts reference fingerprint-named
 * recording rules (no `{slo_id="X"}` selector) and carry full SLO
 * identity labels themselves so downstream routing keeps working.
 *
 * Shadow mode and `createAlarm: false` tiers still suppress their
 * alert bodies; the resulting group can be empty. The caller is
 * responsible for injecting a sentinel alert when the group is empty so
 * the provenance annotation has a home.
 */
export function generateAlertGroupFor(
  doc: SloDocument,
  recordingFingerprints: Record<string, string>,
  opts: { workspaceId?: string } = {}
): GeneratedRuleGroup {
  const { spec, id } = doc;
  const workspaceId = opts.workspaceId ?? 'default';
  const groupSlug = slugifySloObjective(spec.name, 'group');
  const firstSuffix = ruleSuffix(workspaceId, id, 'group');
  const groupName = `slo:alerts:${groupSlug}_${firstSuffix}`;

  const rules: GeneratedRule[] = [];
  if (spec.sli.type !== 'single') {
    return {
      groupName,
      interval: DEFAULT_INTERVAL_SECONDS,
      rules: [],
      yaml: rulesToYaml(groupName, DEFAULT_INTERVAL_SECONDS, rules),
    };
  }

  for (const objective of spec.objectives) {
    const fingerprint = recordingFingerprints[objective.name];
    if (!fingerprint) {
      // Fingerprint map is missing this objective — can happen for
      // OpenSearch/composite SLIs. Skip; the caller shouldn't have passed
      // this objective in.
      continue;
    }
    const suffix = ruleSuffix(workspaceId, id, objective.name);
    const slug = slugifySloObjective(spec.name, objective.name);
    rules.push(...generateDedupBurnRateAlerts(spec, id, suffix, slug, objective, fingerprint));
    const sliHealth = generateDedupSliHealthAlert(spec, id, suffix, slug, objective, fingerprint);
    if (sliHealth) rules.push(sliHealth);
    const attainment = generateDedupAttainmentAlert(spec, id, suffix, slug, objective, fingerprint);
    if (attainment) rules.push(attainment);
    rules.push(...generateDedupBudgetWarningAlerts(spec, id, suffix, slug, objective, fingerprint));
    const noData = generateNoDataAlert(spec, id, suffix, slug, objective);
    if (noData) rules.push(noData);
  }

  return {
    groupName,
    interval: DEFAULT_INTERVAL_SECONDS,
    rules,
    yaml: rulesToYaml(groupName, DEFAULT_INTERVAL_SECONDS, rules),
  };
}

// Dedup-mode alert rule helpers — references fingerprint-named recording
// rules directly. Alert expressions drop the `{slo_id=...}` selector because
// dedup recording rules don't carry that label any more.

function generateDedupBurnRateAlerts(
  spec: SloSpec,
  sloId: string,
  suffix: string,
  slug: string,
  objective: Objective,
  fingerprint: string
): GeneratedRule[] {
  const errorBudget = 1 - objective.target;
  const base = commonLabels(spec, sloId, objective);
  const tiers = spec.alerting.strategy === 'mwmbr' ? spec.alerting.burnRates : [];
  const rules: GeneratedRule[] = [];

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    if (spec.mode === 'shadow' || !tier.createAlarm) continue;

    const threshold = roundThreshold(tier.burnRateMultiplier * errorBudget);
    const shortRec = dedupRecordingRuleName(fingerprint, tier.shortWindow);
    const longRec = dedupRecordingRuleName(fingerprint, tier.longWindow);
    const tierLabel = MWMBR_TIER_LABELS[i] ?? `Tier${i + 1}`;
    const name = `SLO_BurnRate_${tierLabel}_${slug}_${suffix}`;

    // No `{slo_id=...}` selector — dedup recording series no longer carry
    // identity labels. The `and ignoring(slo_window)` join still lets the
    // short/long series align on the remaining (empty, modulo slo_window)
    // label set.
    const expr =
      `${shortRec} > ${threshold}\n` + `and ignoring(slo_window)\n` + `${longRec} > ${threshold}`;

    rules.push({
      type: 'alerting',
      name,
      expr,
      for: tier.forDuration,
      labels: {
        ...base,
        slo_severity: tier.severity,
        slo_alarm_type: 'burn_rate',
        slo_burn_rate_multiplier: String(tier.burnRateMultiplier),
        slo_window: `${tier.shortWindow}/${tier.longWindow}`,
      },
      annotations: {
        summary: `SLO burn rate ${tier.severity} — ${tier.burnRateMultiplier}x budget consumption (${tier.shortWindow}/${tier.longWindow})`,
        description:
          `Error budget for ${spec.name} (${objective.name}) is being consumed at ` +
          `${tier.burnRateMultiplier}x the allowed rate. Both the ${tier.shortWindow} and ` +
          `${tier.longWindow} error ratios exceed ${threshold}.`,
      },
      description: `MWMBR burn-rate alert: ${tier.burnRateMultiplier}x (${tier.shortWindow}/${tier.longWindow}), severity=${tier.severity}`,
    });
  }

  return rules;
}

function generateDedupSliHealthAlert(
  spec: SloSpec,
  sloId: string,
  suffix: string,
  slug: string,
  objective: Objective,
  fingerprint: string
): GeneratedRule | null {
  if (!spec.alarms.sliHealth.enabled || spec.mode === 'shadow') return null;
  const errorBudget = 1 - objective.target;
  const base = commonLabels(spec, sloId, objective);
  const rec = dedupRecordingRuleName(fingerprint, '5m');
  return {
    type: 'alerting',
    name: `SLO_SLIHealth_${slug}_${suffix}`,
    expr: `${rec} > ${roundThreshold(errorBudget)}`,
    for: '5m',
    labels: {
      ...base,
      slo_severity: 'warning',
      slo_alarm_type: 'sli_health',
      slo_window: '5m',
    },
    annotations: {
      summary: `SLI health degraded — error ratio exceeds error budget for ${spec.name} (${objective.name})`,
    },
    description: `SLI health alert — fires when 5m error ratio exceeds error budget`,
  };
}

function generateDedupAttainmentAlert(
  spec: SloSpec,
  sloId: string,
  suffix: string,
  slug: string,
  objective: Objective,
  fingerprint: string
): GeneratedRule | null {
  if (!spec.alarms.attainmentBreach.enabled || spec.mode === 'shadow') return null;
  if (spec.window.type !== 'rolling') return null;
  const errorBudget = 1 - objective.target;
  const recWindow = findClosestRecordingWindow(spec.window.duration);
  const approximated = recWindow !== spec.window.duration;
  const rec = dedupRecordingRuleName(fingerprint, recWindow);
  const base = commonLabels(spec, sloId, objective);
  const labels: Record<string, string> = {
    ...base,
    slo_severity: 'critical',
    slo_alarm_type: 'attainment',
    slo_window: recWindow,
  };
  if (approximated) labels.slo_window_approximated = 'true';
  return {
    type: 'alerting',
    name: `SLO_Attainment_${slug}_${suffix}`,
    expr: `${rec} > ${roundThreshold(errorBudget)}`,
    for: '5m',
    labels,
    annotations: {
      summary: `SLO attainment breached — ${spec.name} (${objective.name}) below target over ${spec.window.duration}`,
    },
    description: `Attainment breach — full-window error ratio exceeds budget${
      approximated ? ' (3d proxy)' : ''
    }`,
  };
}

function generateDedupBudgetWarningAlerts(
  spec: SloSpec,
  sloId: string,
  suffix: string,
  slug: string,
  objective: Objective,
  fingerprint: string
): GeneratedRule[] {
  if (!spec.alarms.budgetWarning.enabled || spec.mode === 'shadow') return [];
  if (spec.window.type !== 'rolling') return [];
  const errorBudget = 1 - objective.target;
  const recWindow = findClosestRecordingWindow(spec.window.duration);
  const approximated = recWindow !== spec.window.duration;
  const rec = dedupRecordingRuleName(fingerprint, recWindow);
  const base = commonLabels(spec, sloId, objective);

  return spec.budgetWarningThresholds.map((bw, i) => {
    const expr =
      `1 - (\n` +
      `  ${rec}\n` +
      `  / ${roundThreshold(errorBudget)}\n` +
      `) < ${roundThreshold(bw.threshold)}`;
    const pct = Math.round(bw.threshold * 100);
    const labels: Record<string, string> = {
      ...base,
      slo_severity: bw.severity,
      slo_alarm_type: 'error_budget_warning',
      slo_budget_threshold: String(bw.threshold),
      slo_window: recWindow,
    };
    if (approximated) labels.slo_window_approximated = 'true';
    return {
      type: 'alerting',
      name: `SLO_Warning_${pct}pct_${slug}_${suffix}${
        spec.budgetWarningThresholds.length > 1 ? `_${i}` : ''
      }`,
      expr,
      for: '15m',
      labels,
      annotations: {
        summary: `SLO warning — less than ${pct}% error budget remaining for ${spec.name} (${objective.name})`,
      },
      description: `Budget warning — remaining budget < ${pct}%`,
    };
  });
}

// ============================================================================
// Probe SLI query builder — W8 (Probe SLI wizard feature)
// ============================================================================

/**
 * Per-query pieces the Probe-SLI endpoint executes to surface "does this SLI
 * actually match data in Prometheus" before the user clicks Create. Returns
 * the same good/total expressions the recording-rule deployment path would
 * emit — the probe is deliberately identical to what lands in the ruler so a
 * healthy probe implies a healthy deploy.
 *
 * `good` is the count of good events over `window`; `total` is the count of
 * total events over `window`. `ratio = good / total` is what the UI renders.
 *
 * Returns `null` when the spec is malformed enough that no query can be
 * issued (composite SLOs, OpenSearch backend, custom with missing expr):
 * caller surfaces that to the user rather than issuing an empty query.
 */
export function buildProbeQueries(
  spec: SloSpec,
  objective: Objective,
  window: string
): { good: string; total: string } | null {
  if (spec.sli.type !== 'single') return null;
  const q = buildSliEventQueries(spec.sli, objective, window);
  // Raw error-ratio has no separable good/total — the probe surface only
  // supports the events split. Callers pre-check for `mode === 'events'`.
  if (!q || 'errorRatio' in q) return null;
  return q;
}

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
  PrometheusSli,
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
 * Generate the 7 error-ratio recording rules for one objective.
 *
 * Availability: `1 - (sum(rate(metric{dims, good}[w])) / sum(rate(metric{dims}[w])))`
 *
 * Latency threshold: "error" = requests that exceeded the latency bound:
 *   `1 - (sum(rate(metric_bucket{dims, le="<bound>"}[w])) / sum(rate(metric_bucket{dims, le="+Inf"}[w])))`
 *
 * Custom (events): `1 - (goodQuery / totalQuery)` wrapped at each window via
 *   direct substitution — users already provide windowed PromQL, but for custom
 *   the recording rules just record the error ratio at evaluation time without
 *   a window wrap (P0 limitation — documented in §11).
 *
 * Custom (raw): the user's errorRatioQuery is recorded as-is (one rule per window).
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
  const prom = sli.definition;

  const base = commonLabels(spec, sloId, objective);
  const rules: GeneratedRule[] = [];

  for (const window of RECORDING_WINDOWS) {
    const name = `slo:sli_error:ratio_rate_${window}:${slug}_${suffix}`;
    const expr = errorRatioExpr(prom, sli, window, objective);
    rules.push({
      type: 'recording',
      name,
      expr,
      labels: { ...base, slo_window: window },
      description: `Pre-computed error ratio over the ${window} window`,
    });
  }
  return rules;
}

function errorRatioExpr(
  prom: PrometheusSli,
  sli: SingleSli,
  window: string,
  objective: Objective
): string {
  if (prom.type === 'custom') {
    if (!prom.customExpr) {
      return `# custom SLI requires customExpr`;
    }
    if (prom.customExpr.mode === 'raw') {
      return prom.customExpr.errorRatioQuery;
    }
    // Wrap each sub-expression in its own parens — PromQL `/` binds tighter
    // than `-`/`+`, so an unparenthesized `sum(a) - sum(b) / sum(c)` parses
    // as `sum(a) - (sum(b) / sum(c))`. A goodQuery of `sum(request) -
    // sum(fault)` paired with totalQuery `sum(request)` otherwise evaluates
    // to `-1` when traffic is healthy, which feeds nonsense into the
    // recording rule and the budget-remaining chart (`20,100%` headline
    // remaining budget, vs the correct `100%`).
    return (
      `1 - (\n` +
      `  (${prom.customExpr.goodQuery})\n` +
      `  /\n` +
      `  (${prom.customExpr.totalQuery})\n` +
      `)`
    );
  }
  const dimSelectors = buildSelectors(sli, false);
  const goodSelectors = buildSelectors(sli, true);
  if (prom.type === 'availability') {
    const metric = prom.metric || '';
    return (
      `1 - (\n` +
      `  sum(rate(${metric}{${goodSelectors}}[${window}]))\n` +
      `  /\n` +
      `  sum(rate(${metric}{${dimSelectors}}[${window}]))\n` +
      `)`
    );
  }
  // latency_threshold
  const bucketMetric = ensureBucketMetric(prom.metric || '');
  const bound = objective.latencyThreshold ?? 0;
  const boundLe = formatLatencyBoundLe(bound, prom.latencyThresholdUnit ?? 'seconds');
  return (
    `1 - (\n` +
    `  sum(rate(${bucketMetric}{${dimSelectors}, le="${boundLe}"}[${window}]))\n` +
    `  /\n` +
    `  sum(rate(${bucketMetric}{${dimSelectors}, le="+Inf"}[${window}]))\n` +
    `)`
  );
}

/**
 * Normalize a histogram metric name to its `_bucket` suffix.
 * Accepts `x_total`, `x_count`, `x`, or `x_bucket`.
 */
export function ensureBucketMetric(metric: string): string {
  const base = metric
    .replace(/_total$/, '')
    .replace(/_count$/, '')
    .replace(/_sum$/, '')
    .replace(/_bucket$/, '');
  return `${base}_bucket`;
}

/**
 * Convert a latency bound + unit into the string Prometheus expects on the
 * histogram `le` label. Prometheus convention is seconds, so millisecond bounds
 * are scaled down.
 *
 * Bucket labels must literally match the producer's `le=` annotation, so the
 * output stays in fixed decimal notation regardless of magnitude — using
 * `parseFloat(toPrecision)` would emit scientific notation (e.g. `"1e-7"`)
 * for very small bounds and silently miss the bucket. We pick `toFixed(9)`
 * (the smallest histogram bucket Cortex emits is `1ns = 1e-9 s`) and trim
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
 * sees in preview is the YAML Cortex receives.
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
 * to js-yaml, which serializes `undefined` as YAML `null` and Cortex
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
  const prom = def;

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
    const expr = errorRatioExpr(prom, sli, window, objectiveStub);
    rules.push({
      type: 'recording',
      name,
      expr,
      labels: { slo_window: window },
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
  const sli = spec.sli;
  if (sli.definition.backend !== 'prometheus') return null;
  const prom = sli.definition;

  if (prom.type === 'custom') {
    if (!prom.customExpr) return null;
    if (prom.customExpr.mode === 'raw') {
      // Raw error-ratio has no separable good/total — the probe surface only
      // supports the events split. Callers pre-check for `mode === 'events'`.
      return null;
    }
    return { good: prom.customExpr.goodQuery, total: prom.customExpr.totalQuery };
  }

  const dimSelectors = buildSelectors(sli, false);
  const goodSelectors = buildSelectors(sli, true);
  if (prom.type === 'availability') {
    const metric = prom.metric || '';
    return {
      good: `sum(rate(${metric}{${goodSelectors}}[${window}]))`,
      total: `sum(rate(${metric}{${dimSelectors}}[${window}]))`,
    };
  }
  // latency_threshold — "good" = requests under the latency bound.
  const bucketMetric = ensureBucketMetric(prom.metric || '');
  const bound = objective.latencyThreshold ?? 0;
  const boundLe = formatLatencyBoundLe(bound, prom.latencyThresholdUnit ?? 'seconds');
  return {
    good: `sum(rate(${bucketMetric}{${dimSelectors}, le="${boundLe}"}[${window}]))`,
    total: `sum(rate(${bucketMetric}{${dimSelectors}, le="+Inf"}[${window}]))`,
  };
}

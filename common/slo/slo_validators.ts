/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SloSpec validation. Returns an errors map (field path → message) and a
 * warnings map for non-blocking advisories. Applied server-side at the API
 * boundary and client-side in the wizard.
 */

import type { BurnRateConfig, SloSpec, Objective } from './slo_types';
import { MWMBR_MAX_TIERS, parseDurationToMs, RECORDING_WINDOWS } from './slo_promql_generator';

const METRIC_NAME_RE = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const UNSAFE_LABEL_VALUE_RE = /["\\\n{}()]/;
// Slug shape — leading lowercase letter, internal alphanumerics with single
// hyphens between segments, total length 3–63. Trailing/double hyphens
// forbidden (cosmetic for URLs; tightens the prior pattern that allowed
// `a--b` and `a-`).
const SLUG_ID_RE = /^(?=.{3,63}$)[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Reject character classes that break the YAML emitter's double-quoted
 * scalars: literal LF / CR / TAB / NULL / DEL and the unicode line/
 * paragraph separators the spec also forbids inside flow scalars. js-yaml
 * escapes most of these correctly, but we block at the validator layer
 * too so the rejection lands locally in the wizard rather than as a
 * surprising-looking ruler error toast.
 */

const UNSAFE_USER_FIELD_RE = /[\x00-\x1F\x7F\u2028\u2029]/;
function validateUserField(label: string, value: string | undefined): string | null {
  if (value === undefined) return null;
  if (UNSAFE_USER_FIELD_RE.test(value)) {
    return `${label} must not contain control characters or unicode line/paragraph separators`;
  }
  return null;
}

/**
 * Defensive sanity checks on user-supplied PromQL expressions
 * (`customExpr.goodQuery` / `totalQuery` / `errorRatioQuery`). The expression
 * is interpolated verbatim into emitted rule YAML wrapped in `(...)` paren
 * groups. YAML injection is closed by the literal-block indent discipline
 * in the generator (every line is prefixed with 6 spaces, so the user
 * cannot terminate the block), but unbalanced parens or trailing backslashes
 * escape the generator's wrapping parens and produce malformed PromQL that
 * Cortex rejects only at deploy time. Validating here keeps the error local
 * (wizard rejects at save) and forbids the class of input most likely to
 * confuse downstream parsers. Returns `null` when shaped reasonably, or an
 * error string to surface at `spec.sli.definition.customExpr.*`.
 */
export const PROMQL_SIZE_CAP = 8192;
export function validateCustomPromQL(expr: string): string | null {
  if (expr.length > PROMQL_SIZE_CAP) {
    return `PromQL expression exceeds ${PROMQL_SIZE_CAP} characters`;
  }
  // Strip string literals before counting delimiters so a matcher like
  // `{status!~"5[0-9](}"}` isn't flagged as unbalanced. PromQL string
  // literals use double quotes, single quotes, or backticks (the latter are
  // raw \u2014 escapes don't apply). The regex consumes `\\` (escaped backslash)
  // and `\"`/`\'` inside double/single-quoted spans so a legitimate matcher
  // like `"a\"b"` isn't truncated mid-literal. Line comments (`# ...`) are
  // stripped so a `# ))` doesn't trip the balance check.
  const stripped = expr
    .replace(/`[^`]*`/g, '')
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '')
    .replace(/#[^\n]*/g, '');
  let parens = 0;
  let braces = 0;
  let brackets = 0;
  for (const ch of stripped) {
    if (ch === '(') parens++;
    else if (ch === ')') parens--;
    else if (ch === '{') braces++;
    else if (ch === '}') braces--;
    else if (ch === '[') brackets++;
    else if (ch === ']') brackets--;
    if (parens < 0) return 'Unbalanced parentheses';
    if (braces < 0) return 'Unbalanced braces';
    if (brackets < 0) return 'Unbalanced brackets';
  }
  if (parens !== 0) return 'Unbalanced parentheses';
  if (braces !== 0) return 'Unbalanced braces';
  if (brackets !== 0) return 'Unbalanced brackets';
  // Trailing backslash escapes the wrapping paren group if unquoted.
  if (/\\\s*$/.test(stripped)) return 'PromQL expression must not end with a backslash';
  // Reject control chars (other than tab/newline) so a paste from a rich-text
  // editor doesn't smuggle zero-width / bidi-override chars into the YAML.
  // CR is rejected explicitly because YAML parsers behave inconsistently on
  // a literal CR inside a literal-block scalar.
  if (/[\x00-\x08\x0B\x0C\x0D\x0E-\x1F\x7F]/.test(stripped)) {
    return 'PromQL expression contains control characters';
  }
  return null;
}

/**
 * Strict shape for `goodEventsFilter`: a single matcher
 * `<label> = "value"` (or `!=`, `=~`, `!~`). The generator splices the
 * filter into a comma-separated label-matcher list, so any input that
 * smuggles a comma can stack additional matchers on the metric and shift
 * the recorded series. Rejecting commas + control chars (LF, CR, NULL,
 * etc.) closes that path entirely. We also forbid backslashes outside
 * the matcher value to prevent escape-sequence smuggling into the YAML
 * mapping line.
 *
 * Allowed: `status="200"`, `code=~"5.."`, `path!="/healthz"`.
 * Rejected: `status="x",pwn="y"`, `path="\nfoo"`, `code=~"5.."[`.
 */
const GOOD_EVENTS_FILTER_RE = /^[a-zA-Z_][a-zA-Z_0-9]*\s*(=|!=|=~|!~)\s*"([^"\\\n\r\t\x00-\x1F\x7F]|\\.)*"$/;
function validateGoodEventsFilter(filter: string): string | null {
  if (/[\n\r\t\x00-\x1F\x7F]/.test(filter)) {
    return 'Good events filter must not contain control characters';
  }
  if (filter.includes(',')) {
    return 'Good events filter must contain exactly one matcher (comma not allowed)';
  }
  if (!GOOD_EVENTS_FILTER_RE.test(filter.trim())) {
    return 'Good events filter must match `<label> (=|!=|=~|!~) "value"` (no leading/trailing whitespace, no nested quotes)';
  }
  return null;
}

/**
 * Cardinality guardrail: UUID-shaped label values explode per-series metric
 * storage. Rejected on create/update; users should tag workloads with stable
 * labels (service, env, route) instead.
 */
const UUID_LABEL_VALUE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Annotation payload cap. Keeps saved-object size bounded. */
const ANNOTATIONS_BYTE_CAP = 4096;

/**
 * Cardinality caps on user-controlled arrays. These bound the saved-object
 * size and the search index footprint — without them, a single SLO can blow up
 * the keyword-mapped projection arrays and slow down listing-page filtering
 * for the entire workspace. Values picked to leave significant headroom over
 * realistic usage (an SLO for an internal API rarely needs more than 5
 * dimensions, 10 labels, or 5 owner teams).
 */
const MAX_LABEL_ENTRIES = 50;
const MAX_LABEL_VALUES_PER_KEY = 50;
const MAX_DIMENSIONS = 20;
const MAX_OWNER_TEAMS = 10;

/** Reserved keys in `spec.labels` — reject these so we don't clobber emitted labels. */
const RESERVED_LABEL_KEYS = new Set([
  'slo_id',
  'slo_name',
  'slo_objective',
  'slo_service',
  'slo_owner_team',
  'slo_owner_teams',
  'slo_tier',
  'slo_severity',
  'slo_alarm_type',
  'slo_window',
  'slo_burn_rate_multiplier',
  'slo_window_approximated',
  'slo_budget_threshold',
  // Prototype-pollution guard. `LABEL_NAME_RE` matches `__proto__` /
  // `constructor` / `prototype`. Cortex would reject the resulting rule
  // (`slo_label___proto__: "x"`) at deploy time, so blocking earlier
  // gives the user a clear validation error instead of an opaque ruler
  // 400.
  '__proto__',
  'constructor',
  'prototype',
]);

export interface SloValidationResult {
  errors: Record<string, string>;
  warnings: Record<string, string>;
}

/** Validate a user-supplied slug ID. Server generates UUIDs otherwise. */
export function validateSloId(id: string): string | null {
  if (!SLUG_ID_RE.test(id)) {
    return 'Invalid SLO id. 3–63 characters; lowercase letters, digits, single hyphens between segments; must start with a letter.';
  }
  return null;
}

/** Validate an SloSpec (create or full update). */
export function validateSloSpec(input: Partial<SloSpec>): SloValidationResult {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  if (!input.name || !input.name.trim()) {
    errors['spec.name'] = 'SLO name is required';
  } else if (input.name.length > 128) {
    errors['spec.name'] = 'SLO name must be 128 characters or fewer';
  } else {
    const nameErr = validateUserField('SLO name', input.name);
    if (nameErr) errors['spec.name'] = nameErr;
  }

  if (!input.datasourceId) {
    errors['spec.datasourceId'] = 'Datasource is required';
  }

  if (input.enabled === undefined) errors['spec.enabled'] = 'enabled is required';
  if (input.mode && input.mode !== 'active' && input.mode !== 'shadow') {
    errors['spec.mode'] = `mode must be 'active' or 'shadow'`;
  }

  if (!input.service) {
    errors['spec.service'] = 'Service is required';
  } else {
    const serviceErr = validateUserField('Service', input.service);
    if (serviceErr) errors['spec.service'] = serviceErr;
  }

  if (input.tier !== undefined) {
    const tierErr = validateUserField('Tier', input.tier);
    if (tierErr) errors['spec.tier'] = tierErr;
  }

  if (!input.owner || !Array.isArray(input.owner.teams) || input.owner.teams.length === 0) {
    errors['spec.owner.teams'] = 'At least one team is required';
  } else if (input.owner.teams.length > MAX_OWNER_TEAMS) {
    errors['spec.owner.teams'] = `At most ${MAX_OWNER_TEAMS} owner teams are allowed`;
  } else {
    for (let i = 0; i < input.owner.teams.length; i++) {
      const teamErr = validateUserField('Owner team', input.owner.teams[i]);
      if (teamErr) errors[`spec.owner.teams[${i}]`] = teamErr;
    }
  }

  // --- SLI ---
  if (!input.sli) {
    errors['spec.sli'] = 'SLI configuration is required';
  } else if (input.sli.type === 'single') {
    const { dimensions, definition } = input.sli;
    if (!definition) {
      errors['spec.sli.definition'] = 'SLI definition is required';
    } else if (definition.backend === 'prometheus') {
      const prom = definition;
      if (prom.type === 'availability') {
        if (!prom.metric) errors['spec.sli.definition.metric'] = 'Metric name is required';
        else if (!METRIC_NAME_RE.test(prom.metric))
          errors['spec.sli.definition.metric'] = 'Invalid Prometheus metric name';
        if (prom.goodEventsFilter) {
          const filterErr = validateGoodEventsFilter(prom.goodEventsFilter);
          if (filterErr) errors['spec.sli.definition.goodEventsFilter'] = filterErr;
        }
      } else if (prom.type === 'latency_threshold') {
        if (!prom.metric) errors['spec.sli.definition.metric'] = 'Histogram metric is required';
        else if (!METRIC_NAME_RE.test(prom.metric))
          errors['spec.sli.definition.metric'] = 'Invalid Prometheus metric name';
        if (
          prom.latencyThresholdUnit &&
          prom.latencyThresholdUnit !== 'seconds' &&
          prom.latencyThresholdUnit !== 'milliseconds'
        ) {
          errors[
            'spec.sli.definition.latencyThresholdUnit'
          ] = `latencyThresholdUnit must be 'seconds' or 'milliseconds'`;
        }
      } else if (prom.type === 'custom') {
        if (!prom.customExpr) {
          errors['spec.sli.definition.customExpr'] = 'customExpr is required for custom SLIs';
        } else if (prom.customExpr.mode === 'events') {
          if (!prom.customExpr.goodQuery) {
            errors['spec.sli.definition.customExpr.goodQuery'] = 'goodQuery is required';
          } else {
            const err = validateCustomPromQL(prom.customExpr.goodQuery);
            if (err) errors['spec.sli.definition.customExpr.goodQuery'] = err;
          }
          if (!prom.customExpr.totalQuery) {
            errors['spec.sli.definition.customExpr.totalQuery'] = 'totalQuery is required';
          } else {
            const err = validateCustomPromQL(prom.customExpr.totalQuery);
            if (err) errors['spec.sli.definition.customExpr.totalQuery'] = err;
          }
        } else if (prom.customExpr.mode === 'raw') {
          if (!prom.customExpr.errorRatioQuery) {
            errors['spec.sli.definition.customExpr.errorRatioQuery'] =
              'errorRatioQuery is required';
          } else {
            const err = validateCustomPromQL(prom.customExpr.errorRatioQuery);
            if (err) errors['spec.sli.definition.customExpr.errorRatioQuery'] = err;
          }
        }
      }
    } else if (definition.backend === 'opensearch') {
      errors['spec.sli.definition.backend'] = 'OpenSearch SLI backend is not supported in P0';
    }

    // Dimensions — required for non-custom single SLIs.
    const isCustom = definition?.backend === 'prometheus' && definition.type === 'custom';
    if (!isCustom) {
      if (!Array.isArray(dimensions) || dimensions.length === 0) {
        errors['spec.sli.dimensions'] = 'At least one dimension is required';
      } else if (dimensions.length > MAX_DIMENSIONS) {
        errors['spec.sli.dimensions'] = `At most ${MAX_DIMENSIONS} dimensions are allowed`;
      } else {
        for (let i = 0; i < dimensions.length; i++) {
          const d = dimensions[i];
          if (!d.name || !LABEL_NAME_RE.test(d.name))
            errors[`spec.sli.dimensions[${i}].name`] = 'Invalid Prometheus label name';
          // An empty-string value is a legitimate Prometheus matcher
          // (`label=""` matches series where the label is absent or empty),
          // which Data Prepper relies on to scope to server-side spans
          // (`remoteService=""`). Reject `undefined`/`null` but allow `""`.
          if (d.value === undefined || d.value === null) {
            errors[`spec.sli.dimensions[${i}].value`] = 'Dimension value is required';
          } else if (UNSAFE_LABEL_VALUE_RE.test(d.value))
            errors[`spec.sli.dimensions[${i}].value`] =
              'Label value must not contain double quotes, backslashes, newlines, or braces';
        }
      }
    }
  } else if (input.sli.type === 'composite') {
    errors['spec.sli.type'] = 'Composite SLOs are reserved for P2';
  }

  // --- Objectives ---
  if (!Array.isArray(input.objectives) || input.objectives.length === 0) {
    errors['spec.objectives'] = 'At least one objective is required';
  } else {
    const seenNames = new Set<string>();
    for (let i = 0; i < input.objectives.length; i++) {
      const objResult = validateObjective(input.objectives[i], i, input);
      Object.assign(errors, objResult.errors);
      Object.assign(warnings, objResult.warnings);
      const n = input.objectives[i].name;
      if (n) {
        if (seenNames.has(n))
          errors[`spec.objectives[${i}].name`] = `Duplicate objective name "${n}"`;
        seenNames.add(n);
      }
    }
  }

  // --- Window ---
  if (!input.window) {
    errors['spec.window'] = 'Window is required';
  } else if (input.window.type === 'rolling') {
    const ms = parseDurationToMs(input.window.duration);
    if (!input.window.duration || ms === 0) {
      errors['spec.window.duration'] = 'Window duration is required';
    } else if (ms < parseDurationToMs('1d')) {
      errors['spec.window.duration'] = 'Minimum window duration is 1 day';
    } else if (ms > parseDurationToMs('30d')) {
      errors['spec.window.duration'] = 'Maximum window duration is 30 days';
    } else if (ms > parseDurationToMs('3d')) {
      warnings['spec.window.duration'] =
        `Windows greater than 3d use the 3d recording rule as an approximation in P0. ` +
        `Attainment alerts will carry slo_window_approximated="true".`;
    }
  } else if (input.window.type === 'calendar') {
    errors['spec.window.type'] = 'Calendar windows are reserved for P1';
  }

  // --- Alerting ---
  if (!input.alerting) {
    errors['spec.alerting'] = 'Alerting strategy is required';
  } else if (input.alerting.strategy === 'mwmbr') {
    if (!Array.isArray(input.alerting.burnRates) || input.alerting.burnRates.length === 0) {
      warnings['spec.alerting.burnRates'] =
        'No burn-rate tiers configured — no MWMBR alerts will be generated';
    } else {
      if (input.alerting.burnRates.length > MWMBR_MAX_TIERS) {
        errors[
          'spec.alerting.burnRates'
        ] = `At most ${MWMBR_MAX_TIERS} burn-rate tiers are supported; received ${input.alerting.burnRates.length}.`;
      }
      const firstObjTarget = input.objectives?.[0]?.target;
      const errorBudget = firstObjTarget !== undefined ? 1 - firstObjTarget : undefined;
      for (let i = 0; i < input.alerting.burnRates.length; i++) {
        const br = validateBurnRate(input.alerting.burnRates[i], i, errorBudget);
        Object.assign(errors, br.errors);
        Object.assign(warnings, br.warnings);
      }
    }
  } else {
    errors['spec.alerting.strategy'] = 'Only mwmbr alerting is supported in P0';
  }

  // --- Alarms ---
  if (!input.alarms) {
    errors['spec.alarms'] = 'Alarm configuration is required';
  } else {
    if (
      input.alarms.noData?.enabled &&
      (!input.alarms.noData.forDuration || parseDurationToMs(input.alarms.noData.forDuration) === 0)
    ) {
      errors['spec.alarms.noData.forDuration'] =
        'noData.forDuration is required when noData is enabled';
    }
  }

  // --- Budget warnings ---
  if (input.budgetWarningThresholds === undefined) {
    errors['spec.budgetWarningThresholds'] = 'budgetWarningThresholds must be an array';
  } else if (Array.isArray(input.budgetWarningThresholds)) {
    for (let i = 0; i < input.budgetWarningThresholds.length; i++) {
      const bw = input.budgetWarningThresholds[i];
      if (bw.threshold === undefined || bw.threshold < 0.01 || bw.threshold > 0.99) {
        errors[`spec.budgetWarningThresholds[${i}].threshold`] =
          'threshold must be between 0.01 and 0.99';
      }
      if (!bw.severity || !bw.severity.trim()) {
        errors[`spec.budgetWarningThresholds[${i}].severity`] = 'severity is required';
      }
    }
  }

  // --- Labels / annotations ---
  if (input.labels) {
    const labelEntries = Object.entries(input.labels);
    if (labelEntries.length > MAX_LABEL_ENTRIES) {
      errors['spec.labels'] = `At most ${MAX_LABEL_ENTRIES} label keys are allowed`;
    }
    for (const [k, v] of labelEntries) {
      if (!LABEL_NAME_RE.test(k)) {
        errors[`spec.labels["${k}"]`] = 'Label key must match [a-zA-Z_][a-zA-Z0-9_]*';
      }
      if (RESERVED_LABEL_KEYS.has(`slo_label_${k}`) || RESERVED_LABEL_KEYS.has(k)) {
        errors[`spec.labels["${k}"]`] = `"${k}" collides with a reserved slo_* label`;
      }
      const values = Array.isArray(v) ? v : [v];
      if (values.length > MAX_LABEL_VALUES_PER_KEY) {
        errors[
          `spec.labels["${k}"]`
        ] = `At most ${MAX_LABEL_VALUES_PER_KEY} values per label key are allowed`;
      }
      for (const val of values) {
        if (typeof val !== 'string') {
          errors[`spec.labels["${k}"]`] = 'Label values must be strings';
        } else if (val.length > 256) {
          errors[`spec.labels["${k}"]`] = 'Label values must be 256 characters or fewer';
        } else if (UNSAFE_LABEL_VALUE_RE.test(val)) {
          errors[`spec.labels["${k}"]`] =
            'Label value must not contain double quotes, backslashes, newlines, or braces';
        } else if (UUID_LABEL_VALUE_RE.test(val)) {
          errors[`spec.labels["${k}"]`] = 'Label values must not be UUIDs (cardinality guardrail)';
        }
      }
    }
  }

  // --- Annotations (size cap only; not propagated to rules) ---
  if (input.annotations !== undefined && input.annotations !== null) {
    // JSON.stringify gives a deterministic byte count that tracks the on-disk
    // saved-object size. Design §10.3 pins this to 4 KiB.
    if (JSON.stringify(input.annotations).length > ANNOTATIONS_BYTE_CAP) {
      errors['spec.annotations'] = `Annotations exceed ${ANNOTATIONS_BYTE_CAP}-byte size cap`;
    }
  }

  // --- Exclusion windows (shape check only; enforcement deferred) ---
  if (input.exclusionWindows && input.exclusionWindows.length > 10) {
    errors['spec.exclusionWindows'] = 'Maximum 10 exclusion windows allowed';
  }

  return { errors, warnings };
}

export function isSloSpecValid(input: Partial<SloSpec>): boolean {
  return Object.keys(validateSloSpec(input).errors).length === 0;
}

// ============================================================================
// Objective
// ============================================================================

function validateObjective(
  obj: Partial<Objective>,
  i: number,
  spec: Partial<SloSpec>
): SloValidationResult {
  const prefix = `spec.objectives[${i}]`;
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  if (!obj.name || !obj.name.trim()) {
    errors[`${prefix}.name`] = 'Objective name is required';
  } else if (!/^[a-z0-9][a-z0-9-]*$/i.test(obj.name)) {
    errors[`${prefix}.name`] = 'Objective name must be alphanumeric + hyphens';
  } else if (obj.name.length > 64) {
    errors[`${prefix}.name`] = 'Objective name must be 64 characters or fewer';
  }

  if (obj.target === undefined || obj.target === null) {
    errors[`${prefix}.target`] = 'Target is required';
  } else if (obj.target < 0.5 || obj.target > 0.99999) {
    errors[`${prefix}.target`] = 'Target must be between 0.5 and 0.99999';
  }

  // Latency bound required for latency_threshold SLIs.
  const sli = spec.sli;
  if (
    sli?.type === 'single' &&
    sli.definition?.backend === 'prometheus' &&
    sli.definition.type === 'latency_threshold'
  ) {
    if (obj.latencyThreshold === undefined || obj.latencyThreshold <= 0) {
      errors[`${prefix}.latencyThreshold`] = 'Latency threshold is required and must be > 0';
    } else if (
      sli.definition.latencyThresholdUnit !== 'milliseconds' &&
      obj.latencyThreshold >= 60
    ) {
      warnings[`${prefix}.latencyThreshold`] =
        `Latency threshold is in seconds. A value of ${obj.latencyThreshold} looks high — ` +
        `did you mean ${obj.latencyThreshold} ms?`;
    }
  }

  return { errors, warnings };
}

// ============================================================================
// Burn-rate tier
// ============================================================================

function validateBurnRate(
  tier: BurnRateConfig,
  i: number,
  errorBudget: number | undefined
): SloValidationResult {
  const prefix = `spec.alerting.burnRates[${i}]`;
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  const shortMs = parseDurationToMs(tier.shortWindow);
  const longMs = parseDurationToMs(tier.longWindow);
  if (!tier.shortWindow || shortMs === 0)
    errors[`${prefix}.shortWindow`] = 'Short window is required';
  if (!tier.longWindow || longMs === 0) errors[`${prefix}.longWindow`] = 'Long window is required';
  if (shortMs > 0 && longMs > 0 && shortMs >= longMs)
    errors[`${prefix}.shortWindow`] = 'Short window must be shorter than long window';

  if (
    tier.shortWindow &&
    shortMs > 0 &&
    !(RECORDING_WINDOWS as readonly string[]).includes(tier.shortWindow)
  )
    warnings[`${prefix}.shortWindow`] =
      `shortWindow "${tier.shortWindow}" does not match a recording rule window ` +
      `(${RECORDING_WINDOWS.join(', ')}). The alert will reference a non-existent recording rule.`;
  if (
    tier.longWindow &&
    longMs > 0 &&
    !(RECORDING_WINDOWS as readonly string[]).includes(tier.longWindow)
  )
    warnings[`${prefix}.longWindow`] =
      `longWindow "${tier.longWindow}" does not match a recording rule window ` +
      `(${RECORDING_WINDOWS.join(', ')}). The alert will reference a non-existent recording rule.`;

  if (!tier.burnRateMultiplier || tier.burnRateMultiplier <= 0) {
    errors[`${prefix}.burnRateMultiplier`] = 'Burn rate multiplier must be > 0';
  } else if (tier.burnRateMultiplier > 1000) {
    errors[`${prefix}.burnRateMultiplier`] = 'Burn rate multiplier must be ≤ 1000';
  }

  if (
    tier.burnRateMultiplier &&
    errorBudget !== undefined &&
    errorBudget > 0 &&
    tier.burnRateMultiplier * errorBudget > 1.0
  ) {
    warnings[`${prefix}.burnRateMultiplier`] =
      `Burn rate ${tier.burnRateMultiplier}x with the current target produces a threshold > 1.0. ` +
      `Since the error ratio is bounded to [0, 1], this alert will never fire.`;
  }

  if (!tier.severity || !tier.severity.trim())
    errors[`${prefix}.severity`] = 'severity is required';
  if (!tier.forDuration || parseDurationToMs(tier.forDuration) === 0)
    errors[`${prefix}.forDuration`] = 'forDuration is required';

  return { errors, warnings };
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Wizard form state + reducer, extracted so the wizard page stays an
 * orchestrator. Every edit from the UI flows through `reducer` — no setState
 * on nested arrays from the components themselves.
 */

import type {
  BudgetWarningThreshold,
  BurnRateConfig,
  CustomPromQLExpr,
  Dimension,
  ExclusionWindow,
  SloAlarmConfig,
} from '../../../../../common/slo/slo_types';
import {
  DEFAULT_MWMBR_TIERS,
  MWMBR_MAX_TIERS,
} from '../../../../../common/slo/slo_promql_generator';
import {
  SLO_TEMPLATES,
  substituteCustomPromqlDefaults,
} from '../../../../../common/slo/slo_templates';
import type { SloTemplate } from '../../../../../common/slo/slo_templates';
import { getBurnRatePreset } from './burn_rate_presets';
import type { BurnRatePresetId } from './burn_rate_presets';
import type { KeyValueEntry } from './wizard_key_value_grid';

/** One row in the Objectives section. Strings for form editing; built into
 *  numeric `target` / `latencyThreshold` at submit time (keeps typing UX sane). */
export interface ObjectiveRow {
  name: string;
  target: string;
  latencyThreshold: string;
}

/** State for the custom PromQL editor. Only read when template.id === 'custom'. */
export interface CustomPromqlState {
  mode: 'events' | 'raw';
  goodQuery: string;
  totalQuery: string;
  errorRatioQuery: string;
}

export interface FormState {
  templateId: string | null;
  datasourceId: string;
  name: string;
  description: string;
  service: string;
  ownerTeam: string;
  ownerPrimaryUser: string;
  tier: string;
  windowDuration: '7d' | '14d' | '28d' | '30d';
  objectives: ObjectiveRow[];
  dimensions: Dimension[];
  /**
   * The Prometheus metric for structured (availability / latency) SLIs. Seeded
   * from the template default on apply, then user-editable in the SLI editor's
   * Advanced view. Unused for `custom` SLIs (those carry full PromQL instead).
   */
  metric: string;
  goodEventsFilter: string;
  latencyThresholdUnit: 'seconds' | 'milliseconds';
  customPromql: CustomPromqlState;
  labels: KeyValueEntry[];
  annotations: KeyValueEntry[];
  shadow: boolean;

  // Advanced
  burnRates: BurnRateConfig[];
  budgetWarnings: BudgetWarningThreshold[];
  alarms: SloAlarmConfig;

  // Exclusion windows — shape-only; enforcement deferred post-GA.
  exclusionWindows: ExclusionWindow[];

  // Flipped by the Submit handler so the wizard only reveals the top-level
  // validation summary AFTER the user has attempted submit at least once.
  // Typing doesn't produce a sea of red; clicking Create does.
  submitAttempted: boolean;
}

export type Action =
  | { kind: 'setTemplate'; templateId: string | null }
  | { kind: 'setField'; field: ScalarField; value: string | boolean }
  | { kind: 'setObjectiveField'; index: number; field: keyof ObjectiveRow; value: string }
  | { kind: 'addObjective' }
  | { kind: 'removeObjective'; index: number }
  | { kind: 'setDimension'; index: number; dim: Dimension }
  | { kind: 'addDimension' }
  | { kind: 'removeDimension'; index: number }
  | { kind: 'setCustomPromql'; patch: Partial<CustomPromqlState> }
  | {
      kind: 'setBurnRateField';
      index: number;
      field: keyof BurnRateConfig;
      value: string | number | boolean;
    }
  | { kind: 'addBurnRate' }
  | { kind: 'removeBurnRate'; index: number }
  | { kind: 'applyBurnRatePreset'; preset: BurnRatePresetId }
  | {
      kind: 'setBudgetWarningField';
      index: number;
      field: keyof BudgetWarningThreshold;
      value: string | number;
    }
  | { kind: 'addBudgetWarning' }
  | { kind: 'removeBudgetWarning'; index: number }
  | { kind: 'setAlarmToggle'; alarm: ToggleableAlarm; enabled: boolean }
  | { kind: 'setNoDataDuration'; forDuration: string }
  | {
      kind: 'setExclusionWindowField';
      index: number;
      field: keyof ExclusionWindowRowPatch;
      value: string;
    }
  | { kind: 'setExclusionWindowScheduleType'; index: number; type: 'cron' | 'oneoff' }
  | { kind: 'addExclusionWindow' }
  | { kind: 'removeExclusionWindow'; index: number }
  | { kind: 'markSubmitAttempted' }
  | {
      kind: 'setLabelEntry';
      index: number;
      field: 'key' | 'value';
      value: string;
    }
  | { kind: 'addLabelEntry' }
  | { kind: 'removeLabelEntry'; index: number }
  | {
      kind: 'setAnnotationEntry';
      index: number;
      field: 'key' | 'value';
      value: string;
    }
  | { kind: 'addAnnotationEntry' }
  | { kind: 'removeAnnotationEntry'; index: number };

/**
 * Scalar keys of FormState — the subset `setField` is allowed to assign.
 * Array and record-valued state uses dedicated actions.
 */
type ScalarField =
  | 'datasourceId'
  | 'name'
  | 'description'
  | 'service'
  | 'ownerTeam'
  | 'ownerPrimaryUser'
  | 'tier'
  | 'windowDuration'
  | 'metric'
  | 'goodEventsFilter'
  | 'latencyThresholdUnit'
  | 'shadow';

export type ToggleableAlarm =
  | 'sliHealth'
  | 'attainmentBreach'
  | 'budgetWarning'
  | 'noData'
  | 'resolved';

/**
 * Fields that can be edited on a single ExclusionWindow row regardless of
 * schedule type. The schedule-type-specific keys (cron.expression,
 * oneoff.start, ...) are covered by the same key names since they are
 * mutually exclusive per row — the reducer routes the write.
 */
export interface ExclusionWindowRowPatch {
  name: string;
  reason: string;
  cronExpression: string;
  cronTimezone: string;
  cronDuration: string;
  oneoffStart: string;
  oneoffEnd: string;
}

/** Default objective rows depend on the template. */
function defaultObjective(template: SloTemplate | null): ObjectiveRow {
  const t = template?.sli.type;
  if (t === 'latency_threshold') {
    return {
      name: 'latency-threshold',
      target: '99.9',
      latencyThreshold: template?.defaultLatencyThreshold
        ? String(template.defaultLatencyThreshold)
        : '0.5',
    };
  }
  return { name: 'availability-99-9', target: '99.9', latencyThreshold: '0.5' };
}

function defaultAlarms(): SloAlarmConfig {
  return {
    sliHealth: { enabled: false },
    attainmentBreach: { enabled: false },
    budgetWarning: { enabled: true },
    noData: { enabled: false, forDuration: '10m' },
    resolved: { enabled: false },
  };
}

function defaultBurnRates(): BurnRateConfig[] {
  return DEFAULT_MWMBR_TIERS.map((t) => ({ ...t }));
}

function defaultBudgetWarnings(): BudgetWarningThreshold[] {
  return [
    { threshold: 0.5, severity: 'warning' },
    { threshold: 0.2, severity: 'critical' },
  ];
}

export function initialState(): FormState {
  return {
    templateId: null,
    datasourceId: '',
    name: '',
    description: '',
    service: '',
    ownerTeam: '',
    ownerPrimaryUser: '',
    tier: '',
    windowDuration: '28d',
    objectives: [defaultObjective(null)],
    dimensions: [{ name: 'service', value: '' }],
    metric: '',
    goodEventsFilter: '',
    latencyThresholdUnit: 'seconds',
    customPromql: { mode: 'events', goodQuery: '', totalQuery: '', errorRatioQuery: '' },
    labels: [],
    annotations: [],
    shadow: false,
    burnRates: defaultBurnRates(),
    budgetWarnings: defaultBudgetWarnings(),
    alarms: defaultAlarms(),
    exclusionWindows: [],
    submitAttempted: false,
  };
}

/**
 * Re-derive the template SLI query when the service changes.
 *
 * The template default (`customPromqlDefaults`) holds the un-substituted
 * template — e.g. `sum(request{service="${service}",…})`. We compute what the
 * query *was* for the previous service and compare it to the current query:
 *
 *  - If they match, the query is still the untouched template default, so we
 *    re-substitute it for the new service (frontend → checkout rewrites it).
 *  - If they differ, the user edited the query (Advanced / manual PromQL), so
 *    we leave it exactly as-is — switching service never clobbers their work.
 *
 * `prevService` may be empty (service not yet set), in which case the prior
 * default still carries the literal `${service}` placeholder; that's what the
 * current query equals on first selection, so the match still holds.
 */
function rederiveQueryForService(
  template: SloTemplate,
  current: CustomPromqlState,
  prevService: string,
  nextService: string
): CustomPromqlState {
  const defaults = template.customPromqlDefaults;
  if (!defaults) return current;

  const prevDefault = substituteCustomPromqlDefaults(defaults, { service: prevService });
  const nextDefault = substituteCustomPromqlDefaults(defaults, { service: nextService });

  const isUntouched = (() => {
    if (current.mode !== defaults.mode) return false;
    if (defaults.mode === 'events' && prevDefault.mode === 'events') {
      return (
        current.goodQuery === prevDefault.goodQuery && current.totalQuery === prevDefault.totalQuery
      );
    }
    if (defaults.mode === 'raw' && prevDefault.mode === 'raw') {
      return current.errorRatioQuery === prevDefault.errorRatioQuery;
    }
    return false;
  })();

  if (!isUntouched) return current;

  if (nextDefault.mode === 'events') {
    return { ...current, goodQuery: nextDefault.goodQuery, totalQuery: nextDefault.totalQuery };
  }
  return { ...current, errorRatioQuery: nextDefault.errorRatioQuery };
}

/**
 * Applying a template preserves user edits to fields the template doesn't own
 * (service/name/owner), and resets SLI-specific defaults (metric,
 * goodEventsFilter, latency threshold). Objectives are reset to a single row
 * sized for the template so the wizard isn't stuck with stale latency-only
 * rows when flipping to availability.
 *
 * Templates that carry `customPromqlDefaults` (APM span-derived) also pre-fill
 * the custom PromQL editor with `${service}` / `${remoteService}` already
 * substituted from form state.
 */
export function applyTemplate(_state: FormState, template: SloTemplate | null): FormState {
  // Switching (or first-picking) a template resets the whole form to a fresh
  // state seeded from that template — no fields carry over from a previously
  // selected template. This avoids stale queries/metrics/objectives bleeding
  // across SLI types. (Per product decision: a template switch is a clean
  // slate; the user re-enters identity/datasource for the new template.)
  const fresh = initialState();
  if (!template) return { ...fresh, templateId: null };

  // Service is blank in a fresh state, so customPromqlDefaults keep their
  // `${service}` placeholder until the user picks a service (then the reducer's
  // service re-derivation substitutes it).
  const nextCustomPromql = template.customPromqlDefaults
    ? substituteCustomPromqlDefaultsToState(template.customPromqlDefaults, fresh.customPromql, '')
    : fresh.customPromql;

  return {
    ...fresh,
    templateId: template.id,
    metric: template.sli.metric ?? '',
    goodEventsFilter: template.sli.goodEventsFilter ?? '',
    latencyThresholdUnit: template.sli.latencyThresholdUnit ?? 'seconds',
    dimensions: [{ name: template.dimensionHints.serviceLabel, value: '' }],
    objectives: [defaultObjective(template)],
    customPromql: nextCustomPromql,
  };
}

/** Merge substituted template defaults into a CustomPromqlState. */
function substituteCustomPromqlDefaultsToState(
  defaults: NonNullable<SloTemplate['customPromqlDefaults']>,
  base: CustomPromqlState,
  service: string
): CustomPromqlState {
  const subbed = substituteCustomPromqlDefaults(defaults, { service });
  if (subbed.mode === 'events') {
    return { ...base, mode: 'events', goodQuery: subbed.goodQuery, totalQuery: subbed.totalQuery };
  }
  return { ...base, mode: 'raw', errorRatioQuery: subbed.errorRatioQuery };
}

function makeEmptyExclusionWindow(): ExclusionWindow {
  return {
    name: '',
    schedule: { type: 'cron', expression: '0 0 * * *', timezone: 'UTC', duration: '1h' },
  };
}

function patchExclusionWindow(
  ew: ExclusionWindow,
  field: keyof ExclusionWindowRowPatch,
  value: string
): ExclusionWindow {
  switch (field) {
    case 'name':
      return { ...ew, name: value };
    case 'reason':
      return { ...ew, reason: value };
    case 'cronExpression':
      if (ew.schedule.type !== 'cron') return ew;
      return { ...ew, schedule: { ...ew.schedule, expression: value } };
    case 'cronTimezone':
      if (ew.schedule.type !== 'cron') return ew;
      return { ...ew, schedule: { ...ew.schedule, timezone: value } };
    case 'cronDuration':
      if (ew.schedule.type !== 'cron') return ew;
      return { ...ew, schedule: { ...ew.schedule, duration: value } };
    case 'oneoffStart':
      if (ew.schedule.type !== 'oneoff') return ew;
      return { ...ew, schedule: { ...ew.schedule, start: value } };
    case 'oneoffEnd':
      if (ew.schedule.type !== 'oneoff') return ew;
      return { ...ew, schedule: { ...ew.schedule, end: value } };
  }
}

export function reducer(state: FormState, action: Action): FormState {
  switch (action.kind) {
    case 'setTemplate': {
      const t = SLO_TEMPLATES.find((x) => x.id === action.templateId) ?? null;
      return applyTemplate(state, t);
    }
    case 'setField': {
      const next = { ...state, [action.field]: action.value } as FormState;
      // When the Service field changes, re-derive the template's SLI query for
      // the new service — so switching frontend→checkout rewrites the query
      // instead of leaving the old service baked in. We only do this while the
      // query is still the *untouched* template default: if the user edited it
      // (Advanced / manual PromQL), their query is preserved. This keeps the
      // simple "pick a service → query fills, switch → query updates" flow
      // working without ever clobbering hand-tuned queries.
      if (action.field === 'service' && typeof action.value === 'string') {
        const template = SLO_TEMPLATES.find((t) => t.id === state.templateId) ?? null;
        if (template?.customPromqlDefaults) {
          next.customPromql = rederiveQueryForService(
            template,
            state.customPromql,
            state.service,
            action.value
          );
        }
        // Keep the first dimension's value in sync with the service for the
        // common single-service case, so the user never has to retype it as a
        // dimension row. Only the auto-derived value is updated (when it still
        // equals the previous service); a hand-edited dimension is preserved.
        // This satisfies the "≥1 dimension" rule for availability/latency SLIs
        // from just the Service field.
        if (template && next.dimensions.length > 0) {
          const first = next.dimensions[0];
          const wasAutoDerived = first.value === state.service || first.value === '';
          if (wasAutoDerived) {
            next.dimensions = [
              { name: first.name || template.dimensionHints.serviceLabel, value: action.value },
              ...next.dimensions.slice(1),
            ];
          }
        }
      }
      return next;
    }
    case 'setObjectiveField': {
      const next = state.objectives.slice();
      next[action.index] = { ...next[action.index], [action.field]: action.value };
      return { ...state, objectives: next };
    }
    case 'addObjective': {
      const next = state.objectives.slice();
      const base = state.objectives[0] ?? defaultObjective(null);
      next.push({
        name: `objective-${state.objectives.length + 1}`,
        target: base.target,
        latencyThreshold: base.latencyThreshold,
      });
      return { ...state, objectives: next };
    }
    case 'removeObjective': {
      if (state.objectives.length <= 1) return state;
      const next = state.objectives.slice();
      next.splice(action.index, 1);
      return { ...state, objectives: next };
    }
    case 'setDimension': {
      const next = state.dimensions.slice();
      next[action.index] = action.dim;
      return { ...state, dimensions: next };
    }
    case 'addDimension':
      return { ...state, dimensions: [...state.dimensions, { name: '', value: '' }] };
    case 'removeDimension': {
      const next = state.dimensions.slice();
      next.splice(action.index, 1);
      return { ...state, dimensions: next };
    }
    case 'setCustomPromql':
      return { ...state, customPromql: { ...state.customPromql, ...action.patch } };
    case 'setBurnRateField': {
      const next = state.burnRates.slice();
      next[action.index] = {
        ...next[action.index],
        [action.field]: action.value,
      } as BurnRateConfig;
      return { ...state, burnRates: next };
    }
    case 'addBurnRate': {
      if (state.burnRates.length >= MWMBR_MAX_TIERS) return state;
      const base = state.burnRates[state.burnRates.length - 1] ?? DEFAULT_MWMBR_TIERS[0];
      return {
        ...state,
        burnRates: [...state.burnRates, { ...base, severity: 'warning', createAlarm: true }],
      };
    }
    case 'removeBurnRate': {
      const next = state.burnRates.slice();
      next.splice(action.index, 1);
      return { ...state, burnRates: next };
    }
    case 'applyBurnRatePreset': {
      const preset = getBurnRatePreset(action.preset);
      return { ...state, burnRates: preset.tiers.map((t) => ({ ...t })) };
    }
    case 'setBudgetWarningField': {
      const next = state.budgetWarnings.slice();
      next[action.index] = {
        ...next[action.index],
        [action.field]: action.value,
      } as BudgetWarningThreshold;
      return { ...state, budgetWarnings: next };
    }
    case 'addBudgetWarning':
      return {
        ...state,
        budgetWarnings: [...state.budgetWarnings, { threshold: 0.1, severity: 'warning' }],
      };
    case 'removeBudgetWarning': {
      const next = state.budgetWarnings.slice();
      next.splice(action.index, 1);
      return { ...state, budgetWarnings: next };
    }
    case 'setAlarmToggle': {
      const alarms = { ...state.alarms };
      const current = alarms[action.alarm];
      alarms[action.alarm] = { ...current, enabled: action.enabled };
      return { ...state, alarms };
    }
    case 'setNoDataDuration':
      return {
        ...state,
        alarms: {
          ...state.alarms,
          noData: { ...state.alarms.noData, forDuration: action.forDuration },
        },
      };
    case 'setExclusionWindowField': {
      const next = state.exclusionWindows.slice();
      next[action.index] = patchExclusionWindow(next[action.index], action.field, action.value);
      return { ...state, exclusionWindows: next };
    }
    case 'setExclusionWindowScheduleType': {
      const next = state.exclusionWindows.slice();
      const ew = next[action.index];
      if (action.type === 'cron') {
        next[action.index] = {
          ...ew,
          schedule: { type: 'cron', expression: '0 0 * * *', timezone: 'UTC', duration: '1h' },
        };
      } else {
        const now = new Date();
        const later = new Date(now.getTime() + 60 * 60 * 1000);
        next[action.index] = {
          ...ew,
          schedule: { type: 'oneoff', start: now.toISOString(), end: later.toISOString() },
        };
      }
      return { ...state, exclusionWindows: next };
    }
    case 'addExclusionWindow':
      return {
        ...state,
        exclusionWindows: [...state.exclusionWindows, makeEmptyExclusionWindow()],
      };
    case 'removeExclusionWindow': {
      const next = state.exclusionWindows.slice();
      next.splice(action.index, 1);
      return { ...state, exclusionWindows: next };
    }
    case 'markSubmitAttempted':
      return state.submitAttempted ? state : { ...state, submitAttempted: true };
    case 'setLabelEntry': {
      const next = state.labels.slice();
      next[action.index] = { ...next[action.index], [action.field]: action.value };
      return { ...state, labels: next };
    }
    case 'addLabelEntry':
      return { ...state, labels: [...state.labels, { key: '', value: '' }] };
    case 'removeLabelEntry': {
      const next = state.labels.slice();
      next.splice(action.index, 1);
      return { ...state, labels: next };
    }
    case 'setAnnotationEntry': {
      const next = state.annotations.slice();
      next[action.index] = { ...next[action.index], [action.field]: action.value };
      return { ...state, annotations: next };
    }
    case 'addAnnotationEntry':
      return { ...state, annotations: [...state.annotations, { key: '', value: '' }] };
    case 'removeAnnotationEntry': {
      const next = state.annotations.slice();
      next.splice(action.index, 1);
      return { ...state, annotations: next };
    }
  }
}

// Re-export for wizard consumers who want the union type without a separate import.
export type { CustomPromQLExpr };

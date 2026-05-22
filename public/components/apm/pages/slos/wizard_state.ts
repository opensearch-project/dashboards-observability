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
export function applyTemplate(state: FormState, template: SloTemplate | null): FormState {
  if (!template) return { ...state, templateId: null };
  const nextCustomPromql = template.customPromqlDefaults
    ? (() => {
        const subbed = substituteCustomPromqlDefaults(template.customPromqlDefaults, {
          service: state.service,
        });
        if (subbed.mode === 'events') {
          return {
            mode: 'events' as const,
            goodQuery: subbed.goodQuery,
            totalQuery: subbed.totalQuery,
            errorRatioQuery: state.customPromql.errorRatioQuery,
          };
        }
        return {
          mode: 'raw' as const,
          goodQuery: state.customPromql.goodQuery,
          totalQuery: state.customPromql.totalQuery,
          errorRatioQuery: subbed.errorRatioQuery,
        };
      })()
    : state.customPromql;
  return {
    ...state,
    templateId: template.id,
    goodEventsFilter: template.sli.goodEventsFilter ?? '',
    latencyThresholdUnit: template.sli.latencyThresholdUnit ?? 'seconds',
    dimensions: [
      { name: template.dimensionHints.serviceLabel, value: state.service || '' },
      ...(state.dimensions.length > 1 ? state.dimensions.slice(1) : []),
    ],
    objectives: [defaultObjective(template)],
    customPromql: nextCustomPromql,
  };
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
    case 'setField':
      return { ...state, [action.field]: action.value } as FormState;
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

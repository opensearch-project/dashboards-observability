/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Create Monitor types and constants — shared across the split sub-files of
 * the create-monitor flyout. Everything here is React-free: pure TS types,
 * default-form factories, and option arrays for `EuiSelect`. Kept in a `.ts`
 * (not `.tsx`) file so it can be imported by any of the sibling sub-files
 * without dragging in JSX transitive dependencies.
 *
 * Contents:
 *   - `ThresholdCondition` — operator/value/unit/for-duration shape
 *   - `BaseMonitorForm` — fields shared by both backends
 *   - `PrometheusFormState` / `OpenSearchFormState` / `MonitorFormState`
 *   - `DEFAULT_PROM_FORM` / `DEFAULT_OS_FORM`
 *   - `INTERVAL_OPTIONS`, `DURATION_OPTIONS`, `OPERATOR_OPTIONS`,
 *     `SEVERITY_OPTIONS`, `OS_SCHEDULE_UNIT_OPTIONS`
 */
import { i18n } from '@osd/i18n';
import { OSPPLNumResultsOperator, UnifiedAlertSeverity } from '../../../../common/types/alerting';
import type { AnnotationEntry, LabelEntry, MonitorBackendType } from '../monitor_form_components';

// `ThresholdCondition` originally lived here AND in
// `common/services/alerting/validators.ts`. The duplication caused drift
// risk; re-export the canonical shape from common.
export type { ThresholdCondition } from '../../../../common/services/alerting/validators';

// Public-side import name kept stable; canonical type lives in common
// (`OSPPLNumResultsOperator` in opensearch_types.ts).
export type PplNumResultsOperator = OSPPLNumResultsOperator;

/** Shared fields across both backend types */
export interface BaseMonitorForm {
  name: string;
  severity: UnifiedAlertSeverity;
  enabled: boolean;
  datasourceId: string;
  datasourceType: MonitorBackendType;
}

/** Prometheus-specific form state */
export interface PrometheusFormState extends BaseMonitorForm {
  datasourceType: 'prometheus';
  query: string;
  threshold: ThresholdCondition;
  evaluationInterval: string;
  pendingPeriod: string;
  firingPeriod: string;
  labels: LabelEntry[];
  annotations: AnnotationEntry[];
}

/** Severity ordinal mapped to the alerting plugin's `1`–`5` codes. */
export type PplTriggerSeverity = '1' | '2' | '3' | '4' | '5';
export type PplTriggerType = 'number_of_results' | 'custom';

export interface PplActionForm {
  id: string;
  name: string;
  /** Empty when nothing has been selected; validators reject save in that state. */
  destinationId: string;
  subject: string;
  message: string;
}

/** Form-state shape for one PPL trigger. Multiple per monitor are allowed. */
export interface PplTriggerForm {
  id: string;
  name: string;
  severity: PplTriggerSeverity;
  type: PplTriggerType;
  numResultsCondition: PplNumResultsOperator;
  numResultsValue: number;
  /** Required when `type === 'custom'`; must start with `where ...`. */
  customCondition: string;
  actions: PplActionForm[];
}

/** OpenSearch-specific form state. The Create flyout only authors PPL monitors;
 * DSL / cluster-metrics monitors are read-only in the Rules table. */
export interface OpenSearchFormState extends BaseMonitorForm {
  datasourceType: 'opensearch';
  monitorType: 'ppl_monitor';
  /**
   * Picked indices, aliases, or wildcard patterns. Drives PPL `source = ...`
   * defaulting and field-level autocomplete in the editor; saved verbatim so
   * cross-cluster patterns (`prod:logs-*`) round-trip cleanly.
   */
  indices: string[];
  /** Index/alias mapping field used as the time-range pivot. May be empty. */
  timeField: string;
  query: string;
  pplTriggers: PplTriggerForm[];
  /** Legacy threshold shape kept for the optimistic UnifiedRule projection. */
  threshold: ThresholdCondition;
  evaluationInterval: string;
  pendingPeriod: string;
  labels: LabelEntry[];
  annotations: AnnotationEntry[];
  schedule: { interval: number; unit: 'MINUTES' | 'HOURS' | 'DAYS' };
}

export type MonitorFormState = PrometheusFormState | OpenSearchFormState;

// ============================================================================
// Default form factories
// ============================================================================

export const DEFAULT_PROM_FORM: PrometheusFormState = {
  name: '',
  datasourceId: '',
  datasourceType: 'prometheus',
  query: '',
  threshold: { operator: '>', value: 80, unit: '%', forDuration: '5m' },
  evaluationInterval: '1m',
  pendingPeriod: '5m',
  firingPeriod: '10m',
  labels: [{ key: 'severity', value: 'warning', isDynamic: true }],
  annotations: [
    { key: 'summary', value: '' },
    { key: 'description', value: '' },
    { key: 'runbook_url', value: '' },
    { key: 'dashboard_url', value: '' },
  ],
  severity: 'medium',
  enabled: true,
};

// Default to `custom` trigger type. PPL alerting queries almost always use
// `stats` (aggregation), which returns exactly 1 row per group — so
// `number_of_results` (which counts rows, not column values) would rarely
// fire as expected. `custom` with `where <column> > threshold` evaluates
// the actual aggregated value, which is what users intend.
//
// The default condition references `error_count` to match the example query
// shown in the flyout. Users must update this when they change the alias.
export const createDefaultPplTrigger = (): PplTriggerForm => ({
  id: `ppl-trigger-${Date.now()}`,
  name: 'trigger-1',
  severity: '3',
  type: 'custom',
  numResultsCondition: '>',
  numResultsValue: 1,
  customCondition: 'where error_count > 0',
  actions: [],
});

export const DEFAULT_OS_FORM: OpenSearchFormState = {
  name: '',
  datasourceId: '',
  datasourceType: 'opensearch',
  monitorType: 'ppl_monitor',
  indices: [],
  timeField: '',
  // No `source = ...` default. The PPL editor pre-fills `source = <picked>`
  // when the user adds an index, so defaulting here would clash with that.
  query: '',
  pplTriggers: [createDefaultPplTrigger()],
  threshold: { operator: '>', value: 100, unit: '', forDuration: '5m' },
  evaluationInterval: '1m',
  pendingPeriod: '5m',
  labels: [{ key: 'severity', value: 'warning' }],
  annotations: [
    { key: 'summary', value: '' },
    { key: 'description', value: '' },
  ],
  schedule: { interval: 1, unit: 'MINUTES' },
  severity: 'medium',
  enabled: true,
};

// ============================================================================
// Option arrays for EuiSelect
// ============================================================================

export const INTERVAL_OPTIONS = [
  {
    value: '15s',
    text: i18n.translate('observability.alerting.createMonitorTypes.interval15s', {
      defaultMessage: '15 seconds',
    }),
  },
  {
    value: '30s',
    text: i18n.translate('observability.alerting.createMonitorTypes.interval30s', {
      defaultMessage: '30 seconds',
    }),
  },
  {
    value: '1m',
    text: i18n.translate('observability.alerting.createMonitorTypes.interval1m', {
      defaultMessage: '1 minute',
    }),
  },
  {
    value: '2m',
    text: i18n.translate('observability.alerting.createMonitorTypes.interval2m', {
      defaultMessage: '2 minutes',
    }),
  },
  {
    value: '5m',
    text: i18n.translate('observability.alerting.createMonitorTypes.interval5m', {
      defaultMessage: '5 minutes',
    }),
  },
  {
    value: '10m',
    text: i18n.translate('observability.alerting.createMonitorTypes.interval10m', {
      defaultMessage: '10 minutes',
    }),
  },
  {
    value: '15m',
    text: i18n.translate('observability.alerting.createMonitorTypes.interval15m', {
      defaultMessage: '15 minutes',
    }),
  },
  {
    value: '30m',
    text: i18n.translate('observability.alerting.createMonitorTypes.interval30m', {
      defaultMessage: '30 minutes',
    }),
  },
  {
    value: '1h',
    text: i18n.translate('observability.alerting.createMonitorTypes.interval1h', {
      defaultMessage: '1 hour',
    }),
  },
];

export const DURATION_OPTIONS = [
  {
    value: '0s',
    text: i18n.translate('observability.alerting.createMonitorTypes.duration0s', {
      defaultMessage: 'Immediately (0s)',
    }),
  },
  {
    value: '30s',
    text: i18n.translate('observability.alerting.createMonitorTypes.duration30s', {
      defaultMessage: '30 seconds',
    }),
  },
  {
    value: '1m',
    text: i18n.translate('observability.alerting.createMonitorTypes.duration1m', {
      defaultMessage: '1 minute',
    }),
  },
  {
    value: '2m',
    text: i18n.translate('observability.alerting.createMonitorTypes.duration2m', {
      defaultMessage: '2 minutes',
    }),
  },
  {
    value: '5m',
    text: i18n.translate('observability.alerting.createMonitorTypes.duration5m', {
      defaultMessage: '5 minutes',
    }),
  },
  {
    value: '10m',
    text: i18n.translate('observability.alerting.createMonitorTypes.duration10m', {
      defaultMessage: '10 minutes',
    }),
  },
  {
    value: '15m',
    text: i18n.translate('observability.alerting.createMonitorTypes.duration15m', {
      defaultMessage: '15 minutes',
    }),
  },
  {
    value: '30m',
    text: i18n.translate('observability.alerting.createMonitorTypes.duration30m', {
      defaultMessage: '30 minutes',
    }),
  },
  {
    value: '1h',
    text: i18n.translate('observability.alerting.createMonitorTypes.duration1h', {
      defaultMessage: '1 hour',
    }),
  },
];

export const OPERATOR_OPTIONS = [
  {
    value: '>',
    text: i18n.translate('observability.alerting.createMonitorTypes.operatorGt', {
      defaultMessage: '> (greater than)',
    }),
  },
  {
    value: '>=',
    text: i18n.translate('observability.alerting.createMonitorTypes.operatorGte', {
      defaultMessage: '>= (greater or equal)',
    }),
  },
  {
    value: '<',
    text: i18n.translate('observability.alerting.createMonitorTypes.operatorLt', {
      defaultMessage: '< (less than)',
    }),
  },
  {
    value: '<=',
    text: i18n.translate('observability.alerting.createMonitorTypes.operatorLte', {
      defaultMessage: '<= (less or equal)',
    }),
  },
  {
    value: '==',
    text: i18n.translate('observability.alerting.createMonitorTypes.operatorEq', {
      defaultMessage: '== (equal)',
    }),
  },
  {
    value: '!=',
    text: i18n.translate('observability.alerting.createMonitorTypes.operatorNeq', {
      defaultMessage: '!= (not equal)',
    }),
  },
];

export const SEVERITY_OPTIONS = [
  {
    value: 'critical',
    text: i18n.translate('observability.alerting.createMonitorTypes.severityCritical', {
      defaultMessage: 'Critical',
    }),
  },
  {
    value: 'high',
    text: i18n.translate('observability.alerting.createMonitorTypes.severityHigh', {
      defaultMessage: 'High',
    }),
  },
  {
    value: 'medium',
    text: i18n.translate('observability.alerting.createMonitorTypes.severityMedium', {
      defaultMessage: 'Medium (Warning)',
    }),
  },
  {
    value: 'low',
    text: i18n.translate('observability.alerting.createMonitorTypes.severityLow', {
      defaultMessage: 'Low',
    }),
  },
  {
    value: 'info',
    text: i18n.translate('observability.alerting.createMonitorTypes.severityInfo', {
      defaultMessage: 'Info',
    }),
  },
];

export const OS_SCHEDULE_UNIT_OPTIONS = [
  {
    value: 'MINUTES',
    text: i18n.translate('observability.alerting.createMonitorTypes.scheduleUnitMinutes', {
      defaultMessage: 'Minutes',
    }),
  },
  {
    value: 'HOURS',
    text: i18n.translate('observability.alerting.createMonitorTypes.scheduleUnitHours', {
      defaultMessage: 'Hours',
    }),
  },
  {
    value: 'DAYS',
    text: i18n.translate('observability.alerting.createMonitorTypes.scheduleUnitDays', {
      defaultMessage: 'Days',
    }),
  },
];

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
 *     `SEVERITY_OPTIONS`, `OS_MONITOR_TYPE_OPTIONS`,
 *     `CLUSTER_METRICS_API_OPTIONS`, `OS_SCHEDULE_UNIT_OPTIONS`
 */
import { UnifiedAlertSeverity } from '../../../../common/types/alerting';
import type { AnnotationEntry, LabelEntry, MonitorBackendType } from '../monitor_form_components';

// ============================================================================
// Types
// ============================================================================

export interface ThresholdCondition {
  operator: '>' | '>=' | '<' | '<=' | '==' | '!=';
  value: number;
  unit: string;
  forDuration: string;
}

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

/** OpenSearch-specific form state */
export interface OpenSearchFormState extends BaseMonitorForm {
  datasourceType: 'opensearch';
  monitorType:
    | 'ppl_monitor'
    | 'query_level_monitor'
    | 'bucket_level_monitor'
    | 'doc_level_monitor'
    | 'cluster_metrics_monitor';
  indices: string;
  query: string;
  // PPL monitor trigger fields (Prometheus-like)
  threshold: ThresholdCondition;
  evaluationInterval: string;
  pendingPeriod: string;
  labels: LabelEntry[];
  annotations: AnnotationEntry[];
  // DSL monitor trigger fields
  triggerName: string;
  triggerCondition: string;
  actionName: string;
  actionDestination: string;
  actionMessage: string;
  schedule: { interval: number; unit: 'MINUTES' | 'HOURS' | 'DAYS' };
  // Cluster metrics fields
  clusterMetricsApiType: string;
  clusterMetricsPathParams: string;
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

export const DEFAULT_OS_FORM: OpenSearchFormState = {
  name: '',
  datasourceId: '',
  datasourceType: 'opensearch',
  monitorType: 'ppl_monitor',
  indices: '',
  query: 'source = logs-* | where @timestamp > NOW() - INTERVAL 5 MINUTE | stats count() as cnt',
  // PPL trigger defaults (Prometheus-like)
  threshold: { operator: '>', value: 100, unit: '', forDuration: '5m' },
  evaluationInterval: '1m',
  pendingPeriod: '5m',
  labels: [{ key: 'severity', value: 'warning' }],
  annotations: [
    { key: 'summary', value: '' },
    { key: 'description', value: '' },
  ],
  // DSL trigger defaults
  triggerName: '',
  triggerCondition: 'ctx.results[0].hits.total.value > 100',
  actionName: '',
  actionDestination: '',
  actionMessage: '',
  schedule: { interval: 1, unit: 'MINUTES' },
  // Cluster metrics defaults
  clusterMetricsApiType: 'CLUSTER_HEALTH',
  clusterMetricsPathParams: '',
  severity: 'medium',
  enabled: true,
};

// ============================================================================
// Option arrays for EuiSelect
// ============================================================================

export const INTERVAL_OPTIONS = [
  { value: '15s', text: '15 seconds' },
  { value: '30s', text: '30 seconds' },
  { value: '1m', text: '1 minute' },
  { value: '2m', text: '2 minutes' },
  { value: '5m', text: '5 minutes' },
  { value: '10m', text: '10 minutes' },
  { value: '15m', text: '15 minutes' },
  { value: '30m', text: '30 minutes' },
  { value: '1h', text: '1 hour' },
];

export const DURATION_OPTIONS = [
  { value: '0s', text: 'Immediately (0s)' },
  { value: '30s', text: '30 seconds' },
  { value: '1m', text: '1 minute' },
  { value: '2m', text: '2 minutes' },
  { value: '5m', text: '5 minutes' },
  { value: '10m', text: '10 minutes' },
  { value: '15m', text: '15 minutes' },
  { value: '30m', text: '30 minutes' },
  { value: '1h', text: '1 hour' },
];

export const OPERATOR_OPTIONS = [
  { value: '>', text: '> (greater than)' },
  { value: '>=', text: '>= (greater or equal)' },
  { value: '<', text: '< (less than)' },
  { value: '<=', text: '<= (less or equal)' },
  { value: '==', text: '== (equal)' },
  { value: '!=', text: '!= (not equal)' },
];

export const SEVERITY_OPTIONS = [
  { value: 'critical', text: 'Critical' },
  { value: 'high', text: 'High' },
  { value: 'medium', text: 'Medium (Warning)' },
  { value: 'low', text: 'Low' },
  { value: 'info', text: 'Info' },
];

export const OS_MONITOR_TYPE_OPTIONS = [
  { value: 'ppl_monitor', text: 'PPL (Piped Processing Language)' },
  { value: 'query_level_monitor', text: 'Per query (DSL)' },
  { value: 'bucket_level_monitor', text: 'Per bucket (DSL)' },
  { value: 'doc_level_monitor', text: 'Per document (DSL)' },
  { value: 'cluster_metrics_monitor', text: 'Cluster Metrics' },
];

export const CLUSTER_METRICS_API_OPTIONS = [
  { value: 'CLUSTER_HEALTH', text: 'Cluster Health' },
  { value: 'CLUSTER_STATS', text: 'Cluster Stats' },
  { value: 'CLUSTER_SETTINGS', text: 'Cluster Settings' },
  { value: 'NODES_STATS', text: 'Nodes Stats' },
  { value: 'CAT_INDICES', text: 'CAT Indices' },
  { value: 'CAT_PENDING_TASKS', text: 'CAT Pending Tasks' },
  { value: 'CAT_RECOVERY', text: 'CAT Recovery' },
  { value: 'CAT_SHARDS', text: 'CAT Shards' },
  { value: 'CAT_SNAPSHOTS', text: 'CAT Snapshots' },
  { value: 'CAT_TASKS', text: 'CAT Tasks' },
];

export const OS_SCHEDULE_UNIT_OPTIONS = [
  { value: 'MINUTES', text: 'Minutes' },
  { value: 'HOURS', text: 'Hours' },
  { value: 'DAYS', text: 'Days' },
];

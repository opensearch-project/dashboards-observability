/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Constants, option arrays, mock preview data, and chart-option helpers for
 * the Create Logs Monitor flyout. Shared across the flyout shell and every
 * `sections/*` sub-component. Pure TS — no React / JSX imports.
 *
 * Contents:
 *   - Option arrays for `EuiSelect` / `EuiButtonGroup`:
 *     `MONITOR_TYPE_OPTIONS`, `MONITOR_TYPE_DESCRIPTIONS`, `SEVERITY_OPTIONS`,
 *     `TRIGGER_TYPE_OPTIONS_BY_MONITOR`, `CONDITION_OPERATOR_OPTIONS`,
 *     `FREQUENCY_OPTIONS`, `TIME_UNIT_OPTIONS`, `DATASOURCE_OPTIONS`,
 *     `NOTIFICATION_CHANNEL_OPTIONS`, `CLUSTER_METRICS_API_OPTIONS`,
 *     `BUCKET_AGGREGATION_OPTIONS`
 *   - Defaults: `DEFAULT_ACTION_MESSAGE`, `DEFAULT_QUERIES`, `SAMPLE_PPL_QUERIES`
 *   - Mock preview data: `PREVIEW_TIMESTAMPS`, `PREVIEW_VALUES`, `MOCK_TABLE_ROWS`
 *   - Chart helpers: `PREVIEW_CHART_OPTION`, `buildTriggerChartOption`
 *   - Factory: `createDefaultTrigger`
 */
import { LogsMonitorType, TriggerState } from './create_logs_monitor_types';

export const MONITOR_TYPE_OPTIONS = [
  { id: 'query_level', label: 'Query level' },
  { id: 'bucket_level', label: 'Bucket level' },
  { id: 'document_level', label: 'Document level' },
  { id: 'cluster_metrics', label: 'Cluster metrics' },
];

export const MONITOR_TYPE_DESCRIPTIONS: Record<LogsMonitorType, string> = {
  query_level: 'Run a query and check the results against a threshold.',
  bucket_level: 'Aggregate data into buckets and check each bucket against a condition.',
  document_level: 'Match individual documents and fire per-document alerts.',
  cluster_metrics: 'Monitor OpenSearch cluster health, stats, and node information.',
};

export const SEVERITY_OPTIONS = [
  { value: 'critical', text: 'Critical' },
  { value: 'high', text: 'High' },
  { value: 'medium', text: 'Medium' },
  { value: 'low', text: 'Low' },
  { value: 'info', text: 'Info' },
];

export const TRIGGER_TYPE_OPTIONS_BY_MONITOR: Record<
  LogsMonitorType,
  Array<{ value: string; text: string }>
> = {
  query_level: [
    { value: 'extraction_query_response', text: 'Extraction query response' },
    { value: 'document_count', text: 'Document count' },
  ],
  bucket_level: [{ value: 'bucket_level_trigger', text: 'Bucket level trigger' }],
  document_level: [{ value: 'document_level_trigger', text: 'Document level trigger' }],
  cluster_metrics: [{ value: 'extraction_query_response', text: 'Extraction query response' }],
};

export const CONDITION_OPERATOR_OPTIONS = [
  { value: 'is_greater_than', text: 'is greater than' },
  { value: 'is_less_than', text: 'is less than' },
  { value: 'is_equal_to', text: 'is equal to' },
  { value: 'is_not_equal_to', text: 'is not equal to' },
  { value: 'is_greater_or_equal', text: 'is greater than or equal' },
  { value: 'is_less_or_equal', text: 'is less than or equal' },
];

export const FREQUENCY_OPTIONS = [
  { value: 'by_interval', text: 'By interval' },
  { value: 'daily', text: 'Daily' },
  { value: 'weekly', text: 'Weekly' },
  { value: 'monthly', text: 'Monthly' },
  { value: 'custom_cron', text: 'Custom cron expression' },
];

export const TIME_UNIT_OPTIONS = [
  { value: 'minute(s)', text: 'minute(s)' },
  { value: 'hour(s)', text: 'hour(s)' },
  { value: 'day(s)', text: 'day(s)' },
];

export const DATASOURCE_OPTIONS = ['OpenSearch', 'OpenSearch-logs', 'OpenSearch-metrics'];

export const NOTIFICATION_CHANNEL_OPTIONS = [
  { value: 'oncall_slack', text: 'Oncall (Slack)' },
  { value: 'pagerduty', text: 'PagerDuty' },
  { value: 'email', text: 'Email' },
  { value: 'webhook', text: 'Webhook' },
];

export const CLUSTER_METRICS_API_OPTIONS = [
  { value: '_cluster/health', text: 'Cluster health' },
  { value: '_cluster/stats', text: 'Cluster stats' },
  { value: '_nodes/stats', text: 'Node stats' },
  { value: '_cat/pending_tasks', text: 'CAT pending tasks' },
  { value: '_cat/recovery', text: 'CAT recovery' },
  { value: '_cat/snapshots', text: 'CAT snapshots' },
  { value: '_cat/tasks', text: 'CAT tasks' },
];

export const BUCKET_AGGREGATION_OPTIONS = [
  { value: 'count', text: 'Count' },
  { value: 'sum', text: 'Sum' },
  { value: 'avg', text: 'Average' },
  { value: 'min', text: 'Min' },
  { value: 'max', text: 'Max' },
];

export const DEFAULT_ACTION_MESSAGE = `Monitor {{ctx.monitor.name}} just entered alert status. Please investigate the issue.
  - Trigger: {{ctx.trigger.name}}
  - Severity: {{ctx.trigger.severity}}
  - Period start: {{ctx.periodStart}}
  - Period end: {{ctx.periodEnd}}`;

export const DEFAULT_QUERIES: Record<LogsMonitorType, string> = {
  query_level: `source = logs-* | where @timestamp > NOW() - INTERVAL 5 MINUTE
| stats count() as EVENTS_LAST_HOUR_v2 by span(@timestamp, 1h)`,
  bucket_level: `{
  "size": 0,
  "query": { "match_all": {} },
  "aggs": {
    "by_host": {
      "terms": { "field": "host.keyword", "size": 10 },
      "aggs": {
        "error_count": { "filter": { "term": { "level": "ERROR" } } }
      }
    }
  }
}`,
  document_level: `{
  "query": {
    "bool": {
      "must": [
        { "match": { "level": "ERROR" } },
        { "range": { "@timestamp": { "gte": "now-5m" } } }
      ]
    }
  }
}`,
  cluster_metrics: '',
};

export const SAMPLE_PPL_QUERIES = [
  {
    label: 'Events last hour',
    query: `source = logs-* | where @timestamp > NOW() - INTERVAL 1 HOUR\n| stats count() as EVENTS_LAST_HOUR by span(@timestamp, 1h)`,
  },
  {
    label: 'Error count by service',
    query: `source = logs-* | where level = 'ERROR'\n| stats count() as error_count by service`,
  },
  {
    label: 'Login failures',
    query: `source = logs-* | where eventType = 'login' AND status = 'false'\n| stats count() as failed_logins by span(@timestamp, 1h)`,
  },
];

export function createDefaultTrigger(index: number, monitorType: LogsMonitorType): TriggerState {
  const triggerTypeOpts = TRIGGER_TYPE_OPTIONS_BY_MONITOR[monitorType];
  return {
    id: `trigger-${Date.now()}-${index}`,
    name: `Trigger ${index + 1}`,
    severityLevel: 'critical',
    type: triggerTypeOpts[0]?.value || 'extraction_query_response',
    conditionOperator: 'is_greater_than',
    conditionValue: 5,
    suppressEnabled: false,
    suppressExpiry: 24,
    suppressExpiryUnit: 'hour(s)',
    actions: [],
  };
}

// Mock preview data
export const PREVIEW_TIMESTAMPS = [
  '04:00',
  '05:00',
  '06:00',
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
];
export const PREVIEW_VALUES = [3, 5, 2, 7, 4, 8, 6, 9, 3, 5, 7, 4, 6, 8];

export const MOCK_TABLE_ROWS = Array.from({ length: 10 }, (_, i) => ({
  date: `Nov 15, 2025 @ 15:59:0${i}.883`,
  eventType: 'login',
  status: 'false',
}));

// ============================================================================
// Chart helpers
// ============================================================================

export const PREVIEW_CHART_OPTION: Record<string, unknown> = {
  grid: { left: 40, right: 16, top: 16, bottom: 32 },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: PREVIEW_TIMESTAMPS },
  yAxis: { type: 'value', min: 0 },
  series: [{ type: 'bar', data: PREVIEW_VALUES, itemStyle: { color: '#006BB4' } }],
};

export function buildTriggerChartOption(thresholdValue: number): Record<string, unknown> {
  const dynamicMax = Math.max(10, thresholdValue * 1.2, Math.max(...PREVIEW_VALUES) * 1.2);
  return {
    grid: { left: 40, right: 16, top: 16, bottom: 32 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: PREVIEW_TIMESTAMPS },
    yAxis: { type: 'value', min: 0, max: dynamicMax },
    series: [
      {
        type: 'bar',
        data: PREVIEW_VALUES,
        itemStyle: { color: '#006BB4' },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', color: '#BD271E', width: 2 },
          data: [{ yAxis: thresholdValue }],
          label: { formatter: `Threshold: ${thresholdValue}`, position: 'insideEndTop' },
        },
      },
    ],
  };
}

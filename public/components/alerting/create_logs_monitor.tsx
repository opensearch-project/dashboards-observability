/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Create Logs Monitor — flyout form based on the Logs alert spec.
 * Supports four monitor types: Query Level, Bucket Level, Document Level,
 * and Cluster Metrics.
 * Sections: Monitor Details, Monitor Type, Query (PPL / Query Editor), Schedule,
 * Triggers (with threshold visualization), Actions, and a sticky footer.
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  EuiSpacer,
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiFieldText,
  EuiFieldNumber,
  EuiTextArea,
  EuiSelect,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiIcon,
  EuiText,
  EuiBetaBadge,
  EuiAccordion,
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiTitle,
  EuiCheckbox,
  EuiBasicTable,
  EuiHorizontalRule,
  EuiPopover,
  EuiToolTip,
  EuiButtonGroup,
  EuiCallOut,
  EuiConfirmModal,
} from '@elastic/eui';
import { EchartsRender } from './echarts_render';

// ============================================================================
// Types
// ============================================================================

export type LogsMonitorType = 'query_level' | 'bucket_level' | 'document_level' | 'cluster_metrics';

interface TriggerState {
  id: string;
  name: string;
  severityLevel: string;
  type: string;
  conditionOperator: string;
  conditionValue: number;
  suppressEnabled: boolean;
  suppressExpiry: number;
  suppressExpiryUnit: string;
  actions: ActionState[];
}

interface ActionState {
  id: string;
  name: string;
  notificationChannel: string;
  subject: string;
  message: string;
}

export interface LogsMonitorFormState {
  monitorName: string;
  description: string;
  monitorType: LogsMonitorType;
  selectedDatasource: string;
  query: string;
  frequencyType: string;
  runEveryValue: number;
  runEveryUnit: string;
  triggers: TriggerState[];
  // Cluster metrics specific
  clusterMetricsApi: string;
  // Document level specific
  docLevelTags: string;
  docLevelIndices: string;
  // Bucket level specific
  bucketField: string;
  bucketAggregation: string;
}

export interface CreateLogsMonitorProps {
  onCancel: () => void;
  onSave: (form: LogsMonitorFormState) => void;
}

// ============================================================================
// Constants
// ============================================================================

const MONITOR_TYPE_OPTIONS = [
  { id: 'query_level', label: 'Query level' },
  { id: 'bucket_level', label: 'Bucket level' },
  { id: 'document_level', label: 'Document level' },
  { id: 'cluster_metrics', label: 'Cluster metrics' },
];

const MONITOR_TYPE_DESCRIPTIONS: Record<LogsMonitorType, string> = {
  query_level: 'Run a query and check the results against a threshold.',
  bucket_level: 'Aggregate data into buckets and check each bucket against a condition.',
  document_level: 'Match individual documents and fire per-document alerts.',
  cluster_metrics: 'Monitor OpenSearch cluster health, stats, and node information.',
};

const SEVERITY_OPTIONS = [
  { value: 'critical', text: 'Critical' },
  { value: 'high', text: 'High' },
  { value: 'medium', text: 'Medium' },
  { value: 'low', text: 'Low' },
  { value: 'info', text: 'Info' },
];

const TRIGGER_TYPE_OPTIONS_BY_MONITOR: Record<
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

const CONDITION_OPERATOR_OPTIONS = [
  { value: 'is_greater_than', text: 'is greater than' },
  { value: 'is_less_than', text: 'is less than' },
  { value: 'is_equal_to', text: 'is equal to' },
  { value: 'is_not_equal_to', text: 'is not equal to' },
  { value: 'is_greater_or_equal', text: 'is greater than or equal' },
  { value: 'is_less_or_equal', text: 'is less than or equal' },
];

const FREQUENCY_OPTIONS = [
  { value: 'by_interval', text: 'By interval' },
  { value: 'daily', text: 'Daily' },
  { value: 'weekly', text: 'Weekly' },
  { value: 'monthly', text: 'Monthly' },
  { value: 'custom_cron', text: 'Custom cron expression' },
];

const TIME_UNIT_OPTIONS = [
  { value: 'minute(s)', text: 'minute(s)' },
  { value: 'hour(s)', text: 'hour(s)' },
  { value: 'day(s)', text: 'day(s)' },
];

const DATASOURCE_OPTIONS = ['OpenSearch', 'OpenSearch-logs', 'OpenSearch-metrics'];

const NOTIFICATION_CHANNEL_OPTIONS = [
  { value: 'oncall_slack', text: 'Oncall (Slack)' },
  { value: 'pagerduty', text: 'PagerDuty' },
  { value: 'email', text: 'Email' },
  { value: 'webhook', text: 'Webhook' },
];

const CLUSTER_METRICS_API_OPTIONS = [
  { value: '_cluster/health', text: 'Cluster health' },
  { value: '_cluster/stats', text: 'Cluster stats' },
  { value: '_nodes/stats', text: 'Node stats' },
  { value: '_cat/pending_tasks', text: 'CAT pending tasks' },
  { value: '_cat/recovery', text: 'CAT recovery' },
  { value: '_cat/snapshots', text: 'CAT snapshots' },
  { value: '_cat/tasks', text: 'CAT tasks' },
];

const BUCKET_AGGREGATION_OPTIONS = [
  { value: 'count', text: 'Count' },
  { value: 'sum', text: 'Sum' },
  { value: 'avg', text: 'Average' },
  { value: 'min', text: 'Min' },
  { value: 'max', text: 'Max' },
];

const DEFAULT_ACTION_MESSAGE = `Monitor {{ctx.monitor.name}} just entered alert status. Please investigate the issue.
  - Trigger: {{ctx.trigger.name}}
  - Severity: {{ctx.trigger.severity}}
  - Period start: {{ctx.periodStart}}
  - Period end: {{ctx.periodEnd}}`;

const DEFAULT_QUERIES: Record<LogsMonitorType, string> = {
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

const SAMPLE_PPL_QUERIES = [
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

function createDefaultTrigger(index: number, monitorType: LogsMonitorType): TriggerState {
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
const PREVIEW_TIMESTAMPS = [
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
const PREVIEW_VALUES = [3, 5, 2, 7, 4, 8, 6, 9, 3, 5, 7, 4, 6, 8];

const MOCK_TABLE_ROWS = Array.from({ length: 10 }, (_, i) => ({
  date: `Nov 15, 2025 @ 15:59:0${i}.883`,
  eventType: 'login',
  status: 'false',
}));

// ============================================================================
// Chart helpers
// ============================================================================

const PREVIEW_CHART_OPTION: Record<string, unknown> = {
  grid: { left: 40, right: 16, top: 16, bottom: 32 },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: PREVIEW_TIMESTAMPS },
  yAxis: { type: 'value', min: 0 },
  series: [{ type: 'bar', data: PREVIEW_VALUES, itemStyle: { color: '#006BB4' } }],
};

function buildTriggerChartOption(thresholdValue: number): Record<string, unknown> {
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

// ============================================================================
// Sub-components
// ============================================================================

/** Section 1: Monitor Details */
const MonitorDetailsSection = React.memo<{
  form: LogsMonitorFormState;
  onUpdate: (patch: Partial<LogsMonitorFormState>) => void;
}>(({ form, onUpdate }) => (
  <EuiAccordion
    id="logs-monitor-details"
    buttonContent={<strong>Monitor Details</strong>}
    initialIsOpen
    paddingSize="m"
  >
    <EuiFormRow label="Monitor name" fullWidth>
      <EuiFieldText
        placeholder="Enter a monitor name"
        value={form.monitorName}
        onChange={(e) => onUpdate({ monitorName: e.target.value })}
        fullWidth
        compressed
        aria-label="Monitor name"
      />
    </EuiFormRow>
    <EuiSpacer size="m" />
    <EuiFormRow
      label={
        <span>
          Description{' '}
          <span
            style={{ fontSize: 12, color: '#98A2B3', fontStyle: 'italic', fontWeight: 'normal' }}
          >
            — optional
          </span>
        </span>
      }
      fullWidth
    >
      <EuiTextArea
        placeholder="Describe this monitor"
        value={form.description}
        onChange={(e) => onUpdate({ description: e.target.value })}
        rows={3}
        fullWidth
        compressed
        aria-label="Monitor description"
      />
    </EuiFormRow>
  </EuiAccordion>
));

/** Section: Monitor Type Selection */
const MonitorTypeSection = React.memo<{
  monitorType: LogsMonitorType;
  onUpdate: (type: LogsMonitorType) => void;
}>(({ monitorType, onUpdate }) => (
  <EuiAccordion
    id="logs-monitor-type"
    buttonContent={<strong>Monitor type</strong>}
    initialIsOpen
    paddingSize="m"
  >
    <EuiButtonGroup
      legend="Select monitor type"
      options={MONITOR_TYPE_OPTIONS}
      idSelected={monitorType}
      onChange={(id) => onUpdate(id as LogsMonitorType)}
      buttonSize="compressed"
      isFullWidth
    />
    <EuiSpacer size="s" />
    <EuiCallOut size="s" color="primary" iconType="iInCircle">
      <EuiText size="xs">{MONITOR_TYPE_DESCRIPTIONS[monitorType]}</EuiText>
    </EuiCallOut>
  </EuiAccordion>
));

/** Section 2: Query */
const QuerySection = React.memo<{
  form: LogsMonitorFormState;
  onUpdate: (patch: Partial<LogsMonitorFormState>) => void;
  showPreview: boolean;
  onRunPreview: () => void;
}>(({ form, onUpdate, showPreview, onRunPreview }) => {
  const [showDsPicker, setShowDsPicker] = useState(false);
  const [showQueryLibrary, setShowQueryLibrary] = useState(false);

  const isClusterMetrics = form.monitorType === 'cluster_metrics';
  const lineCount = form.query.split('\n').length;

  const handleQueryLibrarySelect = (query: string) => {
    onUpdate({ query });
    setShowQueryLibrary(false);
  };

  if (isClusterMetrics) {
    return (
      <EuiAccordion
        id="logs-query-section"
        buttonContent={<strong>Cluster metrics</strong>}
        initialIsOpen
        paddingSize="m"
      >
        <EuiFormRow label="API" fullWidth>
          <EuiSelect
            options={CLUSTER_METRICS_API_OPTIONS}
            value={form.clusterMetricsApi}
            onChange={(e) => onUpdate({ clusterMetricsApi: e.target.value })}
            compressed
            fullWidth
            aria-label="Cluster metrics API"
          />
        </EuiFormRow>
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          The monitor will periodically call the selected API and evaluate the trigger condition
          against the response.
        </EuiText>
      </EuiAccordion>
    );
  }

  const isPPL = form.monitorType === 'query_level';

  return (
    <EuiAccordion
      id="logs-query-section"
      buttonContent={<strong>Query</strong>}
      initialIsOpen
      paddingSize="m"
      extraAction={
        <EuiButton size="s" onClick={onRunPreview} aria-label="Run preview">
          Run preview
        </EuiButton>
      }
    >
      {/* Toolbar + editor in a single bordered panel */}
      <EuiPanel paddingSize="s" hasBorder style={{ borderRadius: 4 }}>
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
          <EuiFlexItem grow={false}>
            <EuiBetaBadge
              label={isPPL ? 'PPL' : 'DSL'}
              tooltipContent={isPPL ? 'Piped Processing Language' : 'OpenSearch Query DSL'}
              size="s"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiPopover
              button={
                <EuiButtonEmpty
                  size="xs"
                  iconType="database"
                  iconSide="left"
                  onClick={() => setShowDsPicker(!showDsPicker)}
                  aria-label="Select data source"
                >
                  <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                    <EuiFlexItem grow={false}>{form.selectedDatasource}</EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiIcon type="arrowDown" size="s" />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiButtonEmpty>
              }
              isOpen={showDsPicker}
              closePopover={() => setShowDsPicker(false)}
              panelPaddingSize="s"
            >
              {DATASOURCE_OPTIONS.map((ds) => (
                <EuiButtonEmpty
                  key={ds}
                  size="xs"
                  onClick={() => {
                    onUpdate({ selectedDatasource: ds });
                    setShowDsPicker(false);
                  }}
                  style={{ display: 'block', width: '100%', textAlign: 'left' }}
                >
                  {ds}
                </EuiButtonEmpty>
              ))}
            </EuiPopover>
          </EuiFlexItem>
          {isPPL && (
            <EuiFlexItem grow={false}>
              <EuiPopover
                button={
                  <EuiButtonEmpty
                    size="xs"
                    iconType="addBookmark"
                    iconSide="left"
                    onClick={() => setShowQueryLibrary(!showQueryLibrary)}
                    aria-label="Query library"
                  >
                    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                      <EuiFlexItem grow={false}>Query library</EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiIcon type="arrowDown" size="s" />
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiButtonEmpty>
                }
                isOpen={showQueryLibrary}
                closePopover={() => setShowQueryLibrary(false)}
                panelPaddingSize="s"
              >
                {SAMPLE_PPL_QUERIES.map((sq, i) => (
                  <EuiButtonEmpty
                    key={i}
                    size="xs"
                    onClick={() => handleQueryLibrarySelect(sq.query)}
                    style={{ display: 'block', width: '100%', textAlign: 'left' }}
                  >
                    {sq.label}
                  </EuiButtonEmpty>
                ))}
              </EuiPopover>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>

        <EuiSpacer size="s" />

        {/* Code editor with line numbers */}
        <div style={{ position: 'relative' }}>
          <div
            style={{
              display: 'flex',
              border: '1px solid #D3DAE6',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            {/* Line number gutter */}
            <div
              aria-hidden="true"
              style={{
                padding: '8px 0',
                minWidth: 36,
                textAlign: 'right',
                fontFamily: 'monospace',
                fontSize: 13,
                lineHeight: '20px',
                color: '#98A2B3',
                backgroundColor: '#F5F7FA',
                borderRight: '1px solid #D3DAE6',
                userSelect: 'none',
                flexShrink: 0,
              }}
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i} style={{ paddingRight: 8 }}>
                  {i + 1}
                </div>
              ))}
            </div>
            {/* Textarea */}
            <textarea
              value={form.query}
              onChange={(e) => onUpdate({ query: e.target.value })}
              rows={Math.max(2, lineCount)}
              style={{
                flex: 1,
                fontFamily: 'monospace',
                fontSize: 13,
                lineHeight: '20px',
                padding: '8px 12px',
                border: 'none',
                outline: 'none',
                resize: 'none',
                backgroundColor: 'transparent',
              }}
              aria-label={`${isPPL ? 'PPL' : 'DSL'} query editor`}
            />
          </div>
          <div
            style={{ position: 'absolute', top: 4, right: 4, zIndex: 2, display: 'flex', gap: 2 }}
          >
            <EuiToolTip content="Copy query">
              <EuiButtonIcon
                iconType="copy"
                size="s"
                color="subdued"
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(form.query);
                  } catch (_) {
                    /* clipboard unavailable */
                  }
                }}
                aria-label="Copy query"
              />
            </EuiToolTip>
          </div>
        </div>
      </EuiPanel>

      {/* Bucket level specific fields */}
      {form.monitorType === 'bucket_level' && (
        <>
          <EuiSpacer size="m" />
          <EuiFlexGroup gutterSize="m">
            <EuiFlexItem>
              <EuiFormRow label="Bucket field" display="rowCompressed">
                <EuiFieldText
                  placeholder="e.g. host.keyword"
                  value={form.bucketField}
                  onChange={(e) => onUpdate({ bucketField: e.target.value })}
                  compressed
                  aria-label="Bucket field"
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiFormRow label="Aggregation" display="rowCompressed">
                <EuiSelect
                  options={BUCKET_AGGREGATION_OPTIONS}
                  value={form.bucketAggregation}
                  onChange={(e) => onUpdate({ bucketAggregation: e.target.value })}
                  compressed
                  aria-label="Bucket aggregation"
                />
              </EuiFormRow>
            </EuiFlexItem>
          </EuiFlexGroup>
        </>
      )}

      {/* Document level specific fields */}
      {form.monitorType === 'document_level' && (
        <>
          <EuiSpacer size="m" />
          <EuiFlexGroup gutterSize="m">
            <EuiFlexItem>
              <EuiFormRow label="Indices" display="rowCompressed">
                <EuiFieldText
                  placeholder="e.g. logs-*, application-logs"
                  value={form.docLevelIndices}
                  onChange={(e) => onUpdate({ docLevelIndices: e.target.value })}
                  compressed
                  aria-label="Document level indices"
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiFormRow
                label="Tags"
                display="rowCompressed"
                helpText="Comma-separated tags for document-level queries"
              >
                <EuiFieldText
                  placeholder="e.g. error, critical"
                  value={form.docLevelTags}
                  onChange={(e) => onUpdate({ docLevelTags: e.target.value })}
                  compressed
                  aria-label="Document level tags"
                />
              </EuiFormRow>
            </EuiFlexItem>
          </EuiFlexGroup>
        </>
      )}

      {/* Preview Results */}
      {showPreview && (
        <>
          <EuiSpacer size="m" />
          <EuiAccordion
            id="logs-preview-results"
            buttonContent={
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>
                  <strong>Results (34)</strong>
                </EuiFlexItem>
              </EuiFlexGroup>
            }
            initialIsOpen
            paddingSize="s"
          >
            <EuiCallOut size="s" color="warning" iconType="iInCircle">
              <EuiText size="xs">Sample data — run the monitor to see real results</EuiText>
            </EuiCallOut>
            <EuiSpacer size="s" />
            <EuiText size="xs" color="subdued">
              EVENTS_LAST_HOUR_v2
            </EuiText>
            <EuiSpacer size="s" />
            <EchartsRender spec={PREVIEW_CHART_OPTION} height={200} />
            <EuiSpacer size="s" />
            <EuiBasicTable
              items={MOCK_TABLE_ROWS}
              columns={[
                { field: 'date', name: 'Date' },
                { field: 'eventType', name: 'Event type' },
                { field: 'status', name: 'Status' },
              ]}
              tableLayout="auto"
            />
          </EuiAccordion>
        </>
      )}
    </EuiAccordion>
  );
});

/** Section 3: Schedule */
const ScheduleSection = React.memo<{
  form: LogsMonitorFormState;
  onUpdate: (patch: Partial<LogsMonitorFormState>) => void;
}>(({ form, onUpdate }) => (
  <EuiAccordion
    id="logs-schedule-section"
    buttonContent={<strong>Schedule</strong>}
    initialIsOpen
    paddingSize="m"
  >
    <EuiFlexGroup gutterSize="m">
      <EuiFlexItem>
        <EuiFormRow label="Frequency" display="rowCompressed">
          <EuiSelect
            options={FREQUENCY_OPTIONS}
            value={form.frequencyType}
            onChange={(e) => onUpdate({ frequencyType: e.target.value })}
            compressed
            aria-label="Frequency"
          />
        </EuiFormRow>
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiFormRow label="Run every" display="rowCompressed">
          <EuiFlexGroup gutterSize="s" responsive={false}>
            <EuiFlexItem>
              <EuiFieldNumber
                value={form.runEveryValue}
                onChange={(e) => onUpdate({ runEveryValue: parseInt(e.target.value, 10) || 1 })}
                min={1}
                compressed
                aria-label="Run every value"
              />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiSelect
                options={TIME_UNIT_OPTIONS}
                value={form.runEveryUnit}
                onChange={(e) => onUpdate({ runEveryUnit: e.target.value })}
                compressed
                aria-label="Run every unit"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFormRow>
      </EuiFlexItem>
    </EuiFlexGroup>
  </EuiAccordion>
));

/** Single Trigger sub-section */
const TriggerItem = React.memo<{
  trigger: TriggerState;
  index: number;
  monitorType: LogsMonitorType;
  totalTriggers: number;
  onUpdate: (id: string, patch: Partial<TriggerState>) => void;
  onDelete: (id: string) => void;
  onUpdateAction: (triggerId: string, actionId: string, patch: Partial<ActionState>) => void;
  onDeleteAction: (triggerId: string, actionId: string) => void;
  onAddAction: (triggerId: string) => void;
}>(
  ({
    trigger,
    index,
    monitorType,
    totalTriggers,
    onUpdate,
    onDelete,
    onUpdateAction,
    onDeleteAction,
    onAddAction,
  }) => {
    const triggerTypeOptions = TRIGGER_TYPE_OPTIONS_BY_MONITOR[monitorType];
    return (
      <EuiAccordion
        id={`trigger-${trigger.id}`}
        buttonContent={<strong>{trigger.name || `Trigger ${index + 1}`}</strong>}
        initialIsOpen
        paddingSize="m"
        extraAction={
          <EuiButtonEmpty
            size="xs"
            color="danger"
            onClick={() => onDelete(trigger.id)}
            isDisabled={totalTriggers <= 1}
            aria-label={`Delete ${trigger.name}`}
          >
            Delete
          </EuiButtonEmpty>
        }
      >
        <EuiFormRow label="Trigger name" fullWidth>
          <EuiFieldText
            value={trigger.name}
            onChange={(e) => onUpdate(trigger.id, { name: e.target.value })}
            fullWidth
            compressed
            aria-label="Trigger name"
          />
        </EuiFormRow>
        <EuiSpacer size="s" />

        <EuiFlexGroup gutterSize="m">
          <EuiFlexItem>
            <EuiFormRow label="Severity level" display="rowCompressed">
              <EuiSelect
                options={SEVERITY_OPTIONS}
                value={trigger.severityLevel}
                onChange={(e) => onUpdate(trigger.id, { severityLevel: e.target.value })}
                compressed
                aria-label="Severity level"
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFormRow label="Type" display="rowCompressed">
              <EuiSelect
                options={triggerTypeOptions}
                value={trigger.type}
                onChange={(e) => onUpdate(trigger.id, { type: e.target.value })}
                compressed
                aria-label="Trigger type"
              />
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />

        {/* Trigger condition */}
        <EuiFormRow label="Trigger condition">
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem>
              <EuiSelect
                options={CONDITION_OPERATOR_OPTIONS}
                value={trigger.conditionOperator}
                onChange={(e) => onUpdate(trigger.id, { conditionOperator: e.target.value })}
                compressed
                aria-label="Condition operator"
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false} style={{ minWidth: 100 }}>
              <EuiFieldNumber
                value={trigger.conditionValue}
                onChange={(e) =>
                  onUpdate(trigger.id, { conditionValue: parseFloat(e.target.value) || 0 })
                }
                compressed
                aria-label="Condition value"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFormRow>
        <EuiSpacer size="m" />

        {/* Threshold visualization */}
        <EuiPanel paddingSize="s" color="subdued">
          <EuiCallOut size="s" color="warning" iconType="iInCircle">
            <EuiText size="xs">Sample data — run the monitor to see real results</EuiText>
          </EuiCallOut>
          <EuiSpacer size="xs" />
          <EuiText size="xs">
            <strong>Results</strong>
          </EuiText>
          <EuiText size="xs" color="subdued">
            EVENTS_LAST_HOUR_v2
          </EuiText>
          <EuiSpacer size="xs" />
          <EchartsRender spec={buildTriggerChartOption(trigger.conditionValue)} height={180} />
        </EuiPanel>
        <EuiSpacer size="m" />

        {/* Suppress */}
        <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiToolTip content="Suppress repeat notifications for this trigger for the specified duration after the first alert fires.">
              <EuiCheckbox
                id={`suppress-${trigger.id}`}
                label="Suppress"
                checked={trigger.suppressEnabled}
                onChange={(e) => onUpdate(trigger.id, { suppressEnabled: e.target.checked })}
              />
            </EuiToolTip>
          </EuiFlexItem>
          {trigger.suppressEnabled && (
            <>
              <EuiFlexItem grow={false}>
                <EuiFormRow label="Expires" display="rowCompressed">
                  <EuiFlexGroup gutterSize="xs" responsive={false}>
                    <EuiFlexItem style={{ minWidth: 60 }}>
                      <EuiFieldNumber
                        value={trigger.suppressExpiry}
                        onChange={(e) =>
                          onUpdate(trigger.id, {
                            suppressExpiry: parseInt(e.target.value, 10) || 1,
                          })
                        }
                        min={1}
                        compressed
                        aria-label="Suppress expiry value"
                      />
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiSelect
                        options={TIME_UNIT_OPTIONS}
                        value={trigger.suppressExpiryUnit}
                        onChange={(e) =>
                          onUpdate(trigger.id, { suppressExpiryUnit: e.target.value })
                        }
                        compressed
                        aria-label="Suppress expiry unit"
                      />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFormRow>
              </EuiFlexItem>
            </>
          )}
        </EuiFlexGroup>
        <EuiSpacer size="m" />

        {/* Notification actions */}
        <EuiTitle size="xxs">
          <h4>Notification actions ({trigger.actions.length})</h4>
        </EuiTitle>
        <EuiSpacer size="s" />
        {trigger.actions.map((action, actionIdx) => (
          <React.Fragment key={action.id}>
            {actionIdx > 0 && <EuiSpacer size="xs" />}
            <EuiPanel paddingSize="s" hasBorder>
              <EuiAccordion
                id={`action-${action.id}`}
                buttonContent={<span>{action.name}</span>}
                paddingSize="s"
                extraAction={
                  <EuiButtonEmpty
                    size="xs"
                    color="danger"
                    onClick={() => onDeleteAction(trigger.id, action.id)}
                    aria-label={`Delete action ${action.name}`}
                  >
                    Delete
                  </EuiButtonEmpty>
                }
              >
                <EuiFormRow label="Notification channel" display="rowCompressed" fullWidth>
                  <EuiSelect
                    options={NOTIFICATION_CHANNEL_OPTIONS}
                    value={action.notificationChannel}
                    onChange={(e) =>
                      onUpdateAction(trigger.id, action.id, { notificationChannel: e.target.value })
                    }
                    compressed
                    fullWidth
                    aria-label="Notification channel"
                  />
                </EuiFormRow>
                <EuiSpacer size="s" />
                <EuiFormRow label="Subject" display="rowCompressed" fullWidth>
                  <EuiFieldText
                    placeholder="Enter a subject"
                    value={action.subject}
                    onChange={(e) =>
                      onUpdateAction(trigger.id, action.id, { subject: e.target.value })
                    }
                    compressed
                    fullWidth
                    aria-label="Action subject"
                  />
                </EuiFormRow>
                <EuiSpacer size="s" />
                <EuiFormRow
                  label="Message"
                  helpText="Embed variables in your message using Mustache templates. Learn more"
                  display="rowCompressed"
                  fullWidth
                >
                  <EuiTextArea
                    placeholder={DEFAULT_ACTION_MESSAGE}
                    value={action.message}
                    onChange={(e) =>
                      onUpdateAction(trigger.id, action.id, { message: e.target.value })
                    }
                    rows={6}
                    fullWidth
                    compressed
                    aria-label="Action message"
                  />
                </EuiFormRow>
              </EuiAccordion>
            </EuiPanel>
          </React.Fragment>
        ))}
        <EuiSpacer size="s" />
        <EuiButtonEmpty
          size="s"
          iconType="plusInCircle"
          onClick={() => onAddAction(trigger.id)}
          aria-label="Add another action"
        >
          Add another action
        </EuiButtonEmpty>
      </EuiAccordion>
    );
  }
);

const TriggersSection = React.memo<{
  triggers: TriggerState[];
  monitorType: LogsMonitorType;
  onUpdateTrigger: (id: string, patch: Partial<TriggerState>) => void;
  onDeleteTrigger: (id: string) => void;
  onAddTrigger: () => void;
  onUpdateAction: (triggerId: string, actionId: string, patch: Partial<ActionState>) => void;
  onDeleteAction: (triggerId: string, actionId: string) => void;
  onAddAction: (triggerId: string) => void;
}>(
  ({
    triggers,
    monitorType,
    onUpdateTrigger,
    onDeleteTrigger,
    onAddTrigger,
    onUpdateAction,
    onDeleteAction,
    onAddAction,
  }) => (
    <section aria-label="Triggers">
      <EuiTitle size="xs">
        <h3>Triggers ({triggers.length})</h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      {triggers.map((trigger, idx) => (
        <React.Fragment key={trigger.id}>
          {idx > 0 && <EuiSpacer size="m" />}
          <EuiPanel paddingSize="s" hasBorder>
            <TriggerItem
              trigger={trigger}
              index={idx}
              monitorType={monitorType}
              totalTriggers={triggers.length}
              onUpdate={onUpdateTrigger}
              onDelete={onDeleteTrigger}
              onUpdateAction={onUpdateAction}
              onDeleteAction={onDeleteAction}
              onAddAction={onAddAction}
            />
          </EuiPanel>
        </React.Fragment>
      ))}
      <EuiSpacer size="s" />
      <EuiButtonEmpty
        size="s"
        iconType="plusInCircle"
        onClick={onAddTrigger}
        aria-label="Add another trigger"
      >
        Add another trigger
      </EuiButtonEmpty>
    </section>
  )
);

// ============================================================================
// Main Component
// ============================================================================

export const CreateLogsMonitor: React.FC<CreateLogsMonitorProps> = ({ onCancel, onSave }) => {
  const [form, setForm] = useState<LogsMonitorFormState>({
    monitorName: '',
    description: '',
    monitorType: 'query_level',
    selectedDatasource: 'OpenSearch',
    query: DEFAULT_QUERIES.query_level,
    frequencyType: 'by_interval',
    runEveryValue: 1,
    runEveryUnit: 'minute(s)',
    triggers: [createDefaultTrigger(0, 'query_level')],
    clusterMetricsApi: '_cluster/health',
    docLevelTags: '',
    docLevelIndices: '',
    bucketField: '',
    bucketAggregation: 'count',
  });
  const [showPreview, setShowPreview] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [pendingTypeSwitch, setPendingTypeSwitch] = useState<LogsMonitorType | null>(null);
  const initialFormRef = useRef(form);

  const isDirty =
    form.monitorName !== '' ||
    form.query !== initialFormRef.current.query ||
    form.triggers.length !== initialFormRef.current.triggers.length;

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onCancel();
    }
  }, [isDirty, onCancel]);

  const updateForm = useCallback((patch: Partial<LogsMonitorFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const applyTypeSwitch = useCallback((type: LogsMonitorType) => {
    setForm((prev) => ({
      ...prev,
      monitorType: type,
      query: DEFAULT_QUERIES[type],
      triggers: [createDefaultTrigger(0, type)],
    }));
    setShowPreview(false);
    setPendingTypeSwitch(null);
  }, []);

  const handleMonitorTypeChange = useCallback(
    (type: LogsMonitorType) => {
      const isModified =
        form.monitorName.trim() !== '' ||
        form.triggers.length !== 1 ||
        form.triggers[0]?.name !== 'Trigger 1' ||
        form.triggers[0]?.actions.length > 0 ||
        form.triggers[0]?.conditionValue !== 5;
      if (isModified) {
        setPendingTypeSwitch(type);
      } else {
        applyTypeSwitch(type);
      }
    },
    [form.monitorName, form.triggers, applyTypeSwitch]
  );

  const updateTrigger = useCallback((id: string, patch: Partial<TriggerState>) => {
    setForm((prev) => ({
      ...prev,
      triggers: prev.triggers.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }, []);

  const deleteTrigger = useCallback((id: string) => {
    setForm((prev) => ({
      ...prev,
      triggers: prev.triggers.filter((t) => t.id !== id),
    }));
  }, []);

  const addTrigger = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      triggers: [...prev.triggers, createDefaultTrigger(prev.triggers.length, prev.monitorType)],
    }));
  }, []);

  const updateAction = useCallback(
    (triggerId: string, actionId: string, patch: Partial<ActionState>) => {
      setForm((prev) => ({
        ...prev,
        triggers: prev.triggers.map((t) =>
          t.id === triggerId
            ? { ...t, actions: t.actions.map((a) => (a.id === actionId ? { ...a, ...patch } : a)) }
            : t
        ),
      }));
    },
    []
  );

  const deleteAction = useCallback((triggerId: string, actionId: string) => {
    setForm((prev) => ({
      ...prev,
      triggers: prev.triggers.map((t) =>
        t.id === triggerId ? { ...t, actions: t.actions.filter((a) => a.id !== actionId) } : t
      ),
    }));
  }, []);

  const addAction = useCallback((triggerId: string) => {
    setForm((prev) => ({
      ...prev,
      triggers: prev.triggers.map((t) => {
        if (t.id !== triggerId) return t;
        const name = `action_${t.actions.length + 1}`;
        return {
          ...t,
          actions: [
            ...t.actions,
            {
              id: `action-${Date.now()}-${t.actions.length}`,
              name,
              notificationChannel: 'oncall_slack',
              subject: 'Alert: {{ctx.monitor.name}} - {{ctx.trigger.name}}',
              message: DEFAULT_ACTION_MESSAGE,
            },
          ],
        };
      }),
    }));
  }, []);

  const handleRunPreview = useCallback(() => {
    setShowPreview(true);
  }, []);

  const isValid =
    form.monitorName.trim() !== '' &&
    (form.monitorType === 'cluster_metrics' || form.query.trim() !== '') &&
    form.triggers.length > 0;

  return (
    <EuiFlyout onClose={handleClose} size="l" ownFocus aria-labelledby="createLogsMonitorTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2 id="createLogsMonitorTitle">Create Logs Monitor</h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          Log-based alerting monitor
        </EuiText>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <MonitorDetailsSection form={form} onUpdate={updateForm} />
        <EuiHorizontalRule margin="l" />
        <MonitorTypeSection monitorType={form.monitorType} onUpdate={handleMonitorTypeChange} />
        <EuiHorizontalRule margin="l" />
        <QuerySection
          form={form}
          onUpdate={updateForm}
          showPreview={showPreview}
          onRunPreview={handleRunPreview}
        />
        <EuiHorizontalRule margin="l" />
        <ScheduleSection form={form} onUpdate={updateForm} />
        <EuiHorizontalRule margin="l" />
        <TriggersSection
          triggers={form.triggers}
          monitorType={form.monitorType}
          onUpdateTrigger={updateTrigger}
          onDeleteTrigger={deleteTrigger}
          onAddTrigger={addTrigger}
          onUpdateAction={updateAction}
          onDeleteAction={deleteAction}
          onAddAction={addAction}
        />
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="flexEnd" responsive={false} gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={handleClose}>Cancel</EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton fill onClick={() => onSave(form)} isDisabled={!isValid}>
              Create
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>

      {showDiscardConfirm && (
        <EuiConfirmModal
          title="Discard unsaved changes?"
          onCancel={() => setShowDiscardConfirm(false)}
          onConfirm={() => {
            setShowDiscardConfirm(false);
            onCancel();
          }}
          cancelButtonText="Keep editing"
          confirmButtonText="Discard"
          buttonColor="danger"
        >
          <p>You have unsaved changes. Discard?</p>
        </EuiConfirmModal>
      )}

      {pendingTypeSwitch !== null && (
        <EuiConfirmModal
          title="Change monitor type?"
          onCancel={() => setPendingTypeSwitch(null)}
          onConfirm={() => applyTypeSwitch(pendingTypeSwitch)}
          cancelButtonText="Cancel"
          confirmButtonText="Confirm"
          buttonColor="danger"
          data-test-subj="confirmTypeSwitchModal"
        >
          <p>Changing monitor type will reset your query and triggers. Continue?</p>
        </EuiConfirmModal>
      )}
    </EuiFlyout>
  );
};

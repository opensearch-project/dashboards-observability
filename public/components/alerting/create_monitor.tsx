/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Create Monitor — flyout workflow for creating either a Prometheus (PromQL)
 * or OpenSearch monitor. The user picks the target datasource first, which
 * determines the form variant shown.
 */
import React, { useState, useMemo } from 'react';
import {
  EuiSpacer,
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiFieldText,
  EuiFieldNumber,
  EuiSelect,
  EuiTextArea,
  EuiButton,
  EuiButtonEmpty,
  EuiText,
  EuiBadge,
  EuiAccordion,
  EuiSwitch,
  EuiCallOut,
  EuiTabs,
  EuiTab,
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiTitle,
} from '@elastic/eui';
import { PromQLEditor, validatePromQL } from './promql_editor';
import { MetricBrowser } from './metric_browser';
import { Datasource, UnifiedAlertSeverity } from '../../../server/services/alerting';
import {
  validateMonitorForm,
  MonitorFormState as ValidatorFormState,
} from '../../../common/services/alerting/validators';
import { AiMonitorWizard, AlertTemplate } from './ai_monitor_wizard';
import {
  LabelEditor,
  AnnotationEditor,
  DatasourceTargetSelector,
  MonitorBackendType,
} from './monitor_form_components';
import type { LabelEntry, AnnotationEntry } from './monitor_form_components';

// ============================================================================
// Types
// ============================================================================

interface ThresholdCondition {
  operator: '>' | '>=' | '<' | '<=' | '==' | '!=';
  value: number;
  unit: string;
  forDuration: string;
}

/** Shared fields across both backend types */
interface BaseMonitorForm {
  name: string;
  severity: UnifiedAlertSeverity;
  enabled: boolean;
  datasourceId: string;
  datasourceType: MonitorBackendType;
}

/** Prometheus-specific form state */
interface PrometheusFormState extends BaseMonitorForm {
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
interface OpenSearchFormState extends BaseMonitorForm {
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

const DEFAULT_PROM_FORM: PrometheusFormState = {
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

const DEFAULT_OS_FORM: OpenSearchFormState = {
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

const INTERVAL_OPTIONS = [
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

const DURATION_OPTIONS = [
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

const OPERATOR_OPTIONS = [
  { value: '>', text: '> (greater than)' },
  { value: '>=', text: '>= (greater or equal)' },
  { value: '<', text: '< (less than)' },
  { value: '<=', text: '<= (less or equal)' },
  { value: '==', text: '== (equal)' },
  { value: '!=', text: '!= (not equal)' },
];

const SEVERITY_OPTIONS = [
  { value: 'critical', text: 'Critical' },
  { value: 'high', text: 'High' },
  { value: 'medium', text: 'Medium (Warning)' },
  { value: 'low', text: 'Low' },
  { value: 'info', text: 'Info' },
];

const OS_MONITOR_TYPE_OPTIONS = [
  { value: 'ppl_monitor', text: 'PPL (Piped Processing Language)' },
  { value: 'query_level_monitor', text: 'Per query (DSL)' },
  { value: 'bucket_level_monitor', text: 'Per bucket (DSL)' },
  { value: 'doc_level_monitor', text: 'Per document (DSL)' },
  { value: 'cluster_metrics_monitor', text: 'Cluster Metrics' },
];

const CLUSTER_METRICS_API_OPTIONS = [
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

const OS_SCHEDULE_UNIT_OPTIONS = [
  { value: 'MINUTES', text: 'Minutes' },
  { value: 'HOURS', text: 'Hours' },
  { value: 'DAYS', text: 'Days' },
];

// ============================================================================
// Form Section Sub-components (LabelEditor, AnnotationEditor,
// DatasourceTargetSelector imported from ./monitor_form_components)
// ============================================================================

// ============================================================================
// Prometheus Form Section
// ============================================================================

const PrometheusFormSection: React.FC<{
  form: PrometheusFormState;
  onUpdate: <K extends keyof PrometheusFormState>(key: K, value: PrometheusFormState[K]) => void;
  validationErrors: Record<string, string>;
  hasSubmitted: boolean;
  context?: { service?: string; team?: string };
}> = ({
  form,
  onUpdate,
  validationErrors: _validationErrors,
  hasSubmitted: _hasSubmitted,
  context,
}) => {
  const [queryTab, setQueryTab] = useState<'editor' | 'browser'>('editor');

  const updateThreshold = <K extends keyof ThresholdCondition>(
    key: K,
    value: ThresholdCondition[K]
  ) => {
    onUpdate('threshold', { ...form.threshold, [key]: value });
  };

  const handleMetricSelect = (metricName: string) => {
    if (!form.query) {
      onUpdate('query', metricName);
    } else {
      onUpdate('query', form.query + (form.query.endsWith(' ') ? '' : ' ') + metricName);
    }
    setQueryTab('editor');
  };

  const previewYaml = useMemo(() => {
    const labels = form.labels.filter((l) => l.key && l.value);
    const annotations = form.annotations.filter((a) => a.key && a.value);
    let yaml = `- alert: ${form.name || '<monitor-name>'}\n`;
    yaml += `  expr: ${form.query || '<promql-expression>'} ${form.threshold.operator} ${
      form.threshold.value
    }\n`;
    yaml += `  for: ${form.threshold.forDuration}\n`;
    if (labels.length > 0) {
      yaml += `  labels:\n`;
      for (const l of labels) yaml += `    ${l.key}: ${l.isDynamic ? l.value : `"${l.value}"`}\n`;
    }
    if (annotations.length > 0) {
      yaml += `  annotations:\n`;
      for (const a of annotations) yaml += `    ${a.key}: "${a.value}"\n`;
    }
    return yaml;
  }, [form]);

  return (
    <>
      {/* Query Definition */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiTitle size="xs">
          <h3>PromQL Query</h3>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiTabs size="s">
          <EuiTab isSelected={queryTab === 'editor'} onClick={() => setQueryTab('editor')}>
            Query Editor
          </EuiTab>
          <EuiTab isSelected={queryTab === 'browser'} onClick={() => setQueryTab('browser')}>
            Metric Browser
          </EuiTab>
        </EuiTabs>
        <EuiSpacer size="s" />
        {queryTab === 'editor' ? (
          <PromQLEditor value={form.query} onChange={(v) => onUpdate('query', v)} height={80} />
        ) : (
          <MetricBrowser onSelectMetric={handleMetricSelect} currentQuery={form.query} />
        )}
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* Threshold Condition */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiTitle size="xs">
          <h3>Alert Condition</h3>
        </EuiTitle>
        <EuiText size="xs" color="subdued">
          Define when this monitor should fire an alert
        </EuiText>
        <EuiSpacer size="s" />
        <EuiFlexGroup gutterSize="s" wrap>
          <EuiFlexItem style={{ minWidth: 160 }}>
            <EuiFormRow label="Operator" display="rowCompressed">
              <EuiSelect
                options={OPERATOR_OPTIONS}
                value={form.threshold.operator}
                onChange={(e) =>
                  updateThreshold('operator', e.target.value as ThresholdCondition['operator'])
                }
                compressed
                aria-label="Threshold operator"
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem style={{ minWidth: 100 }}>
            <EuiFormRow label="Value" display="rowCompressed">
              <EuiFieldNumber
                value={form.threshold.value}
                onChange={(e) => updateThreshold('value', parseFloat(e.target.value) || 0)}
                compressed
                aria-label="Threshold value"
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem style={{ minWidth: 60 }}>
            <EuiFormRow label="Unit" display="rowCompressed">
              <EuiFieldText
                value={form.threshold.unit}
                onChange={(e) => updateThreshold('unit', e.target.value)}
                placeholder="%"
                compressed
                aria-label="Threshold unit"
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem style={{ minWidth: 160 }}>
            <EuiFormRow label="For Duration" display="rowCompressed">
              <EuiSelect
                options={DURATION_OPTIONS}
                value={form.threshold.forDuration}
                onChange={(e) => updateThreshold('forDuration', e.target.value)}
                compressed
                aria-label="For duration"
              />
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <EuiCallOut size="s" color="primary" iconType="iInCircle">
          <EuiText size="xs">
            Alert fires when:{' '}
            <code>
              {form.query || '<query>'} {form.threshold.operator} {form.threshold.value}
              {form.threshold.unit}
            </code>{' '}
            for {form.threshold.forDuration}
          </EuiText>
        </EuiCallOut>
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* Evaluation Settings */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiTitle size="xs">
          <h3>Evaluation Settings</h3>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiFlexGroup gutterSize="s" wrap>
          <EuiFlexItem style={{ minWidth: 160 }}>
            <EuiFormRow
              label="Eval Interval"
              helpText="How often evaluated"
              display="rowCompressed"
            >
              <EuiSelect
                options={INTERVAL_OPTIONS}
                value={form.evaluationInterval}
                onChange={(e) => onUpdate('evaluationInterval', e.target.value)}
                compressed
                aria-label="Evaluation interval"
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem style={{ minWidth: 160 }}>
            <EuiFormRow label="Pending Period" helpText="Before firing" display="rowCompressed">
              <EuiSelect
                options={DURATION_OPTIONS}
                value={form.pendingPeriod}
                onChange={(e) => onUpdate('pendingPeriod', e.target.value)}
                compressed
                aria-label="Pending period"
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem style={{ minWidth: 160 }}>
            <EuiFormRow label="Firing Period" helpText="Min firing time" display="rowCompressed">
              <EuiSelect
                options={DURATION_OPTIONS}
                value={form.firingPeriod}
                onChange={(e) => onUpdate('firingPeriod', e.target.value)}
                compressed
                aria-label="Firing period"
              />
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* Labels */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiFlexGroup alignItems="center" responsive={false} gutterSize="s">
          <EuiFlexItem>
            <EuiTitle size="xs">
              <h3>Labels</h3>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              Categorize and route alerts
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <LabelEditor
          labels={form.labels}
          onChange={(l) => onUpdate('labels', l)}
          context={context}
        />
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* Annotations */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiAccordion
          id="annotations"
          buttonContent={
            <EuiFlexGroup alignItems="center" responsive={false} gutterSize="s">
              <EuiFlexItem grow={false}>
                <strong>Annotations</strong>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color="hollow">Optional</EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          }
          initialIsOpen={true}
          paddingSize="none"
        >
          <EuiSpacer size="s" />
          <AnnotationEditor
            annotations={form.annotations}
            onChange={(a) => onUpdate('annotations', a)}
          />
        </EuiAccordion>
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* Preview */}
      <EuiAccordion
        id="preview"
        buttonContent={
          <EuiFlexGroup alignItems="center" responsive={false} gutterSize="s">
            <EuiFlexItem grow={false}>
              <strong>Rule Preview (YAML)</strong>
            </EuiFlexItem>
          </EuiFlexGroup>
        }
        initialIsOpen={false}
        paddingSize="m"
      >
        <EuiPanel color="subdued" paddingSize="s">
          <pre style={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap', margin: 0 }}>
            {previewYaml}
          </pre>
        </EuiPanel>
      </EuiAccordion>
    </>
  );
};

// ============================================================================
// OpenSearch Form Section
// ============================================================================

const OpenSearchFormSection: React.FC<{
  form: OpenSearchFormState;
  onUpdate: <K extends keyof OpenSearchFormState>(key: K, value: OpenSearchFormState[K]) => void;
  validationErrors: Record<string, string>;
  hasSubmitted: boolean;
  context?: { service?: string; team?: string };
}> = ({ form, onUpdate, validationErrors, hasSubmitted, context }) => {
  const isPPL = form.monitorType === 'ppl_monitor';
  const isClusterMetrics = form.monitorType === 'cluster_metrics_monitor';

  const handleMonitorTypeChange = (type: OpenSearchFormState['monitorType']) => {
    onUpdate('monitorType', type);
    // Reset query to appropriate default when switching between PPL and DSL types
    const wasPPL = form.monitorType === 'ppl_monitor';
    const nowPPL = type === 'ppl_monitor';
    if (wasPPL !== nowPPL && type !== 'cluster_metrics_monitor') {
      const defaultPPL =
        'source = logs-* | where @timestamp > NOW() - INTERVAL 5 MINUTE | stats count() as cnt';
      const defaultDSL =
        '{\n  "size": 0,\n  "query": {\n    "bool": {\n      "filter": [\n        { "range": { "@timestamp": { "gte": "now-5m" } } }\n      ]\n    }\n  }\n}';
      const isDefault =
        form.query.trim() === defaultPPL.trim() ||
        form.query.trim() === defaultDSL.trim() ||
        form.query.trim() === '';
      if (isDefault) {
        onUpdate('query', nowPPL ? defaultPPL : defaultDSL);
      }
    }
  };

  const updateThreshold = <K extends keyof ThresholdCondition>(
    key: K,
    value: ThresholdCondition[K]
  ) => {
    onUpdate('threshold', { ...form.threshold, [key]: value });
  };

  return (
    <>
      {/* Monitor Type */}
      <EuiFormRow label="Monitor Type" fullWidth>
        <EuiSelect
          options={OS_MONITOR_TYPE_OPTIONS}
          value={form.monitorType}
          onChange={(e) =>
            handleMonitorTypeChange(e.target.value as OpenSearchFormState['monitorType'])
          }
          fullWidth
          aria-label="Monitor type"
        />
      </EuiFormRow>

      <EuiSpacer size="m" />

      {/* Data Source — index pattern or cluster metrics API */}
      {isClusterMetrics ? (
        <EuiPanel paddingSize="m" color="subdued">
          <EuiTitle size="xs">
            <h3>Cluster Metrics API</h3>
          </EuiTitle>
          <EuiText size="xs" color="subdued">
            Select a cluster API to monitor. The monitor will call this API on the configured
            schedule and evaluate the trigger condition against the response.
          </EuiText>
          <EuiSpacer size="s" />
          <EuiFormRow label="API Type" fullWidth>
            <EuiSelect
              options={CLUSTER_METRICS_API_OPTIONS}
              value={form.clusterMetricsApiType}
              onChange={(e) => onUpdate('clusterMetricsApiType', e.target.value)}
              fullWidth
              aria-label="Cluster metrics API type"
            />
          </EuiFormRow>
          <EuiSpacer size="s" />
          <EuiFormRow
            label="Path Parameters"
            helpText="Optional path parameters, e.g. index name for CAT indices"
            fullWidth
          >
            <EuiFieldText
              placeholder="e.g. my-index-*"
              value={form.clusterMetricsPathParams}
              onChange={(e) => onUpdate('clusterMetricsPathParams', e.target.value)}
              fullWidth
              aria-label="Cluster metrics path parameters"
            />
          </EuiFormRow>
        </EuiPanel>
      ) : (
        <>
          <EuiPanel paddingSize="m" color="subdued">
            <EuiTitle size="xs">
              <h3>Data Source</h3>
            </EuiTitle>
            <EuiSpacer size="s" />
            <EuiFormRow
              label="Index Pattern"
              helpText={
                isPPL
                  ? 'Used as the PPL source if not specified in the query'
                  : 'Comma-separated index patterns, e.g. logs-*, metrics-*'
              }
              fullWidth
              isInvalid={hasSubmitted && !!validationErrors.indices}
              error={hasSubmitted ? validationErrors.indices : undefined}
            >
              <EuiFieldText
                placeholder="logs-*, metrics-*"
                value={form.indices}
                onChange={(e) => onUpdate('indices', e.target.value)}
                fullWidth
                aria-label="Index pattern"
              />
            </EuiFormRow>
          </EuiPanel>

          <EuiSpacer size="m" />

          {/* Query */}
          <EuiPanel paddingSize="m" color="subdued">
            <EuiTitle size="xs">
              <h3>Query</h3>
            </EuiTitle>
            <EuiText size="xs" color="subdued">
              {isPPL
                ? 'Piped Processing Language — pipe-delimited query syntax'
                : 'OpenSearch Query DSL (JSON)'}
            </EuiText>
            <EuiSpacer size="s" />
            <EuiTextArea
              value={form.query}
              onChange={(e) => onUpdate('query', e.target.value)}
              rows={isPPL ? 4 : 8}
              fullWidth
              placeholder={
                isPPL
                  ? 'source = logs-* | where status >= 500 | stats count() as error_count'
                  : '{ "size": 0, "query": { ... } }'
              }
              style={{ fontFamily: 'monospace', fontSize: 12 }}
              aria-label={isPPL ? 'PPL query' : 'Query DSL'}
            />
            {isPPL && (
              <>
                <EuiSpacer size="xs" />
                <EuiText size="xs" color="subdued">
                  Example:{' '}
                  <code>
                    source = logs-* | where status {'>'} 500 | stats count() as error_count by host
                  </code>
                </EuiText>
              </>
            )}
          </EuiPanel>
        </>
      )}

      <EuiSpacer size="m" />

      {/* Schedule */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiTitle size="xs">
          <h3>Schedule</h3>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiFlexGroup gutterSize="s">
          <EuiFlexItem>
            <EuiFormRow label="Run every" display="rowCompressed">
              <EuiFieldNumber
                value={form.schedule.interval}
                onChange={(e) =>
                  onUpdate('schedule', {
                    ...form.schedule,
                    interval: parseInt(e.target.value, 10) || 1,
                  })
                }
                min={1}
                compressed
                aria-label="Schedule interval"
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFormRow label="Unit" display="rowCompressed">
              <EuiSelect
                options={OS_SCHEDULE_UNIT_OPTIONS}
                value={form.schedule.unit}
                onChange={(e) =>
                  onUpdate('schedule', {
                    ...form.schedule,
                    unit: e.target.value as OpenSearchFormState['schedule']['unit'],
                  })
                }
                compressed
                aria-label="Schedule unit"
              />
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* Trigger — PPL uses Prometheus-like threshold + labels/annotations; DSL uses Painless */}
      {isPPL ? (
        <>
          {/* Threshold Condition */}
          <EuiPanel paddingSize="m" color="subdued">
            <EuiTitle size="xs">
              <h3>Alert Condition</h3>
            </EuiTitle>
            <EuiText size="xs" color="subdued">
              Define when this monitor should fire an alert
            </EuiText>
            <EuiSpacer size="s" />
            <EuiFlexGroup gutterSize="s" wrap>
              <EuiFlexItem style={{ minWidth: 160 }}>
                <EuiFormRow label="Operator" display="rowCompressed">
                  <EuiSelect
                    options={OPERATOR_OPTIONS}
                    value={form.threshold.operator}
                    onChange={(e) =>
                      updateThreshold('operator', e.target.value as ThresholdCondition['operator'])
                    }
                    compressed
                    aria-label="Threshold operator"
                  />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem style={{ minWidth: 100 }}>
                <EuiFormRow label="Value" display="rowCompressed">
                  <EuiFieldNumber
                    value={form.threshold.value}
                    onChange={(e) => updateThreshold('value', parseFloat(e.target.value) || 0)}
                    compressed
                    aria-label="Threshold value"
                  />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem style={{ minWidth: 60 }}>
                <EuiFormRow label="Unit" display="rowCompressed">
                  <EuiFieldText
                    value={form.threshold.unit}
                    onChange={(e) => updateThreshold('unit', e.target.value)}
                    placeholder=""
                    compressed
                    aria-label="Threshold unit"
                  />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem style={{ minWidth: 160 }}>
                <EuiFormRow label="For Duration" display="rowCompressed">
                  <EuiSelect
                    options={DURATION_OPTIONS}
                    value={form.threshold.forDuration}
                    onChange={(e) => updateThreshold('forDuration', e.target.value)}
                    compressed
                    aria-label="For duration"
                  />
                </EuiFormRow>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />
            <EuiCallOut size="s" color="primary" iconType="iInCircle">
              <EuiText size="xs">
                Alert fires when query result {form.threshold.operator} {form.threshold.value}
                {form.threshold.unit} for {form.threshold.forDuration}
              </EuiText>
            </EuiCallOut>
          </EuiPanel>

          <EuiSpacer size="m" />

          {/* Evaluation Settings */}
          <EuiPanel paddingSize="m" color="subdued">
            <EuiTitle size="xs">
              <h3>Evaluation Settings</h3>
            </EuiTitle>
            <EuiSpacer size="s" />
            <EuiFlexGroup gutterSize="s" wrap>
              <EuiFlexItem style={{ minWidth: 160 }}>
                <EuiFormRow
                  label="Eval Interval"
                  helpText="How often evaluated"
                  display="rowCompressed"
                >
                  <EuiSelect
                    options={INTERVAL_OPTIONS}
                    value={form.evaluationInterval}
                    onChange={(e) => onUpdate('evaluationInterval', e.target.value)}
                    compressed
                    aria-label="Evaluation interval"
                  />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem style={{ minWidth: 160 }}>
                <EuiFormRow label="Pending Period" helpText="Before firing" display="rowCompressed">
                  <EuiSelect
                    options={DURATION_OPTIONS}
                    value={form.pendingPeriod}
                    onChange={(e) => onUpdate('pendingPeriod', e.target.value)}
                    compressed
                    aria-label="Pending period"
                  />
                </EuiFormRow>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>

          <EuiSpacer size="m" />

          {/* Labels */}
          <EuiPanel paddingSize="m" color="subdued">
            <EuiFlexGroup alignItems="center" responsive={false} gutterSize="s">
              <EuiFlexItem>
                <EuiTitle size="xs">
                  <h3>Labels</h3>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  Categorize and route alerts
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />
            <LabelEditor
              labels={form.labels}
              onChange={(l) => onUpdate('labels', l)}
              context={context}
            />
          </EuiPanel>

          <EuiSpacer size="m" />

          {/* Annotations */}
          <EuiPanel paddingSize="m" color="subdued">
            <EuiAccordion
              id="os-ppl-annotations"
              buttonContent={
                <EuiFlexGroup alignItems="center" responsive={false} gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <strong>Annotations</strong>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="hollow">Optional</EuiBadge>
                  </EuiFlexItem>
                </EuiFlexGroup>
              }
              initialIsOpen={true}
              paddingSize="none"
            >
              <EuiSpacer size="s" />
              <AnnotationEditor
                annotations={form.annotations}
                onChange={(a) => onUpdate('annotations', a)}
              />
            </EuiAccordion>
          </EuiPanel>
        </>
      ) : (
        <>
          {/* DSL Trigger */}
          <EuiPanel paddingSize="m" color="subdued">
            <EuiTitle size="xs">
              <h3>Trigger</h3>
            </EuiTitle>
            <EuiSpacer size="s" />
            <EuiFormRow label="Trigger Name" fullWidth>
              <EuiFieldText
                placeholder="e.g. Error count threshold"
                value={form.triggerName}
                onChange={(e) => onUpdate('triggerName', e.target.value)}
                fullWidth
                aria-label="Trigger name"
              />
            </EuiFormRow>
            <EuiSpacer size="s" />
            <EuiFormRow
              label="Condition (Painless script)"
              helpText="e.g. ctx.results[0].hits.total.value > 100"
              fullWidth
            >
              <EuiFieldText
                placeholder="ctx.results[0].hits.total.value > 100"
                value={form.triggerCondition}
                onChange={(e) => onUpdate('triggerCondition', e.target.value)}
                fullWidth
                style={{ fontFamily: 'monospace' }}
                aria-label="Trigger condition"
              />
            </EuiFormRow>
          </EuiPanel>
        </>
      )}

      <EuiSpacer size="m" />

      {/* Action (optional) */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiAccordion
          id="os-action"
          buttonContent={
            <EuiFlexGroup alignItems="center" responsive={false} gutterSize="s">
              <EuiFlexItem grow={false}>
                <strong>Action</strong>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color="hollow">Optional</EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          }
          initialIsOpen={false}
          paddingSize="none"
        >
          <EuiSpacer size="s" />
          <EuiFormRow label="Action Name">
            <EuiFieldText
              placeholder="Notify Slack"
              value={form.actionName}
              onChange={(e) => onUpdate('actionName', e.target.value)}
              aria-label="Action name"
            />
          </EuiFormRow>
          <EuiSpacer size="s" />
          <EuiFormRow label="Destination ID">
            <EuiFieldText
              placeholder="Destination ID"
              value={form.actionDestination}
              onChange={(e) => onUpdate('actionDestination', e.target.value)}
              aria-label="Destination ID"
            />
          </EuiFormRow>
          <EuiSpacer size="s" />
          <EuiFormRow label="Message Template">
            <EuiTextArea
              placeholder="Alert: {{ctx.monitor.name}} triggered"
              value={form.actionMessage}
              onChange={(e) => onUpdate('actionMessage', e.target.value)}
              rows={3}
              aria-label="Message template"
            />
          </EuiFormRow>
        </EuiAccordion>
      </EuiPanel>
    </>
  );
};

// ============================================================================
// Main Component — Flyout
// ============================================================================

export interface CreateMonitorProps {
  onSave: (monitor: MonitorFormState) => void;
  /** Batch save for AI-generated monitors (does not close the flyout) */
  onBatchSave?: (monitors: MonitorFormState[]) => void;
  onCancel: () => void;
  /** All selectable datasources (including workspace-scoped Prometheus entries) */
  datasources: Datasource[];
  /** Pre-selected datasource IDs from the parent page */
  selectedDsIds?: string[];
  context?: { service?: string; team?: string };
}

type CreationMode = 'manual' | 'ai';

export const CreateMonitor: React.FC<CreateMonitorProps> = ({
  onSave,
  onBatchSave,
  onCancel,
  datasources,
  selectedDsIds,
  context,
}) => {
  // Determine initial datasource from parent selection
  const initialDs = useMemo(() => {
    if (selectedDsIds && selectedDsIds.length > 0) {
      const ds = datasources.find((d) => d.id === selectedDsIds[0]);
      if (ds) return ds;
    }
    return null;
  }, [datasources, selectedDsIds]);

  const initialType: MonitorBackendType =
    initialDs?.type === 'opensearch' ? 'opensearch' : 'prometheus';

  const [creationMode, setCreationMode] = useState<CreationMode>('manual');
  const [backendType, setBackendType] = useState<MonitorBackendType>(initialType);
  const [promForm, setPromForm] = useState<PrometheusFormState>({
    ...DEFAULT_PROM_FORM,
    datasourceId: initialType === 'prometheus' && initialDs ? initialDs.id : '',
  });
  const [osForm, setOsForm] = useState<OpenSearchFormState>({
    ...DEFAULT_OS_FORM,
    datasourceId: initialType === 'opensearch' && initialDs ? initialDs.id : '',
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const updateProm = <K extends keyof PrometheusFormState>(
    key: K,
    value: PrometheusFormState[K]
  ) => {
    setPromForm((prev) => ({ ...prev, [key]: value }));
  };
  const updateOs = <K extends keyof OpenSearchFormState>(key: K, value: OpenSearchFormState[K]) => {
    setOsForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleDatasourceChange = (id: string, type: MonitorBackendType) => {
    setBackendType(type);
    // Reset to manual if switching away from Prometheus
    if (type !== 'prometheus' && creationMode === 'ai') {
      setCreationMode('manual');
    }
    if (type === 'prometheus') {
      setPromForm((prev) => ({ ...prev, datasourceId: id }));
    } else {
      setOsForm((prev) => ({ ...prev, datasourceId: id }));
    }
  };

  // Shared fields
  const activeForm = backendType === 'prometheus' ? promForm : osForm;
  const updateName = (name: string) => {
    if (backendType === 'prometheus') updateProm('name', name);
    else updateOs('name', name);
  };
  const updateSeverity = (sev: UnifiedAlertSeverity) => {
    if (backendType === 'prometheus') updateProm('severity', sev);
    else updateOs('severity', sev);
  };
  const updateEnabled = (enabled: boolean) => {
    if (backendType === 'prometheus') updateProm('enabled', enabled);
    else updateOs('enabled', enabled);
  };

  // Validation
  const queryErrors = backendType === 'prometheus' ? validatePromQL(promForm.query) : [];
  const hasQueryErrors = queryErrors.some((e) => e.severity === 'error');
  const isValid =
    activeForm.name.trim() !== '' &&
    activeForm.datasourceId !== '' &&
    (backendType === 'prometheus'
      ? promForm.query.trim() !== '' && !hasQueryErrors
      : osForm.monitorType === 'ppl_monitor'
      ? osForm.query.trim() !== ''
      : osForm.monitorType === 'cluster_metrics_monitor'
      ? osForm.clusterMetricsApiType.trim() !== ''
      : osForm.indices.trim() !== '' && osForm.triggerCondition.trim() !== '');

  const handleSave = () => {
    setHasSubmitted(true);
    if (backendType === 'prometheus') {
      const result = validateMonitorForm(promForm as ValidatorFormState);
      if (!result.valid) {
        setValidationErrors(result.errors);
        return;
      }
      setValidationErrors({});
      onSave(promForm);
    } else {
      const errors: Record<string, string> = {};
      if (osForm.monitorType === 'ppl_monitor') {
        if (!osForm.query.trim()) errors.query = 'PPL query is required';
      } else if (osForm.monitorType === 'cluster_metrics_monitor') {
        if (!osForm.clusterMetricsApiType.trim())
          errors.clusterMetricsApiType = 'API type is required';
      } else {
        if (!osForm.indices.trim()) errors.indices = 'At least one index pattern is required';
        if (!osForm.triggerCondition.trim())
          errors.triggerCondition = 'Trigger condition is required';
      }
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        return;
      }
      setValidationErrors({});
      onSave(osForm);
    }
  };

  // When AI wizard is active and user is on a Prometheus datasource, delegate to AiMonitorWizard
  if (creationMode === 'ai' && backendType === 'prometheus') {
    return (
      <AiMonitorWizard
        onClose={onCancel}
        onCreateMonitors={(templates: AlertTemplate[]) => {
          // Convert AI templates to MonitorFormState
          const forms: PrometheusFormState[] = templates.map((t) => ({
            datasourceType: 'prometheus' as const,
            datasourceId: promForm.datasourceId,
            name: t.name,
            query: t.query,
            threshold: { operator: '>' as const, value: 0, unit: '', forDuration: t.forDuration },
            evaluationInterval: t.evaluationInterval,
            pendingPeriod: t.forDuration,
            firingPeriod: t.forDuration,
            labels: Object.entries(t.labels).map(([key, value]) => ({ key, value })),
            annotations: Object.entries(t.annotations).map(([key, value]) => ({ key, value })),
            severity: t.severity,
            enabled: true,
          }));
          // Use batch save to add all without closing the flyout
          if (onBatchSave) {
            onBatchSave(forms);
          } else {
            forms.forEach((f) => onSave(f));
          }
        }}
      />
    );
  }

  return (
    <EuiFlyout onClose={onCancel} size="l" ownFocus aria-labelledby="createMonitorFlyoutTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2 id="createMonitorFlyoutTitle">
            Create {backendType === 'prometheus' ? 'Metrics' : 'Logs'} Monitor
          </h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          {backendType === 'prometheus'
            ? 'PromQL-based alerting rule'
            : 'Query-level monitor with triggers'}
        </EuiText>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {/* Target Datasource */}
        <DatasourceTargetSelector
          datasources={datasources}
          selectedId={activeForm.datasourceId}
          onChange={handleDatasourceChange}
        />

        <EuiSpacer size="m" />

        {/* Creation Mode Toggle — AI only available for Prometheus */}
        {backendType === 'prometheus' && (
          <>
            <EuiPanel paddingSize="s" hasBorder>
              <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiText size="xs">
                    <strong>Creation method</strong>
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiFlexGroup gutterSize="xs" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiBadge
                        color={creationMode === 'manual' ? 'primary' : 'hollow'}
                        onClick={() => setCreationMode('manual')}
                        onClickAriaLabel="Manual creation"
                      >
                        Manual
                      </EuiBadge>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiBadge
                        color={creationMode === 'ai' ? 'secondary' : 'hollow'}
                        onClick={() => setCreationMode('ai')}
                        onClickAriaLabel="AI-assisted creation"
                        iconType="sparkles"
                      >
                        AI-assisted
                      </EuiBadge>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPanel>
            <EuiSpacer size="m" />
          </>
        )}

        {/* Monitor Name */}
        <EuiFormRow
          label="Monitor Name"
          fullWidth
          isInvalid={hasSubmitted && (!!validationErrors.name || activeForm.name.trim() === '')}
          error={
            hasSubmitted
              ? validationErrors.name ||
                (activeForm.name.trim() === '' ? 'Name is required' : undefined)
              : undefined
          }
        >
          <EuiFieldText
            placeholder={
              backendType === 'prometheus'
                ? 'e.g. HighCpuUsage, PaymentErrorRate'
                : 'e.g. High Error Rate, Disk Usage Alert'
            }
            value={activeForm.name}
            onChange={(e) => updateName(e.target.value)}
            fullWidth
            aria-label="Monitor name"
          />
        </EuiFormRow>

        <EuiSpacer size="m" />

        {/* Severity + Enabled */}
        <EuiFlexGroup gutterSize="m" alignItems="center">
          <EuiFlexItem grow={3}>
            <EuiFormRow label="Severity" display="rowCompressed">
              <EuiSelect
                options={SEVERITY_OPTIONS}
                value={activeForm.severity}
                onChange={(e) => updateSeverity(e.target.value as UnifiedAlertSeverity)}
                compressed
                aria-label="Severity"
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem grow={1}>
            <EuiFormRow label="Enabled" display="rowCompressed">
              <EuiSwitch
                label=""
                checked={activeForm.enabled}
                onChange={(e) => updateEnabled(e.target.checked)}
              />
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="m" />

        {/* Backend-specific form */}
        {backendType === 'prometheus' ? (
          <PrometheusFormSection
            form={promForm}
            onUpdate={updateProm}
            validationErrors={validationErrors}
            hasSubmitted={hasSubmitted}
            context={context}
          />
        ) : (
          <OpenSearchFormSection
            form={osForm}
            onUpdate={updateOs}
            validationErrors={validationErrors}
            hasSubmitted={hasSubmitted}
            context={context}
          />
        )}
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onCancel}>Cancel</EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiButton onClick={handleSave} isDisabled={!isValid}>
                  Save Monitor
                </EuiButton>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton fill onClick={handleSave} isDisabled={!isValid}>
                  Save &amp; Enable
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};

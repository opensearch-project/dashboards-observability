/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Prometheus form section of the Create Monitor flyout. Renders the
 * PromQL-backed monitor authoring UI: query editor/metric browser, threshold
 * condition, evaluation settings, labels, annotations, and the YAML preview.
 *
 * Split out of the original `create_monitor.tsx` so the flyout shell in
 * `index.tsx` stays focused on orchestration + shared form fields.
 */
import React, { useMemo, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiCallOut,
  EuiFieldNumber,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { PromQLEditor } from '../promql_editor';
import { MetricBrowser } from '../metric_browser';
import { AnnotationEditor, LabelEditor } from '../monitor_form_components';
import {
  DURATION_OPTIONS,
  INTERVAL_OPTIONS,
  OPERATOR_OPTIONS,
  PrometheusFormState,
  ThresholdCondition,
} from './create_monitor_types';

// ============================================================================
// Prometheus Form Section
// ============================================================================

export const PrometheusFormSection: React.FC<{
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

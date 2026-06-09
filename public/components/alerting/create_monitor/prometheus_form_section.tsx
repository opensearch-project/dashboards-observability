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
  EuiLink,
  EuiFormRow,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import { coreRefs } from '../../../framework/core_refs';
import { PromQLMonacoEditor } from '../promql_monaco_editor';
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
  datasourceId?: string;
}> = ({
  form,
  onUpdate,
  validationErrors: _validationErrors,
  hasSubmitted: _hasSubmitted,
  context,
  datasourceId,
}) => {
  const [queryTab, setQueryTab] = useState<'editor' | 'browser'>('editor');

  const updateThreshold = <K extends keyof ThresholdCondition>(
    key: K,
    value: ThresholdCondition[K]
  ) => {
    onUpdate('threshold', { ...form.threshold, [key]: value });
    // Keep pendingPeriod in sync when forDuration is changed in the threshold panel
    if (key === 'forDuration') {
      onUpdate('pendingPeriod', value as string);
    }
  };

  const handleMetricSelect = (metricName: string) => {
    onUpdate('query', metricName);
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
        <EuiFlexGroup
          alignItems="center"
          justifyContent="spaceBetween"
          gutterSize="none"
          responsive={false}
        >
          <EuiFlexItem grow={false}>
            <EuiTitle size="xs">
              <h3>
                {i18n.translate('observability.alerting.prometheusFormSection.queryTitle', {
                  defaultMessage: 'Query',
                })}
              </h3>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiLink
              onClick={() => coreRefs?.application?.navigateToApp('explore/metrics')}
              data-test-subj="alertManagerOpenInMetricsLink"
            >
              {i18n.translate('observability.alerting.prometheusFormSection.openInMetrics', {
                defaultMessage: 'Build query in metrics \u2192',
              })}
            </EuiLink>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />

        <EuiFormRow
          label={i18n.translate('observability.alerting.prometheusFormSection.datasourceLabel', {
            defaultMessage: 'Datasource',
          })}
        >
          <EuiFieldText
            value={datasourceId || 'Not selected'}
            readOnly
            compressed
            prepend={
              <EuiBadge color="hollow">Prometheus</EuiBadge>
            }
          />
        </EuiFormRow>
        <EuiSpacer size="s" />

        <EuiTabs size="s">
          <EuiTab isSelected={queryTab === 'editor'} onClick={() => setQueryTab('editor')}>
            {i18n.translate('observability.alerting.prometheusFormSection.queryEditorTab', {
              defaultMessage: 'Query Editor',
            })}
          </EuiTab>
          <EuiTab isSelected={queryTab === 'browser'} onClick={() => setQueryTab('browser')}>
            {i18n.translate('observability.alerting.prometheusFormSection.metricBrowserTab', {
              defaultMessage: 'Metric Browser',
            })}
          </EuiTab>
        </EuiTabs>
        <EuiSpacer size="s" />
        {queryTab === 'editor' ? (
          <>
            <EuiText size="xs" color="subdued" style={{ marginBottom: 4 }}>
              {i18n.translate('observability.alerting.prometheusFormSection.promqlHelp', {
                defaultMessage: 'PromQL expression. Press Ctrl+Space for metric name suggestions.',
              })}
            </EuiText>
            <PromQLMonacoEditor value={form.query} onChange={(v) => onUpdate('query', v)} height={80} datasourceId={datasourceId} />
            <EuiSpacer size="xs" />
            <EuiText size="xs" color="subdued">
              {'Example: rate(http_requests_total{job="api"}[5m]) > 100'}
            </EuiText>
          </>
        ) : (
          <MetricBrowser onSelectMetric={handleMetricSelect} currentQuery={form.query} datasourceId={datasourceId} />
        )}
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* Threshold Condition */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiTitle size="xs">
          <h3>
            {i18n.translate('observability.alerting.prometheusFormSection.alertConditionTitle', {
              defaultMessage: 'Alert Condition',
            })}
          </h3>
        </EuiTitle>
        <EuiText size="xs" color="subdued">
          {i18n.translate(
            'observability.alerting.prometheusFormSection.alertConditionDescription',
            { defaultMessage: 'Define when this rule should fire an alert' }
          )}
        </EuiText>
        <EuiSpacer size="s" />
        <EuiFlexGroup gutterSize="s" wrap>
          <EuiFlexItem style={{ minWidth: 160 }}>
            <EuiFormRow
              label={i18n.translate('observability.alerting.prometheusFormSection.operatorLabel', {
                defaultMessage: 'Operator',
              })}
              display="rowCompressed"
            >
              <EuiSelect
                options={OPERATOR_OPTIONS}
                value={form.threshold.operator}
                onChange={(e) =>
                  updateThreshold('operator', e.target.value as ThresholdCondition['operator'])
                }
                compressed
                aria-label={i18n.translate(
                  'observability.alerting.prometheusFormSection.thresholdOperatorAriaLabel',
                  { defaultMessage: 'Threshold operator' }
                )}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem style={{ minWidth: 100 }}>
            <EuiFormRow
              label={i18n.translate('observability.alerting.prometheusFormSection.valueLabel', {
                defaultMessage: 'Value',
              })}
              display="rowCompressed"
            >
              <EuiFieldNumber
                value={form.threshold.value}
                onChange={(e) => updateThreshold('value', parseFloat(e.target.value) || 0)}
                compressed
                aria-label={i18n.translate(
                  'observability.alerting.prometheusFormSection.thresholdValueAriaLabel',
                  { defaultMessage: 'Threshold value' }
                )}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem style={{ minWidth: 60 }}>
            <EuiFormRow
              label={i18n.translate(
                'observability.alerting.prometheusFormSection.thresholdUnitLabel',
                { defaultMessage: 'Unit' }
              )}
              display="rowCompressed"
            >
              <EuiFieldText
                value={form.threshold.unit}
                onChange={(e) => updateThreshold('unit', e.target.value)}
                placeholder="%"
                compressed
                aria-label={i18n.translate(
                  'observability.alerting.prometheusFormSection.thresholdUnitAriaLabel',
                  { defaultMessage: 'Threshold unit' }
                )}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem style={{ minWidth: 160 }}>
            <EuiFormRow
              label={i18n.translate(
                'observability.alerting.prometheusFormSection.forDurationLabel',
                { defaultMessage: 'For Duration' }
              )}
              display="rowCompressed"
            >
              <EuiSelect
                options={DURATION_OPTIONS}
                value={form.threshold.forDuration}
                onChange={(e) => updateThreshold('forDuration', e.target.value)}
                compressed
                aria-label={i18n.translate(
                  'observability.alerting.prometheusFormSection.forDurationAriaLabel',
                  { defaultMessage: 'For duration' }
                )}
              />
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <EuiCallOut size="s" color="primary" iconType="iInCircle">
          <EuiText size="xs">
            <FormattedMessage
              id="observability.alerting.prometheusFormSection.alertFiresMessage"
              defaultMessage="Alert fires when: {expression} for {forDuration}"
              values={{
                expression: (
                  <code>
                    {form.query || '<query>'} {form.threshold.operator} {form.threshold.value}
                    {form.threshold.unit}
                  </code>
                ),
                forDuration: form.threshold.forDuration,
              }}
            />
          </EuiText>
        </EuiCallOut>
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* Evaluation Settings */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiTitle size="xs">
          <h3>
            {i18n.translate(
              'observability.alerting.prometheusFormSection.evaluationSettingsTitle',
              { defaultMessage: 'Evaluation Settings' }
            )}
          </h3>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiFlexGroup gutterSize="s" wrap>
          <EuiFlexItem style={{ minWidth: 160 }}>
            <EuiFormRow
              label={i18n.translate(
                'observability.alerting.prometheusFormSection.evalIntervalLabel',
                { defaultMessage: 'Eval Interval' }
              )}
              helpText={i18n.translate(
                'observability.alerting.prometheusFormSection.evalIntervalHelpText',
                { defaultMessage: 'How often evaluated' }
              )}
              display="rowCompressed"
            >
              <EuiSelect
                options={INTERVAL_OPTIONS}
                value={form.evaluationInterval}
                onChange={(e) => onUpdate('evaluationInterval', e.target.value)}
                compressed
                aria-label={i18n.translate(
                  'observability.alerting.prometheusFormSection.evaluationIntervalAriaLabel',
                  { defaultMessage: 'Evaluation interval' }
                )}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem style={{ minWidth: 160 }}>
            <EuiFormRow
              label={i18n.translate(
                'observability.alerting.prometheusFormSection.pendingPeriodLabel',
                { defaultMessage: 'Pending Period' }
              )}
              helpText={i18n.translate(
                'observability.alerting.prometheusFormSection.pendingPeriodHelpText',
                { defaultMessage: 'Before firing' }
              )}
              display="rowCompressed"
            >
              <EuiSelect
                options={DURATION_OPTIONS}
                value={form.pendingPeriod}
                onChange={(e) => {
                  onUpdate('pendingPeriod', e.target.value);
                  // Sync threshold.forDuration to match pendingPeriod
                  onUpdate('threshold', { ...form.threshold, forDuration: e.target.value });
                }}
                compressed
                aria-label={i18n.translate(
                  'observability.alerting.prometheusFormSection.pendingPeriodAriaLabel',
                  { defaultMessage: 'Pending period' }
                )}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem style={{ minWidth: 160 }}>
            <EuiFormRow
              label={i18n.translate(
                'observability.alerting.prometheusFormSection.firingPeriodLabel',
                { defaultMessage: 'Firing Period' }
              )}
              helpText={i18n.translate(
                'observability.alerting.prometheusFormSection.firingPeriodHelpText',
                { defaultMessage: 'Min firing time' }
              )}
              display="rowCompressed"
            >
              <EuiSelect
                options={DURATION_OPTIONS}
                value={form.firingPeriod}
                onChange={(e) => onUpdate('firingPeriod', e.target.value)}
                compressed
                aria-label={i18n.translate(
                  'observability.alerting.prometheusFormSection.firingPeriodAriaLabel',
                  { defaultMessage: 'Firing period' }
                )}
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
              <h3>
                {i18n.translate('observability.alerting.prometheusFormSection.labelsTitle', {
                  defaultMessage: 'Labels',
                })}
              </h3>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              {i18n.translate('observability.alerting.prometheusFormSection.labelsDescription', {
                defaultMessage: 'Categorize and route alerts',
              })}
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
                <strong>
                  {i18n.translate('observability.alerting.prometheusFormSection.annotationsTitle', {
                    defaultMessage: 'Annotations',
                  })}
                </strong>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color="hollow">
                  {i18n.translate('observability.alerting.prometheusFormSection.optionalBadge', {
                    defaultMessage: 'Optional',
                  })}
                </EuiBadge>
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
              <strong>
                {i18n.translate('observability.alerting.prometheusFormSection.rulePreviewTitle', {
                  defaultMessage: 'Rule Preview (YAML)',
                })}
              </strong>
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

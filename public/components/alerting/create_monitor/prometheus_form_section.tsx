/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Prometheus form section of the Create Monitor flyout — simplified for
 * managed Prometheus (AMP) customers.
 *
 * Matches the Metrics page query UX:
 *   - Builder/Code toggle for query authoring
 *   - Builder mode: metric dropdown + label name/value filters
 *   - Code mode: PromQL Monaco editor
 *   - Query library & Metric browser popovers
 *   - Trigger condition (operator, value, for duration)
 *   - Rule group configuration
 *   - Labels & annotations
 *   - YAML preview
 *
 * Removed (not applicable to managed Prometheus):
 *   - "Unit" field in threshold
 *   - "Evaluation Settings" section (managed at rule group level in AMP)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiBetaBadge,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiButtonIcon,
  EuiCallOut,
  EuiComboBox,
  EuiFieldNumber,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiIcon,
  EuiPanel,
  EuiPopover,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { FormattedMessage } from '@osd/i18n/react';
import { i18n } from '@osd/i18n';
import { PromQLMonacoEditor } from '../promql_monaco_editor';
import { MetricBrowser } from '../metric_browser';
import { AnnotationEditor, LabelEditor } from '../monitor_form_components';
import { AlertingPromResourcesService } from '../query_services/alerting_prom_resources_service';
import {
  DURATION_OPTIONS,
  OPERATOR_OPTIONS,
  PrometheusFormState,
  ThresholdCondition,
} from './create_monitor_types';

// ============================================================================
// Constants
// ============================================================================

const SAMPLE_QUERIES = [
  {
    label: 'HTTP request rate by status code',
    query: 'sum by (status_code) (rate(http_requests_total[5m]))',
  },
  {
    label: 'CPU usage per instance',
    query: '100 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]) * 100)',
  },
  {
    label: 'Error rate (5xx)',
    query:
      'sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))',
  },
  {
    label: 'p95 request latency',
    query: 'histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))',
  },
];

const QUERY_MODE_OPTIONS = [
  { id: 'builder', label: 'Builder' },
  { id: 'code', label: 'Code' },
];

// ============================================================================
// Component
// ============================================================================

export const PrometheusFormSection: React.FC<{
  form: PrometheusFormState;
  onUpdate: <K extends keyof PrometheusFormState>(key: K, value: PrometheusFormState[K]) => void;
  validationErrors: Record<string, string>;
  hasSubmitted: boolean;
  context?: { service?: string; team?: string };
  datasourceId?: string;
  datasources?: Array<{ id: string; name: string; type: string }>;
}> = ({
  form,
  onUpdate,
  validationErrors: _validationErrors,
  hasSubmitted: _hasSubmitted,
  context,
  datasourceId,
  datasources = [],
}) => {
  // Query mode: builder vs code
  const [queryMode, setQueryMode] = useState<'builder' | 'code'>('builder');

  // Builder mode state
  const [metricOptions, setMetricOptions] = useState<Array<{ label: string }>>([]);
  const [selectedMetric, setSelectedMetric] = useState<Array<{ label: string }>>([]);
  const [labelNameOptions, setLabelNameOptions] = useState<Array<{ label: string }>>([]);
  const [selectedLabelName, setSelectedLabelName] = useState<Array<{ label: string }>>([]);
  const [labelValueOptions, setLabelValueOptions] = useState<Array<{ label: string }>>([]);
  const [selectedLabelValue, setSelectedLabelValue] = useState<Array<{ label: string }>>([]);
  const [labelOperator, setLabelOperator] = useState('=');

  // Popover state
  const [showMetricBrowser, setShowMetricBrowser] = useState(false);
  const [showQueryLibrary, setShowQueryLibrary] = useState(false);

  // Rule group state — kept separate from form.name (which is the alert rule name).
  // Initialized from an existing _ruleGroup label so edits round-trip correctly.
  const [ruleGroupName, setRuleGroupName] = useState(
    () => form.labels.find((l) => l.key === '_ruleGroup')?.value || ''
  );

  // Use a ref for form.labels to avoid circular dependency:
  // handleRuleGroupChange → onUpdate('labels') → parent re-renders → new form.labels → new callback
  const formLabelsRef = useRef(form.labels);
  formLabelsRef.current = form.labels;

  const handleRuleGroupChange = useCallback(
    (value: string) => {
      setRuleGroupName(value);
      // Store as a metadata label so it's available during submission.
      // The parent form's submission handler reads _ruleGroup and strips it before persisting.
      const existingLabels = formLabelsRef.current.filter((l) => l.key !== '_ruleGroup');
      if (value) {
        onUpdate('labels', [...existingLabels, { key: '_ruleGroup', value, isDynamic: false }]);
      } else {
        onUpdate('labels', existingLabels);
      }
    },
    [onUpdate]
  );

  // Fetch metric names when datasource changes
  useEffect(() => {
    if (!datasourceId) return;
    const service = new AlertingPromResourcesService(datasourceId);
    service
      .listMetricNames()
      .then(({ metrics }) => {
        setMetricOptions(metrics.map((m) => ({ label: m })));
      })
      .catch(() => {
        /* non-critical */
      });
  }, [datasourceId]);

  // Fetch label names when metric changes
  useEffect(() => {
    if (!datasourceId || selectedMetric.length === 0) {
      setLabelNameOptions([]);
      return;
    }
    const service = new AlertingPromResourcesService(datasourceId);
    service
      .listLabelNames(selectedMetric[0].label)
      .then(({ labels }) => {
        setLabelNameOptions(labels.map((l) => ({ label: l })));
      })
      .catch(() => {
        /* non-critical */
      });
  }, [datasourceId, selectedMetric]);

  // Fetch label values when label name changes
  useEffect(() => {
    if (!datasourceId || selectedLabelName.length === 0) {
      setLabelValueOptions([]);
      return;
    }
    const metric = selectedMetric.length > 0 ? selectedMetric[0].label : undefined;
    const selector = metric ? `{__name__="${metric}"}` : undefined;
    const service = new AlertingPromResourcesService(datasourceId);
    service
      .listLabelValues(selectedLabelName[0].label, selector)
      .then(({ values }) => {
        setLabelValueOptions(values.map((v) => ({ label: v })));
      })
      .catch(() => {
        /* non-critical */
      });
  }, [datasourceId, selectedLabelName, selectedMetric]);

  // Sync builder selections to PromQL query
  const syncBuilderToQuery = useCallback(() => {
    if (selectedMetric.length === 0) return;
    const metric = selectedMetric[0].label;
    let query = metric;
    if (selectedLabelName.length > 0 && selectedLabelValue.length > 0) {
      // Escape backslashes and quotes so the value is a valid PromQL string literal
      const escapedValue = selectedLabelValue[0].label.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const labelFilter = `${selectedLabelName[0].label}${labelOperator}"${escapedValue}"`;
      query = `${metric}{${labelFilter}}`;
    }
    onUpdate('query', query);
  }, [selectedMetric, selectedLabelName, selectedLabelValue, labelOperator, onUpdate]);

  // Only sync when builder field selections change — NOT on mode toggle
  useEffect(() => {
    if (queryMode === 'builder' && selectedMetric.length > 0) {
      syncBuilderToQuery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMetric, selectedLabelName, selectedLabelValue, labelOperator]);

  const updateThreshold = <K extends keyof ThresholdCondition>(
    key: K,
    value: ThresholdCondition[K]
  ) => {
    onUpdate('threshold', { ...form.threshold, [key]: value });
  };

  // Memoize filtered datasources to avoid re-filtering on every render
  const promDatasources = useMemo(() => datasources.filter((ds) => ds.type === 'prometheus'), [
    datasources,
  ]);

  const handleMetricBrowserSelect = (metricName: string) => {
    setSelectedMetric([{ label: metricName }]);
    onUpdate('query', metricName);
    setShowMetricBrowser(false);
  };

  const selectedDsName = useMemo(() => {
    if (datasourceId) {
      const found = datasources.find((ds) => ds.id === datasourceId);
      return found?.name || datasourceId;
    }
    return 'Select datasource';
  }, [datasourceId, datasources]);

  const previewYaml = useMemo(() => {
    // Exclude _ruleGroup metadata label from visible YAML output
    const labels = form.labels.filter((l) => l.key && l.value && l.key !== '_ruleGroup');
    const annotations = form.annotations.filter((a) => a.key && a.value);
    const groupName = ruleGroupName || form.name || '<group-name>';
    let yaml = `# Rule Group Namespace\nname: ${groupName}\nrules:\n`;
    yaml += `  - alert: ${form.name || '<rule-name>'}\n`;
    yaml += `    expr: ${form.query || '<promql-expression>'} ${form.threshold.operator} ${
      form.threshold.value
    }\n`;
    yaml += `    for: ${form.threshold.forDuration}\n`;
    if (labels.length > 0) {
      yaml += `    labels:\n`;
      for (const l of labels) yaml += `      ${l.key}: ${l.isDynamic ? l.value : `"${l.value}"`}\n`;
    }
    if (annotations.length > 0) {
      yaml += `    annotations:\n`;
      for (const a of annotations) yaml += `      ${a.key}: "${a.value}"\n`;
    }
    return yaml;
  }, [form, ruleGroupName]);

  return (
    <>
      {/* ================================================================
          Query Section — Builder/Code toggle like Metrics page
          ================================================================ */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiBetaBadge label="PromQL" size="s" tooltipContent="Prometheus Query Language" />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiSelect
                  options={[
                    ...promDatasources.map((ds) => ({ value: ds.id, text: ds.name })),
                    ...(datasourceId && !promDatasources.find((ds) => ds.id === datasourceId)
                      ? [{ value: datasourceId, text: selectedDsName }]
                      : []),
                  ]}
                  value={datasourceId || ''}
                  onChange={(e) =>
                    onUpdate('datasourceId' as keyof PrometheusFormState, e.target.value as any)
                  }
                  compressed
                  prepend="Datasource"
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonGroup
              legend="Query mode"
              options={QUERY_MODE_OPTIONS}
              idSelected={queryMode}
              onChange={(id) => setQueryMode(id as 'builder' | 'code')}
              buttonSize="compressed"
            />
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="m" />

        {queryMode === 'builder' ? (
          /* Builder Mode — metric dropdown + label filters (single row) */
          <>
            <EuiFlexGroup gutterSize="m" alignItems="flexEnd" responsive={false}>
              <EuiFlexItem grow={3}>
                <EuiFormRow label="Metric" display="rowCompressed">
                  <EuiComboBox
                    placeholder="Select metric name"
                    options={metricOptions}
                    selectedOptions={selectedMetric}
                    onChange={(opts) => setSelectedMetric(opts)}
                    singleSelection={{ asPlainText: true }}
                    compressed
                    isClearable
                  />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem grow={3}>
                <EuiFormRow label="Label name" display="rowCompressed">
                  <EuiComboBox
                    placeholder="Label name"
                    options={labelNameOptions}
                    selectedOptions={selectedLabelName}
                    onChange={(opts) => setSelectedLabelName(opts)}
                    singleSelection={{ asPlainText: true }}
                    compressed
                    isClearable
                  />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem grow={false} style={{ width: 60 }}>
                <EuiFormRow label=" " display="rowCompressed">
                  <EuiSelect
                    options={[
                      { value: '=', text: '=' },
                      { value: '!=', text: '!=' },
                      { value: '=~', text: '=~' },
                      { value: '!~', text: '!~' },
                    ]}
                    value={labelOperator}
                    onChange={(e) => setLabelOperator(e.target.value)}
                    compressed
                  />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem grow={3}>
                <EuiFormRow label="Label value" display="rowCompressed">
                  <EuiComboBox
                    placeholder="Label value"
                    options={labelValueOptions}
                    selectedOptions={selectedLabelValue}
                    onChange={(opts) => setSelectedLabelValue(opts)}
                    singleSelection={{ asPlainText: true }}
                    compressed
                    isClearable
                  />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonIcon
                  iconType="cross"
                  aria-label="Clear filter"
                  color="subdued"
                  onClick={() => {
                    setSelectedLabelName([]);
                    setSelectedLabelValue([]);
                  }}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />
            <EuiText size="xs" color="subdued">
              {i18n.translate('observability.alerting.prometheusFormSection.builderHelpText', {
                defaultMessage: 'Select a metric to start.',
              })}
            </EuiText>
          </>
        ) : (
          /* Code Mode — PromQL Monaco editor */
          <>
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
              <EuiFlexItem grow={false}>
                <EuiPopover
                  button={
                    <EuiButtonEmpty
                      size="xs"
                      iconType="starEmpty"
                      iconSide="left"
                      onClick={() => setShowQueryLibrary(!showQueryLibrary)}
                    >
                      Query library <EuiIcon type="arrowDown" size="s" />
                    </EuiButtonEmpty>
                  }
                  isOpen={showQueryLibrary}
                  closePopover={() => setShowQueryLibrary(false)}
                  panelPaddingSize="s"
                >
                  {SAMPLE_QUERIES.map((sq, idx) => (
                    <EuiButtonEmpty
                      key={idx}
                      size="xs"
                      onClick={() => {
                        onUpdate('query', sq.query);
                        setShowQueryLibrary(false);
                      }}
                      style={{ display: 'block', width: '100%', textAlign: 'left' }}
                    >
                      {sq.label}
                    </EuiButtonEmpty>
                  ))}
                </EuiPopover>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiPopover
                  button={
                    <EuiButtonEmpty
                      size="xs"
                      onClick={() => setShowMetricBrowser(!showMetricBrowser)}
                    >
                      Metric browser <EuiIcon type="arrowDown" size="s" />
                    </EuiButtonEmpty>
                  }
                  isOpen={showMetricBrowser}
                  closePopover={() => setShowMetricBrowser(false)}
                  panelPaddingSize="s"
                >
                  <div style={{ width: 560, maxHeight: 400, overflow: 'auto' }}>
                    <MetricBrowser
                      onSelectMetric={handleMetricBrowserSelect}
                      currentQuery={form.query}
                      datasourceId={datasourceId}
                    />
                  </div>
                </EuiPopover>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />
            <div style={{ position: 'relative' }}>
              <PromQLMonacoEditor
                value={form.query}
                onChange={(v) => onUpdate('query', v)}
                height={80}
                datasourceId={datasourceId}
              />
              <div style={{ position: 'absolute', top: 4, right: 4, zIndex: 2 }}>
                <EuiToolTip content="Copy query">
                  <EuiButtonIcon
                    iconType="copy"
                    size="s"
                    color="subdued"
                    onClick={() => {
                      try {
                        navigator.clipboard.writeText(form.query);
                      } catch (_e) {
                        /* clipboard unavailable */
                      }
                    }}
                    aria-label="Copy query"
                  />
                </EuiToolTip>
              </div>
            </div>
          </>
        )}
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* ================================================================
          Trigger Condition — Operator, Value, For Duration (no Unit)
          ================================================================ */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiTitle size="xs">
          <h3>
            {i18n.translate('observability.alerting.prometheusFormSection.triggerConditionTitle', {
              defaultMessage: 'Trigger condition',
            })}
          </h3>
        </EuiTitle>
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
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem style={{ minWidth: 100 }}>
            <EuiFormRow label="Value" display="rowCompressed">
              <EuiFieldNumber
                value={form.threshold.value}
                onChange={(e) => updateThreshold('value', parseFloat(e.target.value) || 0)}
                compressed
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem style={{ minWidth: 160 }}>
            <EuiFormRow label="For duration" display="rowCompressed">
              <EuiSelect
                options={DURATION_OPTIONS}
                value={form.threshold.forDuration}
                onChange={(e) => updateThreshold('forDuration', e.target.value)}
                compressed
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
                  </code>
                ),
                forDuration: form.threshold.forDuration,
              }}
            />
          </EuiText>
        </EuiCallOut>
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* ================================================================
          Rule Group — where this rule lives in AMP
          ================================================================ */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiTitle size="xs">
          <h3>
            {i18n.translate('observability.alerting.prometheusFormSection.ruleGroupTitle', {
              defaultMessage: 'Rule group',
            })}
          </h3>
        </EuiTitle>
        <EuiText size="xs" color="subdued">
          {i18n.translate('observability.alerting.prometheusFormSection.ruleGroupDescription', {
            defaultMessage:
              'Alert rules are organized into groups. Rules in the same group share an evaluation interval and are evaluated together.',
          })}
        </EuiText>
        <EuiSpacer size="s" />
        <EuiFormRow
          label="Group name"
          helpText="Select an existing group or type a new name to create one."
          display="rowCompressed"
        >
          <EuiComboBox
            placeholder="Type or select a rule group"
            options={[]}
            selectedOptions={ruleGroupName ? [{ label: ruleGroupName }] : []}
            onChange={(opts) => handleRuleGroupChange(opts.length > 0 ? opts[0].label : '')}
            onCreateOption={(value) => handleRuleGroupChange(value)}
            singleSelection={{ asPlainText: true }}
            compressed
            isClearable
            customOptionText="Create group: {searchValue}"
          />
        </EuiFormRow>
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* ================================================================
          Labels
          ================================================================ */}
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

      {/* ================================================================
          Notification Routing — how alerts get routed in Prometheus
          ================================================================ */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiTitle size="xs">
          <h3>
            {i18n.translate(
              'observability.alerting.prometheusFormSection.notificationRoutingTitle',
              {
                defaultMessage: 'Notification routing',
              }
            )}
          </h3>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiCallOut size="s" iconType="bell" color="primary">
          <EuiText size="xs">
            <p>
              Notifications for Prometheus alerts are managed through <strong>Alertmanager</strong>.
              The labels you define above (e.g. <code>severity</code>) determine which receiver
              handles this alert based on your Alertmanager routing configuration.
            </p>
          </EuiText>
        </EuiCallOut>
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* ================================================================
          Annotations
          ================================================================ */}
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

      {/* ================================================================
          Rule Preview (YAML)
          ================================================================ */}
      <EuiAccordion
        id="preview"
        buttonContent={<strong>Rule Preview (YAML)</strong>}
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

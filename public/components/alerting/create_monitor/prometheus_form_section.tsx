/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Prometheus form section of the Create Monitor flyout — simplified for
 * managed Prometheus (AMP) customers.
 *
 * The query builder alone defines the alert expression:
 *   - Builder: metric dropdown + label name/value filters
 *   - Rule group configuration
 *   - Labels & annotations
 *   - YAML preview
 *
 * Removed (not applicable to managed Prometheus):
 *   - "Unit" field in threshold
 *   - "Evaluation Settings" section (managed at rule group level in AMP)
 *   - Trigger condition (the PromQL expression itself defines the condition)
 *   - Code mode / freeform PromQL editor
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiBetaBadge,
  EuiButtonIcon,
  EuiCallOut,
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { FormattedMessage } from '@osd/i18n/react';
import { i18n } from '@osd/i18n';
import { AnnotationEditor, LabelEditor } from '../monitor_form_components';
import { AlertingPromResourcesService } from '../query_services/alerting_prom_resources_service';
import { DURATION_OPTIONS, PrometheusFormState } from './create_monitor_types';

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
  // Builder state
  const [metricOptions, setMetricOptions] = useState<Array<{ label: string }>>([]);
  const [selectedMetric, setSelectedMetric] = useState<Array<{ label: string }>>([]);
  const [labelNameOptions, setLabelNameOptions] = useState<Array<{ label: string }>>([]);
  const [selectedLabelName, setSelectedLabelName] = useState<Array<{ label: string }>>([]);
  const [labelValueOptions, setLabelValueOptions] = useState<Array<{ label: string }>>([]);
  const [selectedLabelValue, setSelectedLabelValue] = useState<Array<{ label: string }>>([]);
  const [labelOperator, setLabelOperator] = useState('=');

  // Rule group state — kept separate from form.name (which is the alert rule name).
  // Initialized from an existing _ruleGroup label so edits round-trip correctly.
  const [ruleGroupName, setRuleGroupName] = useState(
    () => form.labels.find((l) => l.key === '_ruleGroup')?.value || ''
  );
  const [ruleGroupOptions, setRuleGroupOptions] = useState<Array<{ label: string }>>([]);

  // Use a ref for form.labels to avoid circular dependency:
  // handleRuleGroupChange → onUpdate('labels') → parent re-renders → new form.labels → new callback
  const formLabelsRef = useRef(form.labels);
  formLabelsRef.current = form.labels;

  const handleRuleGroupChange = useCallback(
    (value: string) => {
      setRuleGroupName(value);
      // Stored as a metadata label so it's available during submission.
      // The parent form's submission handler extracts _ruleGroup into the
      // payload's groupName and strips it from the persisted labels.
      const existingLabels = formLabelsRef.current.filter((l) => l.key !== '_ruleGroup');
      if (value) {
        onUpdate('labels', [...existingLabels, { key: '_ruleGroup', value, isDynamic: false }]);
      } else {
        onUpdate('labels', existingLabels);
      }
    },
    [onUpdate]
  );

  // Fetch metric names and existing rule groups when datasource changes
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
    service
      .listRuleGroupNames()
      .then(({ groups }) => {
        setRuleGroupOptions(groups.map((g) => ({ label: g })));
      })
      .catch(() => {
        /* non-critical — user can still type a new group name */
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

  // Sync builder selections to the PromQL query
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

  // Sync when builder field selections change
  useEffect(() => {
    if (selectedMetric.length > 0) {
      syncBuilderToQuery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMetric, selectedLabelName, selectedLabelValue, labelOperator]);

  // Memoize filtered datasources to avoid re-filtering on every render
  const promDatasources = useMemo(() => {
    return datasources.filter((ds) => ds.type === 'prometheus');
  }, [datasources]);

  const selectedDsName = useMemo(() => {
    if (datasourceId) {
      const found = datasources.find((ds) => ds.id === datasourceId);
      return found?.name || datasourceId;
    }
    return i18n.translate('observability.alerting.prometheusFormSection.selectDatasource', {
      defaultMessage: 'Select datasource',
    });
  }, [datasourceId, datasources]);

  const previewYaml = useMemo(() => {
    // Exclude _ruleGroup metadata label from visible YAML output
    const labels = form.labels.filter((l) => l.key && l.value && l.key !== '_ruleGroup');
    const annotations = form.annotations.filter((a) => a.key && a.value);
    const groupName = ruleGroupName || form.name || '<group-name>';
    let yaml = `# Rule Group Namespace\nname: ${groupName}\nrules:\n`;
    yaml += `  - alert: ${form.name || '<rule-name>'}\n`;
    yaml += `    expr: ${form.query || '<promql-expression>'}\n`;
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
          Query Section — Builder (metric + label filters)
          ================================================================ */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiFlexGroup alignItems="center" responsive={false} gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiBetaBadge
              label="PromQL"
              size="s"
              tooltipContent={i18n.translate(
                'observability.alerting.prometheusFormSection.promqlTooltip',
                { defaultMessage: 'Prometheus Query Language' }
              )}
            />
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
              onChange={(e) => onUpdate('datasourceId', e.target.value)}
              compressed
              prepend={i18n.translate(
                'observability.alerting.prometheusFormSection.datasourcePrepend',
                { defaultMessage: 'Datasource' }
              )}
            />
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="m" />

        <EuiFlexGroup gutterSize="m" alignItems="flexEnd" responsive={false}>
          <EuiFlexItem grow={3}>
            <EuiFormRow
              label={i18n.translate('observability.alerting.prometheusFormSection.metricLabel', {
                defaultMessage: 'Metric',
              })}
              display="rowCompressed"
            >
              <EuiComboBox
                placeholder={i18n.translate(
                  'observability.alerting.prometheusFormSection.metricPlaceholder',
                  { defaultMessage: 'Select metric name' }
                )}
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
            <EuiFormRow
              label={i18n.translate('observability.alerting.prometheusFormSection.labelNameLabel', {
                defaultMessage: 'Label name',
              })}
              display="rowCompressed"
            >
              <EuiComboBox
                placeholder={i18n.translate(
                  'observability.alerting.prometheusFormSection.labelNamePlaceholder',
                  { defaultMessage: 'Label name' }
                )}
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
            <EuiFormRow
              label={i18n.translate(
                'observability.alerting.prometheusFormSection.labelValueLabel',
                { defaultMessage: 'Label value' }
              )}
              display="rowCompressed"
            >
              <EuiComboBox
                placeholder={i18n.translate(
                  'observability.alerting.prometheusFormSection.labelValuePlaceholder',
                  { defaultMessage: 'Label value' }
                )}
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
              aria-label={i18n.translate(
                'observability.alerting.prometheusFormSection.clearFilterAriaLabel',
                { defaultMessage: 'Clear filter' }
              )}
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

        <EuiSpacer size="m" />

        {/* For duration — the rule's `for:` clause. Kept per-rule (unlike the
            group-level evaluation interval): the condition must hold
            continuously for this long before the alert transitions from
            pending to firing. */}
        <EuiFormRow
          label={i18n.translate('observability.alerting.prometheusFormSection.forDurationLabel', {
            defaultMessage: 'For duration',
          })}
          helpText={i18n.translate(
            'observability.alerting.prometheusFormSection.forDurationHelpText',
            {
              defaultMessage:
                'How long the condition must stay true before the alert fires. The alert is "pending" during this window. Choose "Immediately (0s)" to fire on the first evaluation.',
            }
          )}
          display="rowCompressed"
        >
          <EuiSelect
            options={DURATION_OPTIONS}
            value={form.threshold.forDuration}
            onChange={(e) =>
              onUpdate('threshold', { ...form.threshold, forDuration: e.target.value })
            }
            compressed
            data-test-subj="prometheusForDurationSelect"
          />
        </EuiFormRow>
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
          label={i18n.translate('observability.alerting.prometheusFormSection.groupNameLabel', {
            defaultMessage: 'Group name',
          })}
          helpText={i18n.translate(
            'observability.alerting.prometheusFormSection.groupNameHelpText',
            { defaultMessage: 'Select an existing group or type a new name to create one.' }
          )}
          display="rowCompressed"
        >
          <EuiComboBox
            placeholder={i18n.translate(
              'observability.alerting.prometheusFormSection.groupNamePlaceholder',
              { defaultMessage: 'Type or select a rule group' }
            )}
            options={ruleGroupOptions}
            selectedOptions={ruleGroupName ? [{ label: ruleGroupName }] : []}
            onChange={(opts) => handleRuleGroupChange(opts.length > 0 ? opts[0].label : '')}
            onCreateOption={(value) => handleRuleGroupChange(value)}
            singleSelection={{ asPlainText: true }}
            compressed
            isClearable
            customOptionText={i18n.translate(
              'observability.alerting.prometheusFormSection.createGroupOptionText',
              {
                defaultMessage: 'Create group: {searchValue}',
                values: { searchValue: '{searchValue}' },
              }
            )}
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
              <FormattedMessage
                id="observability.alerting.prometheusFormSection.notificationRoutingBody"
                defaultMessage="Notifications for Prometheus alerts are managed through {alertmanager}. The labels you define above (e.g. {severityCode}) determine which receiver handles this alert based on your Alertmanager routing configuration."
                values={{
                  alertmanager: <strong>Alertmanager</strong>,
                  severityCode: <code>severity</code>,
                }}
              />
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

      {/* ================================================================
          Rule Preview (YAML)
          ================================================================ */}
      <EuiAccordion
        id="preview"
        buttonContent={
          <strong>
            {i18n.translate('observability.alerting.prometheusFormSection.rulePreviewTitle', {
              defaultMessage: 'Rule Preview (YAML)',
            })}
          </strong>
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

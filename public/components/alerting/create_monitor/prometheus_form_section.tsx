/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Prometheus form section of the Create Monitor flyout — simplified for
 * managed Prometheus (AMP) customers.
 *
 * Section layout mirrors the Metrics page "Create alert rule" flyout:
 *   - Rule details (namespace, rule group, description)
 *   - Query — a Builder ⇄ Code toggle: the point-and-click builder OR a raw
 *     PromQL expression (the complete alert condition), plus per-rule `for:`
 *     duration. An existing rule the builder can't represent opens in Code so
 *     it is never silently clobbered.
 *   - Labels
 *   - Annotations
 *   - Rule Preview (YAML)
 *
 * Removed (not applicable to managed Prometheus):
 *   - "Unit" field / Trigger condition (the query defines the condition)
 *   - "Evaluation Settings" (managed at rule group level in AMP)
 *   - Matched notification actions (routing is Alertmanager's job)
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiBetaBadge,
  EuiButton,
  EuiButtonGroup,
  EuiCallOut,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormLabel,
  EuiFormRow,
  EuiLink,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTextArea,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { coreRefs } from '../../../framework/core_refs';
import { AnnotationEditor, LabelEditor } from '../monitor_form_components';
import { RuleGroupSelector } from './rule_group_selector';
import { QueryPreviewResults } from '../query_preview_results';
import { PromQueryBuilder } from './prom_query_builder';
import { isAlwaysFiring, parseExpr } from './prom_condition';
import { DURATION_OPTIONS, PrometheusFormState } from './create_monitor_types';

/** Which query editor the Query section shows. */
type QueryMode = 'code' | 'builder';

/** The namespace all rules created from this form are stored under. */
const USER_RULES_NAMESPACE = 'observability-alerting';

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
  /**
   * The shell-owned Rule name row (validation/dup-check wired there),
   * rendered inside the Rule details accordion to mirror the Metrics
   * page flyout layout.
   */
  ruleNameField?: React.ReactNode;
}> = ({
  form,
  onUpdate,
  validationErrors: _validationErrors,
  hasSubmitted: _hasSubmitted,
  context,
  datasourceId,
  datasources = [],
  ruleNameField,
}) => {
  // Rule group state — kept separate from form.name (which is the alert rule name).
  // Initialized from an existing _ruleGroup label so edits round-trip correctly.
  const [ruleGroupName, setRuleGroupName] = useState(
    () => form.labels.find((l) => l.key === '_ruleGroup')?.value || ''
  );
  const [showPreview, setShowPreview] = useState(false);
  // Bumped on each "Run preview" click so QueryPreviewResults re-runs the query.
  const [previewToken, setPreviewToken] = useState(0);

  // Default to Builder (point-and-click), matching the Metrics-page create
  // flyout. Exception: an existing rule whose expression the builder can't
  // represent (any non-trivial PromQL: `or`/`and`, arithmetic, multi-comparison)
  // opens in Code so the expression is shown as-is and never silently clobbered
  // when the flyout mounts. Users can toggle either way.
  const [queryMode, setQueryMode] = useState<QueryMode>(() => {
    const seeded = (form.query ?? '').trim();
    return seeded && parseExpr(seeded) === null ? 'code' : 'builder';
  });
  // A non-empty expression the builder cannot represent. Selecting a metric in
  // the builder would overwrite it, so warn (and offer Code) rather than
  // silently replacing what the user has.
  const builderWouldOverwrite =
    (form.query ?? '').trim() !== '' && parseExpr(form.query ?? '') === null;

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

  // The _ruleGroup transport label is owned by the Rule Group selector — hide
  // it from the Label editor and re-append it on every label edit so user
  // changes there can't desync or delete it.
  const visibleLabels = useMemo(() => {
    return form.labels.filter((l) => l.key !== '_ruleGroup');
  }, [form.labels]);
  const handleLabelsChange = useCallback(
    (labels: PrometheusFormState['labels']) => {
      const ruleGroup = formLabelsRef.current.find((l) => l.key === '_ruleGroup');
      onUpdate('labels', ruleGroup ? [...labels, ruleGroup] : labels);
    },
    [onUpdate]
  );

  // Description is stored as the `description` annotation — the server's rule
  // builder reads annotations.description, so no new form field is needed.
  const formAnnotationsRef = useRef(form.annotations);
  formAnnotationsRef.current = form.annotations;
  const description = form.annotations.find((a) => a.key === 'description')?.value || '';
  const handleDescriptionChange = useCallback(
    (value: string) => {
      const others = formAnnotationsRef.current.filter((a) => a.key !== 'description');
      onUpdate('annotations', value ? [...others, { key: 'description', value }] : others);
    },
    [onUpdate]
  );

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
    let yaml = `# Namespace: ${USER_RULES_NAMESPACE}\nname: ${groupName}\nrules:\n`;
    yaml += `  - alert: ${form.name || '<rule-name>'}\n`;
    yaml += `    expr: ${form.query || '<promql-expression>'}\n`;
    yaml += `    for: ${form.threshold.forDuration}\n`;
    if (labels.length > 0) {
      yaml += `    labels:\n`;
      // Template values are single-quoted, matching the server's js-yaml
      // serialization (unquoted `{{ ... }}` would be invalid YAML)
      for (const l of labels)
        yaml += `      ${l.key}: ${l.isDynamic ? `'${l.value}'` : `"${l.value}"`}\n`;
    }
    if (annotations.length > 0) {
      yaml += `    annotations:\n`;
      // Annotations lack the isDynamic flag — detect template syntax to
      // single-quote like the server's js-yaml serialization does
      for (const a of annotations) {
        const value = /\{\{.*\}\}/.test(a.value) ? `'${a.value}'` : `"${a.value}"`;
        yaml += `      ${a.key}: ${value}\n`;
      }
    }
    return yaml;
  }, [form, ruleGroupName]);

  return (
    <>
      {/* ================================================================
          Rule details — namespace / rule group / description. Mirrors the
          Metrics page flyout's Rule details section; Rule name and Enabled
          are owned by the flyout shell directly above.
          ================================================================ */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiAccordion
          id="prom-rule-details"
          buttonContent={
            <strong>
              {i18n.translate('observability.alerting.prometheusFormSection.ruleDetailsTitle', {
                defaultMessage: 'Rule details',
              })}
            </strong>
          }
          initialIsOpen={true}
          paddingSize="none"
        >
          <EuiSpacer size="s" />
          <EuiFormRow
            label={i18n.translate('observability.alerting.prometheusFormSection.namespaceLabel', {
              defaultMessage: 'Namespace',
            })}
            helpText={i18n.translate(
              'observability.alerting.prometheusFormSection.namespaceHelpText',
              {
                defaultMessage:
                  'Logical grouping for rule groups. All rules created here are stored under the "{namespace}" namespace.',
                values: { namespace: USER_RULES_NAMESPACE },
              }
            )}
            fullWidth
          >
            <EuiFieldText value={USER_RULES_NAMESPACE} readOnly fullWidth compressed />
          </EuiFormRow>
          <EuiSpacer size="s" />
          <EuiFormRow
            label={i18n.translate('observability.alerting.prometheusFormSection.groupNameLabel', {
              defaultMessage: 'Rule group',
            })}
            helpText={i18n.translate(
              'observability.alerting.prometheusFormSection.groupNameHelpText',
              {
                defaultMessage:
                  'Rules within a group share an evaluation interval and are evaluated together.',
              }
            )}
            fullWidth
          >
            <RuleGroupSelector
              datasourceId={datasourceId}
              value={ruleGroupName}
              onChange={handleRuleGroupChange}
              data-test-subj="prometheusRuleGroupSelector"
            />
          </EuiFormRow>
          {ruleNameField && (
            <>
              <EuiSpacer size="s" />
              {ruleNameField}
            </>
          )}
          <EuiSpacer size="s" />
          <EuiText size="xs" color="subdued">
            {i18n.translate('observability.alerting.prometheusFormSection.hierarchyExplanation', {
              defaultMessage:
                'Prometheus rules are organized as: Namespace → Rule Group → Rule. A namespace contains one or more rule groups, and each group contains one or more rules that share the same evaluation interval.',
            })}
          </EuiText>
          <EuiSpacer size="s" />
          <EuiFormRow
            label={
              <span>
                {i18n.translate('observability.alerting.prometheusFormSection.descriptionLabel', {
                  defaultMessage: 'Description',
                })}{' '}
                <EuiText size="xs" color="subdued" style={{ display: 'inline' }}>
                  {i18n.translate(
                    'observability.alerting.prometheusFormSection.descriptionOptional',
                    { defaultMessage: '— optional' }
                  )}
                </EuiText>
              </span>
            }
            fullWidth
          >
            <EuiTextArea
              placeholder={i18n.translate(
                'observability.alerting.prometheusFormSection.descriptionPlaceholder',
                { defaultMessage: 'Describe this rule' }
              )}
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              rows={2}
              fullWidth
              compressed
              data-test-subj="prometheusRuleDescription"
            />
          </EuiFormRow>
        </EuiAccordion>
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* ================================================================
          Query — point-and-click builder; the expression is the complete
          alert condition. Per-rule `for:` duration lives here too.
          ================================================================ */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiAccordion
          id="prom-query"
          buttonContent={
            <strong>
              {i18n.translate('observability.alerting.prometheusFormSection.queryTitle', {
                defaultMessage: 'Query',
              })}
            </strong>
          }
          initialIsOpen={true}
          paddingSize="none"
          extraAction={
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                {/* Mirrors the logs flyout's "Build query in logs →" round-trip:
                    author/validate the query against live data in the Metrics
                    app, then return via its Create alert rule action. Same-tab
                    navigation — unsaved form state here is lost. */}
                <EuiToolTip
                  position="left"
                  content={i18n.translate(
                    'observability.alerting.prometheusFormSection.openInMetricsTooltip',
                    {
                      defaultMessage:
                        'Build and validate your query against live data in metrics, then click Create alert rule to come back here pre-filled. Unsaved changes will be lost.',
                    }
                  )}
                >
                  <EuiLink
                    onClick={() => coreRefs?.application?.navigateToApp('explore/metrics')}
                    data-test-subj="alertManagerOpenInMetricsLink"
                  >
                    {i18n.translate('observability.alerting.prometheusFormSection.openInMetrics', {
                      defaultMessage: 'Build query in metrics →',
                    })}
                  </EuiLink>
                </EuiToolTip>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  size="s"
                  onClick={() => {
                    setShowPreview(true);
                    setPreviewToken((t) => t + 1);
                  }}
                  // Needs an expression and a datasource; disabling avoids an
                  // empty run surfacing a misleading "returned no data" message.
                  isDisabled={form.query.trim() === '' || !datasourceId}
                  data-test-subj="prometheusRunPreviewButton"
                  aria-label={i18n.translate(
                    'observability.alerting.prometheusFormSection.runPreviewAriaLabel',
                    { defaultMessage: 'Run preview' }
                  )}
                >
                  {i18n.translate('observability.alerting.prometheusFormSection.runPreviewButton', {
                    defaultMessage: 'Run preview',
                  })}
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          }
        >
          <EuiSpacer size="s" />
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
            <EuiFlexItem grow={false} style={{ marginLeft: 'auto' }}>
              <EuiFormLabel>
                {i18n.translate(
                  'observability.alerting.prometheusFormSection.queryModeEditorLabel',
                  {
                    defaultMessage: 'Editor',
                  }
                )}
              </EuiFormLabel>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              {/* Builder ⇄ Code toggle. Only one editor shows at a time, so an
                expression the builder can't represent (Code) is never silently
                overwritten by the builder's output. */}
              <EuiButtonGroup
                legend={i18n.translate(
                  'observability.alerting.prometheusFormSection.queryModeLegend',
                  { defaultMessage: 'Query editor mode' }
                )}
                buttonSize="compressed"
                options={[
                  {
                    id: 'builder',
                    label: i18n.translate(
                      'observability.alerting.prometheusFormSection.queryModeBuilder',
                      { defaultMessage: 'Builder' }
                    ),
                  },
                  {
                    id: 'code',
                    label: i18n.translate(
                      'observability.alerting.prometheusFormSection.queryModeCode',
                      { defaultMessage: 'Code' }
                    ),
                  },
                ]}
                idSelected={queryMode}
                onChange={(id) => setQueryMode(id as QueryMode)}
                data-test-subj="prometheusQueryModeToggle"
              />
            </EuiFlexItem>
          </EuiFlexGroup>

          <EuiSpacer size="m" />

          {queryMode === 'code' ? (
            /* Code mode: raw PromQL expression — the complete alert condition.
              A rule the builder can't represent lands here as-is, editable
              directly, instead of opening a blank builder. */
            <>
              <EuiFormRow
                label={i18n.translate(
                  'observability.alerting.prometheusFormSection.expressionLabel',
                  { defaultMessage: 'PromQL expression' }
                )}
                helpText={i18n.translate(
                  'observability.alerting.prometheusFormSection.expressionHelpText',
                  {
                    defaultMessage:
                      'The complete PromQL alert condition — it fires for every series the expression returns.',
                  }
                )}
                fullWidth
              >
                <EuiTextArea
                  value={form.query}
                  onChange={(e) => onUpdate('query', e.target.value)}
                  placeholder={i18n.translate(
                    'observability.alerting.prometheusFormSection.expressionPlaceholder',
                    { defaultMessage: 'e.g. rate(http_requests_total[5m]) > 0.5' }
                  )}
                  rows={2}
                  fullWidth
                  compressed
                  style={{ fontFamily: 'var(--euiCodeFontFamily)' }}
                  aria-label={i18n.translate(
                    'observability.alerting.prometheusFormSection.expressionAriaLabel',
                    { defaultMessage: 'PromQL expression' }
                  )}
                  data-test-subj="prometheusPromQlExpression"
                />
              </EuiFormRow>
              {isAlwaysFiring(form.query) && (
                <>
                  <EuiSpacer size="s" />
                  <EuiCallOut
                    size="s"
                    color="warning"
                    iconType="alert"
                    title={i18n.translate(
                      'observability.alerting.prometheusFormSection.alwaysFiringWarning',
                      {
                        defaultMessage:
                          'This expression has no condition, so the alert fires whenever the series exists. Add a comparison (e.g. “> 0.5”) — or a Condition in the builder — for a conditional alert.',
                      }
                    )}
                    data-test-subj="prometheusAlwaysFiringWarning"
                  />
                </>
              )}
            </>
          ) : (
            /* Builder mode: point-and-click metric/label picker. */
            <>
              {builderWouldOverwrite && (
                <>
                  <EuiCallOut
                    size="s"
                    color="warning"
                    iconType="alert"
                    title={i18n.translate(
                      'observability.alerting.prometheusFormSection.builderOverwriteWarning',
                      {
                        defaultMessage:
                          'Your current PromQL expression can’t be represented by the builder. Selecting a metric here will replace it — switch to Code to keep editing it directly.',
                      }
                    )}
                    data-test-subj="prometheusBuilderOverwriteWarning"
                  />
                  <EuiSpacer size="s" />
                </>
              )}
              <PromQueryBuilder
                datasourceId={datasourceId}
                query={form.query}
                onQueryChange={(q) => onUpdate('query', q)}
              />
            </>
          )}

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

          {showPreview && (
            <>
              <EuiSpacer size="m" />
              <QueryPreviewResults
                query={form.query}
                datasourceId={datasourceId}
                runToken={previewToken}
              />
            </>
          )}
        </EuiAccordion>
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* ================================================================
          Labels
          ================================================================ */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiAccordion
          id="prom-labels"
          buttonContent={
            <strong>
              {i18n.translate('observability.alerting.prometheusFormSection.labelsTitle', {
                defaultMessage: 'Labels',
              })}
            </strong>
          }
          initialIsOpen={true}
          paddingSize="none"
          extraAction={
            <EuiText size="xs" color="subdued">
              {i18n.translate('observability.alerting.prometheusFormSection.labelsDescription', {
                defaultMessage: 'Categorize and route alerts',
              })}
            </EuiText>
          }
        >
          <EuiSpacer size="s" />
          <LabelEditor labels={visibleLabels} onChange={handleLabelsChange} context={context} />
        </EuiAccordion>
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* Notification routing guidance intentionally absent — matches the
          Metrics page flyout; the "Categorize and route alerts" hint on the
          Labels section covers the Alertmanager relationship. */}

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
          initialIsOpen={false}
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

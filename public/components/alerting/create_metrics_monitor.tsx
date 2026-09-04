/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Create Metrics Monitor — the single shared flyout for creating Prometheus
 * alerting rules, mounted by both the Metrics Explore page ("Create alert
 * rule" action) and the Alert Manager Rules page.
 *
 * Sections: Rule details (namespace / rule group / name / description),
 * Query (shared PromQL builder + per-rule `for:` duration + Run preview),
 * Labels, Annotations, Rule Preview (YAML), and a sticky footer. The PromQL
 * expression is the complete alert condition — there is no separate trigger
 * condition, and evaluation cadence is a rule-group-level concern in
 * managed Prometheus.
 */
import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  EuiSpacer,
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiFieldText,
  EuiTextArea,
  EuiSelect,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiButtonIcon,
  EuiCallOut,
  EuiText,
  EuiBadge,
  EuiAccordion,
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiTitle,
  EuiHorizontalRule,
  EuiLink,
  EuiToolTip,
  EuiPopover,
  EuiIcon,
  EuiBetaBadge,
  EuiConfirmModal,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { coreRefs } from '../../framework/core_refs';
import { classifiedToastColor, classifiedToastText, extractClassifiedError } from '../common/error';
import { PromQueryBuilder, parseBuilderQuery } from './create_monitor/prom_query_builder';
import { RuleGroupSelector } from './create_monitor/rule_group_selector';
import { QueryPreviewResults } from './query_preview_results';
// Shared label editor + entry types keep both flyouts' Labels sections in sync
import { LabelEditor } from './monitor_form_components';
import type { LabelEntry, AnnotationEntry } from '../../../common/services/alerting/validators';

// ============================================================================
// Types
// ============================================================================

export interface MetricsMonitorFormState {
  monitorName: string;
  description: string;
  namespace: string;
  groupName: string;
  query: string;
  datasourceId: string;
  /** The rule's `for:` clause — pending window before the alert fires. */
  forDuration: string;
  /** Group-level evaluation cadence sent with the payload (not per-rule UI). */
  evalInterval: string;
  // Labels & annotations
  labels: LabelEntry[];
  annotations: AnnotationEntry[];
}

/** Which query editor the Query section shows. */
export type QueryMode = 'code' | 'builder';

export interface CreateMetricsMonitorProps {
  onCancel: () => void;
  onSave: (form: MetricsMonitorFormState) => void;
  /** Datasource ID from the current Explore page context */
  datasourceId?: string;
  /** Datasource display name from the current Explore page context */
  datasourceName?: string;
  /**
   * PromQL the user had in the Explore Metrics editor, used to pre-fill the
   * flyout's query. The builder seeds its fields from this when the expression
   * is builder-representable; complex expressions stay in the visible
   * expression field (and drive the preview) without the builder clobbering
   * them.
   */
  initialQuery?: string;
  /**
   * Time window (epoch seconds) the preview should run over — typically the
   * Explore time picker the user came from, so the flyout's Run preview
   * reflects the same range they were just looking at. When omitted the
   * preview defaults to the last hour.
   */
  initialTimeRange?: { start: number; end: number };
  /**
   * Selectable Prometheus datasources. Provided by the Alert Manager Rules
   * page (no page context there); when absent, the flyout is pinned to the
   * context datasource (Metrics Explore page behavior).
   */
  datasources?: Array<{ id: string; name: string; type: string }>;
  /**
   * Duplicate-name guard, checked against the selected datasource. Provided
   * by the Alert Manager Rules page which knows the existing rules.
   */
  isNameTaken?: (name: string, dsId: string, group?: string) => boolean;
  /**
   * Show the "Build query in metrics →" round-trip link in the Query
   * section header. Set by the Alert Manager Rules page; must stay off on
   * the Metrics Explore page, where the link would be a circular hop back
   * to the page the user came from (same rationale as the logs flyout's
   * hideBuildInLogsLink, inverted).
   */
  showBuildInMetricsLink?: boolean;
  /** HTTP client for persisting rules */
  http?: {
    post: (path: string, options: { body: string }) => Promise<unknown>;
  };
  /**
   * Toast notification callback. `text` carries the classified error body
   * (message + remediation + safe details); mount adapters must forward it and
   * honor 'warning' so the detailed cause reaches the toast.
   */
  addToast?: (title: string, color?: 'success' | 'warning' | 'danger', text?: string) => void;
}

// ============================================================================
// Constants
// ============================================================================

const FOR_DURATION_OPTIONS = [
  {
    value: '1m',
    text: i18n.translate('observability.alerting.createMetricsMonitor.forDuration1m', {
      defaultMessage: '1 minute',
    }),
  },
  {
    value: '5m',
    text: i18n.translate('observability.alerting.createMetricsMonitor.forDuration5m', {
      defaultMessage: '5 minutes',
    }),
  },
  {
    value: '10m',
    text: i18n.translate('observability.alerting.createMetricsMonitor.forDuration10m', {
      defaultMessage: '10 minutes',
    }),
  },
  {
    value: '15m',
    text: i18n.translate('observability.alerting.createMetricsMonitor.forDuration15m', {
      defaultMessage: '15 minutes',
    }),
  },
  {
    value: '30m',
    text: i18n.translate('observability.alerting.createMetricsMonitor.forDuration30m', {
      defaultMessage: '30 minutes',
    }),
  },
  {
    value: '1h',
    text: i18n.translate('observability.alerting.createMetricsMonitor.forDuration1h', {
      defaultMessage: '1 hour',
    }),
  },
];

/** The namespace all rules created from this flyout are stored under. */
const USER_RULES_NAMESPACE = 'observability-alerting';

/**
 * The label entries that will actually be persisted: both key AND value must be
 * non-empty (a key with a blank value is dropped). Shared by the Rule Preview
 * (YAML) and the save payload so the preview can never advertise a different
 * set than what is written. Keys are trimmed to match server-side storage.
 */
export function materializeLabels(labels: LabelEntry[]): LabelEntry[] {
  return labels
    .filter((l) => l.key.trim() !== '' && l.value.trim() !== '')
    .map((l) => ({ ...l, key: l.key.trim() }));
}

/**
 * The annotation entries that will be persisted. Drops empty key/value pairs and
 * folds the Rule details Description field into the standard `description`
 * annotation (which wins over a manually-typed one). Shared by preview + save so
 * the two cannot drift.
 */
export function materializeAnnotations(
  annotations: AnnotationEntry[],
  descriptionField: string
): AnnotationEntry[] {
  const description = descriptionField.trim();
  const manual = annotations
    .filter((a) => a.key.trim() !== '' && a.value.trim() !== '')
    .filter((a) => !(description && a.key.trim() === 'description'))
    .map((a) => ({ ...a, key: a.key.trim() }));
  return description ? [...manual, { key: 'description', value: description }] : manual;
}

/**
 * A PromQL expression that starts with a comparison operator (`> 0.5`) is not a
 * valid alert condition — the metric/series to the left is missing. Cheap guard
 * to block obviously-malformed input at submit time (full validation happens
 * server-side / on preview).
 */
export function startsWithComparison(query: string): boolean {
  return /^\s*(>=|<=|==|!=|>|<)/.test(query);
}

// ============================================================================
// Sub-components
// ============================================================================

/** Section 1: Monitor Details */
const MonitorDetailsSection = React.memo<{
  form: MetricsMonitorFormState;
  onUpdate: (patch: Partial<MetricsMonitorFormState>) => void;
  /** Duplicate-name error surfaced on the Rule name row. */
  nameError?: string;
}>(({ form, onUpdate, nameError }) => (
  <EuiAccordion
    id="cmm-rule-details"
    buttonContent={
      <strong>
        {i18n.translate('observability.alerting.createMetricsMonitor.monitorDetailsTitle', {
          defaultMessage: 'Rule details',
        })}
      </strong>
    }
    initialIsOpen
    paddingSize="m"
  >
    <EuiFormRow
      label={i18n.translate('observability.alerting.createMetricsMonitor.namespaceLabel', {
        defaultMessage: 'Namespace',
      })}
      helpText={i18n.translate('observability.alerting.createMetricsMonitor.namespaceHelp', {
        defaultMessage:
          'Logical grouping for rule groups. All rules created here are stored under the "observability-alerting" namespace.',
      })}
      fullWidth
    >
      <EuiFieldText value={USER_RULES_NAMESPACE} readOnly fullWidth compressed />
    </EuiFormRow>
    <EuiSpacer size="m" />
    <EuiFormRow
      label={i18n.translate('observability.alerting.createMetricsMonitor.groupNameLabel', {
        defaultMessage: 'Rule group',
      })}
      helpText={i18n.translate('observability.alerting.createMetricsMonitor.groupNameHelp', {
        defaultMessage:
          'Rules within a group share an evaluation interval and are evaluated together.',
      })}
      fullWidth
    >
      <RuleGroupSelector
        datasourceId={form.datasourceId}
        value={form.groupName}
        onChange={(groupName) => onUpdate({ groupName })}
        data-test-subj="metricsMonitorRuleGroupSelector"
      />
    </EuiFormRow>
    <EuiSpacer size="m" />
    <EuiFormRow
      label={i18n.translate('observability.alerting.createMetricsMonitor.monitorNameLabel', {
        defaultMessage: 'Rule name',
      })}
      fullWidth
      isInvalid={!!nameError}
      error={nameError}
    >
      <EuiFieldText
        placeholder={i18n.translate(
          'observability.alerting.createMetricsMonitor.monitorNamePlaceholder',
          { defaultMessage: 'Enter a rule name' }
        )}
        isInvalid={!!nameError}
        value={form.monitorName}
        onChange={(e) => onUpdate({ monitorName: e.target.value })}
        fullWidth
        compressed
        data-test-subj="metricsMonitorNameField"
        aria-label={i18n.translate(
          'observability.alerting.createMetricsMonitor.monitorNameAriaLabel',
          { defaultMessage: 'Rule name' }
        )}
      />
    </EuiFormRow>
    <EuiSpacer size="s" />
    <EuiText size="xs" color="subdued">
      {i18n.translate('observability.alerting.createMetricsMonitor.hierarchyExplanation', {
        defaultMessage:
          'Prometheus rules are organized as: Namespace → Rule Group → Rule. ' +
          'A namespace contains one or more rule groups, and each group contains one or more rules ' +
          'that share the same evaluation interval.',
      })}
    </EuiText>
    <EuiSpacer size="m" />
    <EuiFormRow
      label={
        <span>
          {i18n.translate('observability.alerting.createMetricsMonitor.descriptionLabel', {
            defaultMessage: 'Description',
          })}{' '}
          <span
            style={{ fontSize: 12, color: '#98A2B3', fontStyle: 'italic', fontWeight: 'normal' }}
          >
            {i18n.translate('observability.alerting.createMetricsMonitor.descriptionOptional', {
              defaultMessage: '— optional',
            })}
          </span>
        </span>
      }
      fullWidth
    >
      <EuiTextArea
        placeholder={i18n.translate(
          'observability.alerting.createMetricsMonitor.descriptionPlaceholder',
          { defaultMessage: 'Describe this rule' }
        )}
        value={form.description}
        onChange={(e) => onUpdate({ description: e.target.value })}
        rows={2}
        fullWidth
        compressed
        aria-label={i18n.translate(
          'observability.alerting.createMetricsMonitor.descriptionAriaLabel',
          { defaultMessage: 'Rule description' }
        )}
      />
    </EuiFormRow>
  </EuiAccordion>
));

/** Section 2: Query — Code (raw PromQL) or point-and-click Builder */
const QuerySection = React.memo<{
  form: MetricsMonitorFormState;
  onUpdate: (patch: Partial<MetricsMonitorFormState>) => void;
  showPreview: boolean;
  onRunPreview: () => void;
  /** Bumped on each "Run preview" click so the results block re-fetches. */
  previewToken: number;
  /** Time window (epoch seconds) the preview runs over; undefined = last hour. */
  previewTimeRange?: { start: number; end: number };
  /** 'code' shows the raw PromQL editor; 'builder' shows the metric picker. */
  queryMode: QueryMode;
  onQueryModeChange: (mode: QueryMode) => void;
  contextDatasourceName?: string;
  /** Selectable datasources (Alert Manager); absent = pinned context ds. */
  datasources?: Array<{ id: string; name: string; type: string }>;
  /** Render the "Build query in metrics →" link (Alert Manager only). */
  showBuildInMetricsLink?: boolean;
}>(
  ({
    form,
    onUpdate,
    showPreview,
    onRunPreview,
    previewToken,
    previewTimeRange,
    queryMode,
    onQueryModeChange,
    contextDatasourceName,
    datasources,
    showBuildInMetricsLink,
  }) => {
    const [showDatasourcePicker, setShowDatasourcePicker] = useState(false);
    // A non-empty expression the builder cannot represent (e.g. a copied
    // `rate(...) > 0.5`). Switching to the builder and picking a metric would
    // replace it — warn instead of silently clobbering (audit finding #7).
    const builderWouldOverwrite =
      form.query.trim() !== '' && parseBuilderQuery(form.query) === null;

    // With an explicit datasource list (Alert Manager) the picker offers all
    // Prometheus datasources; otherwise it is pinned to the Explore page's
    // context datasource.
    const datasourceOptions = useMemo(() => {
      if (datasources && datasources.length > 0) {
        return datasources
          .filter((ds) => ds.type === 'prometheus')
          .map((ds) => ({ id: ds.id, name: ds.name }));
      }
      if (form.datasourceId) {
        return [{ id: form.datasourceId, name: contextDatasourceName || form.datasourceId }];
      }
      return [];
    }, [datasources, form.datasourceId, contextDatasourceName]);

    const selectedDs = datasourceOptions.find((ds) => ds.id === form.datasourceId) ||
      datasourceOptions[0] || {
        id: '',
        name: i18n.translate('observability.alerting.createMetricsMonitor.noDatasourceAttached', {
          defaultMessage: 'No Prometheus datasource attached',
        }),
      };

    return (
      <EuiAccordion
        id="cmm-query"
        buttonContent={
          <strong>
            {i18n.translate('observability.alerting.createMetricsMonitor.queryTitle', {
              defaultMessage: 'Query',
            })}
          </strong>
        }
        initialIsOpen
        paddingSize="m"
        extraAction={
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            {showBuildInMetricsLink && (
              <EuiFlexItem grow={false}>
                {/* Mirrors the logs flyout's "Build query in logs →" round-trip:
                  author/validate the query against live data in the Metrics
                  app, then return via its Create alert rule action. Same-tab
                  navigation — unsaved form state here is lost. */}
                <EuiToolTip
                  position="left"
                  content={i18n.translate(
                    'observability.alerting.createMetricsMonitor.openInMetricsTooltip',
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
                    {i18n.translate('observability.alerting.createMetricsMonitor.openInMetrics', {
                      defaultMessage: 'Build query in metrics →',
                    })}
                  </EuiLink>
                </EuiToolTip>
              </EuiFlexItem>
            )}
            <EuiFlexItem grow={false}>
              <EuiButton
                size="s"
                onClick={onRunPreview}
                data-test-subj="metricsMonitorRunPreviewButton"
                aria-label={i18n.translate(
                  'observability.alerting.createMetricsMonitor.runPreviewAriaLabel',
                  { defaultMessage: 'Run preview' }
                )}
              >
                {i18n.translate('observability.alerting.createMetricsMonitor.runPreviewButton', {
                  defaultMessage: 'Run preview',
                })}
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        }
      >
        {/* Toolbar: language badge, datasource, query library, metric browser */}
        <EuiPanel paddingSize="s" hasBorder style={{ borderRadius: 4 }}>
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <EuiBetaBadge
                label="PromQL"
                tooltipContent={i18n.translate(
                  'observability.alerting.createMetricsMonitor.promqlTooltip',
                  { defaultMessage: 'Prometheus Query Language' }
                )}
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
                    onClick={() => setShowDatasourcePicker(!showDatasourcePicker)}
                    aria-label={i18n.translate(
                      'observability.alerting.createMetricsMonitor.pickDatasourceAriaLabel',
                      { defaultMessage: 'Pick data source' }
                    )}
                  >
                    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                      <EuiFlexItem grow={false}>{selectedDs.name}</EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiIcon type="arrowDown" size="s" />
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiButtonEmpty>
                }
                isOpen={showDatasourcePicker}
                closePopover={() => setShowDatasourcePicker(false)}
                panelPaddingSize="s"
              >
                {datasourceOptions.map((ds) => {
                  const isSelected = ds.id === form.datasourceId;
                  return (
                    <EuiButtonEmpty
                      key={ds.id}
                      size="xs"
                      // Show which datasource is active: a check on the selected
                      // row (empty icon keeps the others aligned) plus aria-current
                      // so assistive tech announces the selection.
                      iconType={isSelected ? 'check' : 'empty'}
                      iconSide="left"
                      color={isSelected ? 'primary' : 'text'}
                      aria-current={isSelected}
                      onClick={() => {
                        onUpdate({ datasourceId: ds.id });
                        setShowDatasourcePicker(false);
                      }}
                      style={{ display: 'block', width: '100%', textAlign: 'left' }}
                    >
                      {ds.name}
                    </EuiButtonEmpty>
                  );
                })}
              </EuiPopover>
            </EuiFlexItem>
            <EuiFlexItem grow={false} style={{ marginLeft: 'auto' }}>
              {/* Builder ⇄ Code toggle. Only one editor shows at a time, so a
                copied PromQL expression (Code) is never silently overwritten by
                the builder's output — the two no longer share a visible field. */}
              <EuiButtonGroup
                legend={i18n.translate(
                  'observability.alerting.createMetricsMonitor.queryModeLegend',
                  { defaultMessage: 'Query editor mode' }
                )}
                buttonSize="compressed"
                options={[
                  {
                    id: 'builder',
                    label: i18n.translate(
                      'observability.alerting.createMetricsMonitor.queryModeBuilder',
                      { defaultMessage: 'Builder' }
                    ),
                  },
                  {
                    id: 'code',
                    label: i18n.translate(
                      'observability.alerting.createMetricsMonitor.queryModeCode',
                      { defaultMessage: 'Code' }
                    ),
                  },
                ]}
                idSelected={queryMode}
                onChange={(id) => onQueryModeChange(id as QueryMode)}
                data-test-subj="metricsMonitorQueryModeToggle"
              />
            </EuiFlexItem>
          </EuiFlexGroup>

          <EuiSpacer size="m" />

          {queryMode === 'code' ? (
            /* Code mode: raw PromQL expression. A query copied from Explore
              lands here as-is (including complex expressions the builder can't
              represent), editable directly. */
            <EuiFormRow
              label={i18n.translate('observability.alerting.createMetricsMonitor.expressionLabel', {
                defaultMessage: 'PromQL expression',
              })}
              helpText={i18n.translate(
                'observability.alerting.createMetricsMonitor.expressionHelpText',
                {
                  defaultMessage:
                    'The complete alert condition. Switch to Builder to construct a simple metric/label query.',
                }
              )}
              fullWidth
            >
              <EuiTextArea
                value={form.query}
                onChange={(e) => onUpdate({ query: e.target.value })}
                placeholder={i18n.translate(
                  'observability.alerting.createMetricsMonitor.expressionPlaceholder',
                  { defaultMessage: 'e.g. rate(http_requests_total[5m]) > 0.5' }
                )}
                rows={2}
                fullWidth
                compressed
                aria-label={i18n.translate(
                  'observability.alerting.createMetricsMonitor.expressionAriaLabel',
                  { defaultMessage: 'PromQL expression' }
                )}
                data-test-subj="metricsMonitorPromQlExpression"
              />
            </EuiFormRow>
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
                      'observability.alerting.createMetricsMonitor.builderOverwriteWarning',
                      {
                        defaultMessage:
                          'Your current PromQL expression can’t be represented by the builder. Selecting a metric here will replace it — switch to Code to keep editing it directly.',
                      }
                    )}
                    data-test-subj="metricsMonitorBuilderOverwriteWarning"
                  />
                  <EuiSpacer size="s" />
                </>
              )}
              <PromQueryBuilder
                datasourceId={form.datasourceId}
                query={form.query}
                onQueryChange={(q) => onUpdate({ query: q })}
              />
            </>
          )}

          <EuiSpacer size="m" />

          {/* For duration — the rule's `for:` clause. Kept per-rule (unlike
            the group-level evaluation interval): the condition must hold
            continuously for this long before the alert fires. */}
          <EuiFormRow
            label={i18n.translate('observability.alerting.createMetricsMonitor.forDurationLabel', {
              defaultMessage: 'For duration',
            })}
            helpText={i18n.translate(
              'observability.alerting.createMetricsMonitor.forDurationHelpText',
              {
                defaultMessage:
                  'How long the condition must stay true before the alert fires. The alert is "pending" during this window.',
              }
            )}
            display="rowCompressed"
          >
            <EuiSelect
              options={FOR_DURATION_OPTIONS}
              value={form.forDuration}
              onChange={(e) => onUpdate({ forDuration: e.target.value })}
              compressed
              aria-label={i18n.translate(
                'observability.alerting.createMetricsMonitor.forDurationAriaLabel',
                { defaultMessage: 'For duration' }
              )}
              data-test-subj="metricsMonitorForDurationSelect"
            />
          </EuiFormRow>
        </EuiPanel>

        {/* Preview Results */}
        {showPreview && (
          <>
            <EuiSpacer size="m" />
            <QueryPreviewResults
              id="cmm-preview-results"
              query={form.query}
              datasourceId={form.datasourceId}
              timeRange={previewTimeRange}
              runToken={previewToken}
            />
          </>
        )}
      </EuiAccordion>
    );
  }
);

/** Section 5: Labels — shared LabelEditor keeps parity with the Alert Manager flyout */
const LabelsSection = React.memo<{
  labels: LabelEntry[];
  onUpdate: (labels: LabelEntry[]) => void;
}>(({ labels, onUpdate }) => (
  <EuiAccordion
    id="cmm-labels"
    buttonContent={
      <strong>
        {i18n.translate('observability.alerting.createMetricsMonitor.labelsTitle', {
          defaultMessage: 'Labels',
        })}
      </strong>
    }
    initialIsOpen
    paddingSize="m"
    extraAction={
      <EuiText size="xs" color="subdued">
        {i18n.translate('observability.alerting.createMetricsMonitor.labelsDescription', {
          defaultMessage: 'Categorize and route alerts',
        })}
      </EuiText>
    }
  >
    <LabelEditor labels={labels} onChange={onUpdate} />
  </EuiAccordion>
));

/** Section 6: Annotations */
const AnnotationsSection = React.memo<{
  annotations: AnnotationEntry[];
  onUpdate: (annotations: AnnotationEntry[]) => void;
}>(({ annotations, onUpdate }) => {
  const addAnnotation = () => onUpdate([...annotations, { key: '', value: '' }]);
  const removeAnnotation = (i: number) => onUpdate(annotations.filter((_, idx) => idx !== i));
  const updateAnnotation = (i: number, patch: Partial<AnnotationEntry>) => {
    const next = [...annotations];
    next[i] = { ...next[i], ...patch };
    onUpdate(next);
  };

  return (
    <EuiAccordion
      id="cmm-annotations"
      buttonContent={
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <strong>
              {i18n.translate('observability.alerting.createMetricsMonitor.annotationsTitle', {
                defaultMessage: 'Annotations',
              })}
            </strong>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">
              {i18n.translate('observability.alerting.createMetricsMonitor.annotationsOptional', {
                defaultMessage: 'Optional',
              })}
            </EuiBadge>
          </EuiFlexItem>
        </EuiFlexGroup>
      }
      initialIsOpen={false}
      paddingSize="m"
    >
      {annotations.map((ann, i) => (
        <EuiFlexGroup
          key={i}
          gutterSize="s"
          alignItems="center"
          responsive={false}
          style={{ marginBottom: 4 }}
        >
          <EuiFlexItem grow={2}>
            <EuiFieldText
              placeholder={i18n.translate(
                'observability.alerting.createMetricsMonitor.annotationKeyPlaceholder',
                { defaultMessage: 'e.g. summary, description, runbook_url' }
              )}
              value={ann.key}
              onChange={(e) => updateAnnotation(i, { key: e.target.value })}
              compressed
              aria-label={i18n.translate(
                'observability.alerting.createMetricsMonitor.annotationKeyAriaLabel',
                { defaultMessage: 'Annotation key {index}', values: { index: i + 1 } }
              )}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={4}>
            <EuiFieldText
              placeholder={i18n.translate(
                'observability.alerting.createMetricsMonitor.annotationValuePlaceholder',
                { defaultMessage: 'Supports Go template syntax' }
              )}
              value={ann.value}
              onChange={(e) => updateAnnotation(i, { value: e.target.value })}
              compressed
              aria-label={i18n.translate(
                'observability.alerting.createMetricsMonitor.annotationValueAriaLabel',
                { defaultMessage: 'Annotation value {index}', values: { index: i + 1 } }
              )}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonIcon
              iconType="trash"
              color="danger"
              size="s"
              onClick={() => removeAnnotation(i)}
              aria-label={i18n.translate(
                'observability.alerting.createMetricsMonitor.deleteAnnotationAriaLabel',
                {
                  defaultMessage: 'Delete annotation {annotation}',
                  values: { annotation: ann.key || i + 1 },
                }
              )}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      ))}
      <EuiSpacer size="xs" />
      <EuiButtonEmpty size="xs" iconType="plusInCircle" onClick={addAnnotation}>
        {i18n.translate('observability.alerting.createMetricsMonitor.addAnnotationButton', {
          defaultMessage: 'Add annotation',
        })}
      </EuiButtonEmpty>
    </EuiAccordion>
  );
});
/** Section 8: Rule Preview (YAML) */
const RulePreviewSection = React.memo<{
  form: MetricsMonitorFormState;
}>(({ form }) => {
  const yaml = useMemo(() => {
    const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    // Use the exact same materialization as the save path so the previewed
    // YAML is guaranteed to match the rule that gets written (WYSIWYG).
    const labels = materializeLabels(form.labels);
    const annotations = materializeAnnotations(form.annotations, form.description);
    // Mirror the full rule-group the save payload creates: rules are stored
    // under (namespace → group → rule), and the group carries the evaluation
    // interval. Previewing only the rule body hid where it lands and how often
    // it runs; show the whole structure so the preview matches what's written.
    const groupName = (form.groupName || form.monitorName || '<group-name>').trim();
    let out = `# namespace: ${form.namespace}\n`;
    out += `name: "${esc(groupName)}"\n`;
    out += `interval: ${form.evalInterval}\n`;
    out += `rules:\n`;
    out += `  - alert: "${esc(form.monitorName || '<monitor-name>')}"\n`;
    // The PromQL expression is the complete alert condition
    out += `    expr: "${esc(form.query || '<promql-expression>')}"\n`;
    out += `    for: ${form.forDuration}\n`;
    if (labels.length > 0) {
      out += `    labels:\n`;
      // Template values are single-quoted, matching the server's js-yaml
      // serialization (unquoted `{{ ... }}` would be invalid YAML)
      for (const l of labels) {
        out += `      "${esc(l.key)}": ${l.isDynamic ? `'${l.value}'` : `"${esc(l.value)}"`}\n`;
      }
    }
    if (annotations.length > 0) {
      out += `    annotations:\n`;
      // Annotations lack the isDynamic flag — detect template syntax to
      // single-quote like the server's js-yaml serialization does
      for (const a of annotations) {
        const value = /\{\{.*\}\}/.test(a.value) ? `'${a.value}'` : `"${esc(a.value)}"`;
        out += `      "${esc(a.key)}": ${value}\n`;
      }
    }
    return out;
  }, [
    form.namespace,
    form.groupName,
    form.evalInterval,
    form.monitorName,
    form.query,
    form.forDuration,
    form.labels,
    form.annotations,
    form.description,
  ]);

  return (
    <EuiAccordion
      id="cmm-rule-preview"
      buttonContent={
        <strong>
          {i18n.translate('observability.alerting.createMetricsMonitor.rulePreviewTitle', {
            defaultMessage: 'Rule Preview (YAML)',
          })}
        </strong>
      }
      initialIsOpen={false}
      paddingSize="m"
    >
      <EuiPanel paddingSize="s" color="subdued">
        <div
          style={{
            display: 'flex',
            fontFamily: "'SFMono-Regular', 'Menlo', 'Monaco', monospace",
            fontSize: 12,
            lineHeight: '20px',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 32,
              minWidth: 32,
              textAlign: 'right',
              paddingRight: 8,
              color: '#98A2B3',
              userSelect: 'none',
              borderRight: '1px solid #D3DAE6',
              marginRight: 8,
            }}
          >
            {yaml
              .trimEnd()
              .split('\n')
              .map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0, flex: 1 }}>{yaml}</pre>
        </div>
      </EuiPanel>
    </EuiAccordion>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export const CreateMetricsMonitor: React.FC<CreateMetricsMonitorProps> = ({
  onCancel,
  onSave,
  datasourceId: contextDatasourceId,
  datasourceName: contextDatasourceName,
  initialQuery,
  initialTimeRange,
  datasources,
  isNameTaken,
  showBuildInMetricsLink,
  http,
  addToast,
}) => {
  // Without a page-context datasource (Alert Manager), default to the first
  // Prometheus datasource in the provided list.
  const defaultDatasourceId =
    contextDatasourceId || datasources?.find((ds) => ds.type === 'prometheus')?.id || '';
  const [form, setForm] = useState<MetricsMonitorFormState>({
    monitorName: '',
    description: '',
    namespace: USER_RULES_NAMESPACE,
    groupName: '',
    // Pre-filled from the Explore Metrics editor when opened from that page.
    // Safe to seed now that the expression is shown in a visible, editable
    // field (see QuerySection) — a complex expression the builder can't
    // represent is no longer hidden-yet-submittable.
    query: initialQuery ?? '',
    datasourceId: defaultDatasourceId,
    forDuration: '5m',
    evalInterval: '1m',
    // `warning` by default — escalation to `critical` (paging) should be a
    // deliberate choice, matching the Alert Manager flyout's default
    labels: [{ key: 'severity', value: 'warning', isDynamic: false }],
    annotations: [],
  });
  // Default to Code mode when a query was copied in (so it shows as-is and the
  // builder can't overwrite it); an empty flyout starts in Builder mode.
  const [queryMode, setQueryMode] = useState<QueryMode>(() =>
    (initialQuery ?? '').trim() ? 'code' : 'builder'
  );
  const [showPreview, setShowPreview] = useState(false);
  // Bumped on each "Run preview" click so QueryPreviewResults re-runs the
  // range query even when the panel is already open.
  const [previewToken, setPreviewToken] = useState(0);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  // JSON snapshot so ANY field edit (description, group, duration,
  // datasource, label/annotation content) arms the discard-confirm modal —
  // same approach as the CreateMonitor shell
  const initialFormJson = useRef(JSON.stringify(form));

  const isDirty = JSON.stringify(form) !== initialFormJson.current;

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onCancel();
    }
  }, [isDirty, onCancel]);

  const updateForm = useCallback((patch: Partial<MetricsMonitorFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleLabelsUpdate = useCallback(
    (labels: LabelEntry[]) => updateForm({ labels }),
    [updateForm]
  );

  const handleAnnotationsUpdate = useCallback(
    (annotations: AnnotationEntry[]) => updateForm({ annotations }),
    [updateForm]
  );

  const handleRunPreview = useCallback(() => {
    setShowPreview(true);
    setPreviewToken((t) => t + 1);
  }, []);

  const duplicateName = !!(
    isNameTaken &&
    form.monitorName.trim() !== '' &&
    form.datasourceId !== '' &&
    // Scope the collision to the effective rule group (defaults to the rule
    // name), matching Prometheus's (group, name) identity.
    isNameTaken(
      form.monitorName.trim(),
      form.datasourceId,
      (form.groupName || form.monitorName).trim()
    )
  );
  const nameError = duplicateName
    ? i18n.translate('observability.alerting.createMetricsMonitor.nameDuplicate', {
        defaultMessage: 'A rule with this name already exists on the selected datasource.',
      })
    : undefined;

  const isValid =
    form.monitorName.trim() !== '' &&
    form.query.trim() !== '' &&
    // Reject an expression that is only/starts-with a comparison (no series).
    !startsWithComparison(form.query) &&
    form.datasourceId !== '' &&
    !duplicateName;

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!isValid || isSaving) return;

    // If no http client available, fall back to the original onSave callback
    if (!http || !form.datasourceId) {
      onSave(form);
      return;
    }

    setIsSaving(true);
    try {
      // The PromQL expression is the complete alert condition — no
      // operator/threshold appended server-side.
      const payload = {
        name: form.monitorName.trim(),
        query: form.query,
        forDuration: form.forDuration,
        evaluationInterval: form.evalInterval,
        // Same materialization the Rule Preview (YAML) shows — no drift.
        labels: Object.fromEntries(materializeLabels(form.labels).map((l) => [l.key, l.value])),
        annotations: Object.fromEntries(
          materializeAnnotations(form.annotations, form.description).map(
            (a) => [a.key, a.value] as [string, string]
          )
        ),
        enabled: true,
        groupName: (form.groupName || form.monitorName).trim(),
      };
      await http.post(`/api/alerting/prometheus/${encodeURIComponent(form.datasourceId)}/rules`, {
        body: JSON.stringify(payload),
      });
      addToast?.(
        i18n.translate('observability.alerting.createMetricsMonitor.toast.created', {
          defaultMessage: 'Alert rule created successfully.',
        }),
        'success'
      );
      onSave(form);
    } catch (err) {
      console.error('CreateMetricsMonitor: rule creation failed', err);
      // Surface the server's classified error (specific cause + remediation +
      // correlation id) instead of a static "Failed to create alert rule."
      // toast. Falls back to the generic message when no structured error is
      // present (older server, network error, etc.).
      const classified = extractClassifiedError(err);
      if (classified) {
        addToast?.(
          classified.title,
          classifiedToastColor(classified) === 'warning' ? 'warning' : 'danger',
          classifiedToastText(classified)
        );
      } else {
        addToast?.(
          i18n.translate('observability.alerting.createMetricsMonitor.toast.failed', {
            defaultMessage: 'Failed to create alert rule.',
          }),
          'danger'
        );
      }
    } finally {
      setIsSaving(false);
    }
  }, [isValid, isSaving, http, form, onSave, addToast]);

  return (
    <EuiFlyout onClose={handleClose} size="l" ownFocus aria-labelledby="createMetricsMonitorTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2 id="createMetricsMonitorTitle">
            {i18n.translate('observability.alerting.createMetricsMonitor.flyoutTitle', {
              defaultMessage: 'Create metrics rule',
            })}
          </h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          {i18n.translate('observability.alerting.createMetricsMonitor.flyoutSubtitle', {
            defaultMessage: 'PromQL-based alerting rule',
          })}
        </EuiText>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {/* Section 1: Monitor Details */}
        <MonitorDetailsSection form={form} onUpdate={updateForm} nameError={nameError} />
        <EuiHorizontalRule margin="l" />

        {/* Section 2: Query */}
        <QuerySection
          form={form}
          onUpdate={updateForm}
          showPreview={showPreview}
          onRunPreview={handleRunPreview}
          previewToken={previewToken}
          previewTimeRange={initialTimeRange}
          queryMode={queryMode}
          onQueryModeChange={setQueryMode}
          contextDatasourceName={contextDatasourceName}
          datasources={datasources}
          showBuildInMetricsLink={showBuildInMetricsLink}
        />
        <EuiHorizontalRule margin="l" />

        {/* Trigger condition and per-rule evaluation settings are
            intentionally absent: the PromQL expression is the complete
            alert condition, and evaluation cadence is a rule-group-level
            concern in managed Prometheus. The per-rule `for:` duration
            lives in the Query section. */}

        {/* Section 3: Labels */}
        <LabelsSection labels={form.labels} onUpdate={handleLabelsUpdate} />
        <EuiHorizontalRule margin="l" />

        {/* Section 6: Annotations */}
        <AnnotationsSection annotations={form.annotations} onUpdate={handleAnnotationsUpdate} />
        <EuiHorizontalRule margin="l" />

        {/* Notification actions are intentionally absent: routing for
            Prometheus alerts is Alertmanager's job, driven by labels. */}

        {/* Section 7: Rule Preview (YAML) */}
        <RulePreviewSection form={form} />
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="flexEnd" responsive={false} gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={handleClose} data-test-subj="metricsMonitorCancelButton">
              {i18n.translate('observability.alerting.createMetricsMonitor.cancelButton', {
                defaultMessage: 'Cancel',
              })}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              onClick={handleSave}
              isLoading={isSaving}
              isDisabled={!isValid}
              data-test-subj="metricsMonitorCreateButton"
            >
              {i18n.translate('observability.alerting.createMetricsMonitor.createButton', {
                defaultMessage: 'Create',
              })}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>

      {showDiscardConfirm && (
        <EuiConfirmModal
          title={i18n.translate('observability.alerting.createMetricsMonitor.discardModalTitle', {
            defaultMessage: 'Discard unsaved changes?',
          })}
          onCancel={() => setShowDiscardConfirm(false)}
          onConfirm={() => {
            setShowDiscardConfirm(false);
            onCancel();
          }}
          cancelButtonText={i18n.translate(
            'observability.alerting.createMetricsMonitor.discardModalCancel',
            { defaultMessage: 'Keep editing' }
          )}
          confirmButtonText={i18n.translate(
            'observability.alerting.createMetricsMonitor.discardModalConfirm',
            { defaultMessage: 'Discard' }
          )}
          buttonColor="danger"
        >
          <p>
            {i18n.translate('observability.alerting.createMetricsMonitor.discardModalBody', {
              defaultMessage: 'You have unsaved changes. Discard?',
            })}
          </p>
        </EuiConfirmModal>
      )}
    </EuiFlyout>
  );
};

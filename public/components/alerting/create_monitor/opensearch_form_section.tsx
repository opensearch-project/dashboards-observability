/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenSearch form section of the Create Monitor flyout. Handles all five
 * OpenSearch monitor variants (PPL, per-query DSL, per-bucket DSL,
 * per-document DSL, cluster metrics) — showing the appropriate query input,
 * schedule, trigger, and labels/annotations UI based on `monitorType`.
 *
 * Split out of the original `create_monitor.tsx` so the flyout shell in
 * `index.tsx` stays focused on orchestration + shared form fields.
 */
import React from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiFieldNumber,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTextArea,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import { AnnotationEditor, LabelEditor } from '../monitor_form_components';
import {
  CLUSTER_METRICS_API_OPTIONS,
  DURATION_OPTIONS,
  INTERVAL_OPTIONS,
  OpenSearchFormState,
  OS_MONITOR_TYPE_OPTIONS,
  OS_SCHEDULE_UNIT_OPTIONS,
} from './create_monitor_types';
import { PplTriggersSection } from './sections/ppl_triggers';

// ============================================================================
// OpenSearch Form Section
// ============================================================================

export const OpenSearchFormSection: React.FC<{
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

  return (
    <>
      {/* Monitor Type */}
      <EuiFormRow
        label={i18n.translate('observability.alerting.opensearchFormSection.monitorTypeLabel', {
          defaultMessage: 'Monitor Type',
        })}
        fullWidth
      >
        <EuiSelect
          options={OS_MONITOR_TYPE_OPTIONS}
          value={form.monitorType}
          onChange={(e) =>
            handleMonitorTypeChange(e.target.value as OpenSearchFormState['monitorType'])
          }
          fullWidth
          aria-label={i18n.translate(
            'observability.alerting.opensearchFormSection.monitorTypeAriaLabel',
            { defaultMessage: 'Monitor type' }
          )}
        />
      </EuiFormRow>

      <EuiSpacer size="m" />

      {/* Data Source — index pattern or cluster metrics API */}
      {isClusterMetrics ? (
        <EuiPanel paddingSize="m" color="subdued">
          <EuiTitle size="xs">
            <h3>
              {i18n.translate(
                'observability.alerting.opensearchFormSection.clusterMetricsApiTitle',
                { defaultMessage: 'Cluster Metrics API' }
              )}
            </h3>
          </EuiTitle>
          <EuiText size="xs" color="subdued">
            {i18n.translate(
              'observability.alerting.opensearchFormSection.clusterMetricsApiDescription',
              {
                defaultMessage:
                  'Select a cluster API to monitor. The monitor will call this API on the configured schedule and evaluate the trigger condition against the response.',
              }
            )}
          </EuiText>
          <EuiSpacer size="s" />
          <EuiFormRow
            label={i18n.translate('observability.alerting.opensearchFormSection.apiTypeLabel', {
              defaultMessage: 'API Type',
            })}
            fullWidth
          >
            <EuiSelect
              options={CLUSTER_METRICS_API_OPTIONS}
              value={form.clusterMetricsApiType}
              onChange={(e) => onUpdate('clusterMetricsApiType', e.target.value)}
              fullWidth
              aria-label={i18n.translate(
                'observability.alerting.opensearchFormSection.clusterMetricsApiTypeAriaLabel',
                { defaultMessage: 'Cluster metrics API type' }
              )}
            />
          </EuiFormRow>
          <EuiSpacer size="s" />
          <EuiFormRow
            label={i18n.translate(
              'observability.alerting.opensearchFormSection.pathParametersLabel',
              { defaultMessage: 'Path Parameters' }
            )}
            helpText={i18n.translate(
              'observability.alerting.opensearchFormSection.pathParametersHelpText',
              { defaultMessage: 'Optional path parameters, e.g. index name for CAT indices' }
            )}
            fullWidth
          >
            <EuiFieldText
              placeholder={i18n.translate(
                'observability.alerting.opensearchFormSection.pathParametersPlaceholder',
                { defaultMessage: 'e.g. my-index-*' }
              )}
              value={form.clusterMetricsPathParams}
              onChange={(e) => onUpdate('clusterMetricsPathParams', e.target.value)}
              fullWidth
              aria-label={i18n.translate(
                'observability.alerting.opensearchFormSection.clusterMetricsPathParamsAriaLabel',
                { defaultMessage: 'Cluster metrics path parameters' }
              )}
            />
          </EuiFormRow>
        </EuiPanel>
      ) : (
        <>
          <EuiPanel paddingSize="m" color="subdued">
            <EuiTitle size="xs">
              <h3>
                {i18n.translate('observability.alerting.opensearchFormSection.dataSourceTitle', {
                  defaultMessage: 'Data Source',
                })}
              </h3>
            </EuiTitle>
            <EuiSpacer size="s" />
            <EuiFormRow
              label={i18n.translate(
                'observability.alerting.opensearchFormSection.indexPatternLabel',
                { defaultMessage: 'Index Pattern' }
              )}
              helpText={
                isPPL
                  ? i18n.translate(
                      'observability.alerting.opensearchFormSection.indexPatternHelpTextPpl',
                      { defaultMessage: 'Used as the PPL source if not specified in the query' }
                    )
                  : i18n.translate(
                      'observability.alerting.opensearchFormSection.indexPatternHelpTextDsl',
                      { defaultMessage: 'Comma-separated index patterns, e.g. logs-*, metrics-*' }
                    )
              }
              fullWidth
              isInvalid={hasSubmitted && !!validationErrors.indices}
              error={hasSubmitted ? validationErrors.indices : undefined}
            >
              <EuiFieldText
                placeholder={i18n.translate(
                  'observability.alerting.opensearchFormSection.indexPatternPlaceholder',
                  { defaultMessage: 'logs-*, metrics-*' }
                )}
                value={form.indices}
                onChange={(e) => onUpdate('indices', e.target.value)}
                fullWidth
                aria-label={i18n.translate(
                  'observability.alerting.opensearchFormSection.indexPatternAriaLabel',
                  { defaultMessage: 'Index pattern' }
                )}
              />
            </EuiFormRow>
          </EuiPanel>

          <EuiSpacer size="m" />

          {/* Query */}
          <EuiPanel paddingSize="m" color="subdued">
            <EuiTitle size="xs">
              <h3>
                {i18n.translate('observability.alerting.opensearchFormSection.queryTitle', {
                  defaultMessage: 'Query',
                })}
              </h3>
            </EuiTitle>
            <EuiText size="xs" color="subdued">
              {isPPL
                ? i18n.translate(
                    'observability.alerting.opensearchFormSection.queryDescriptionPpl',
                    {
                      defaultMessage: 'Piped Processing Language — pipe-delimited query syntax',
                    }
                  )
                : i18n.translate(
                    'observability.alerting.opensearchFormSection.queryDescriptionDsl',
                    { defaultMessage: 'OpenSearch Query DSL (JSON)' }
                  )}
            </EuiText>
            <EuiSpacer size="s" />
            <EuiTextArea
              value={form.query}
              onChange={(e) => onUpdate('query', e.target.value)}
              rows={isPPL ? 4 : 8}
              fullWidth
              placeholder={
                isPPL
                  ? i18n.translate(
                      'observability.alerting.opensearchFormSection.queryPlaceholderPpl',
                      {
                        defaultMessage:
                          'source = logs-* | where status >= 500 | stats count() as error_count',
                      }
                    )
                  : i18n.translate(
                      'observability.alerting.opensearchFormSection.queryPlaceholderDsl',
                      { defaultMessage: '{ "size": 0, "query": { ... } }' }
                    )
              }
              style={{ fontFamily: 'monospace', fontSize: 12 }}
              aria-label={
                isPPL
                  ? i18n.translate(
                      'observability.alerting.opensearchFormSection.queryAriaLabelPpl',
                      { defaultMessage: 'PPL query' }
                    )
                  : i18n.translate(
                      'observability.alerting.opensearchFormSection.queryAriaLabelDsl',
                      { defaultMessage: 'Query DSL' }
                    )
              }
            />
            {isPPL && (
              <>
                <EuiSpacer size="xs" />
                <EuiText size="xs" color="subdued">
                  <FormattedMessage
                    id="observability.alerting.opensearchFormSection.pplExample"
                    defaultMessage="Example: {example}"
                    values={{
                      example: (
                        <code>
                          source = logs-* | where status {'>'} 500 | stats count() as error_count by
                          host
                        </code>
                      ),
                    }}
                  />
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
          <h3>
            {i18n.translate('observability.alerting.opensearchFormSection.scheduleTitle', {
              defaultMessage: 'Schedule',
            })}
          </h3>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiFlexGroup gutterSize="s">
          <EuiFlexItem>
            <EuiFormRow
              label={i18n.translate('observability.alerting.opensearchFormSection.runEveryLabel', {
                defaultMessage: 'Run every',
              })}
              display="rowCompressed"
            >
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
                aria-label={i18n.translate(
                  'observability.alerting.opensearchFormSection.scheduleIntervalAriaLabel',
                  { defaultMessage: 'Schedule interval' }
                )}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFormRow
              label={i18n.translate(
                'observability.alerting.opensearchFormSection.scheduleUnitLabel',
                { defaultMessage: 'Unit' }
              )}
              display="rowCompressed"
            >
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
                aria-label={i18n.translate(
                  'observability.alerting.opensearchFormSection.scheduleUnitAriaLabel',
                  { defaultMessage: 'Schedule unit' }
                )}
              />
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* Trigger — PPL renders a multi-trigger list; DSL falls back to Painless */}
      {isPPL ? (
        <>
          {/* PPL trigger list — multi-trigger editor with destination picker per action */}
          <EuiPanel paddingSize="m" color="subdued">
            <PplTriggersSection
              dsId={form.datasourceId}
              triggers={form.pplTriggers}
              onChange={(next) => onUpdate('pplTriggers', next)}
              hasSubmitted={hasSubmitted}
            />
          </EuiPanel>

          <EuiSpacer size="m" />

          {/* Evaluation Settings */}
          <EuiPanel paddingSize="m" color="subdued">
            <EuiTitle size="xs">
              <h3>
                {i18n.translate(
                  'observability.alerting.opensearchFormSection.evaluationSettingsTitle',
                  { defaultMessage: 'Evaluation Settings' }
                )}
              </h3>
            </EuiTitle>
            <EuiSpacer size="s" />
            <EuiFlexGroup gutterSize="s" wrap>
              <EuiFlexItem style={{ minWidth: 160 }}>
                <EuiFormRow
                  label={i18n.translate(
                    'observability.alerting.opensearchFormSection.evalIntervalLabel',
                    { defaultMessage: 'Eval Interval' }
                  )}
                  helpText={i18n.translate(
                    'observability.alerting.opensearchFormSection.evalIntervalHelpText',
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
                      'observability.alerting.opensearchFormSection.evaluationIntervalAriaLabel',
                      { defaultMessage: 'Evaluation interval' }
                    )}
                  />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem style={{ minWidth: 160 }}>
                <EuiFormRow
                  label={i18n.translate(
                    'observability.alerting.opensearchFormSection.pendingPeriodLabel',
                    { defaultMessage: 'Pending Period' }
                  )}
                  helpText={i18n.translate(
                    'observability.alerting.opensearchFormSection.pendingPeriodHelpText',
                    { defaultMessage: 'Before firing' }
                  )}
                  display="rowCompressed"
                >
                  <EuiSelect
                    options={DURATION_OPTIONS}
                    value={form.pendingPeriod}
                    onChange={(e) => onUpdate('pendingPeriod', e.target.value)}
                    compressed
                    aria-label={i18n.translate(
                      'observability.alerting.opensearchFormSection.pendingPeriodAriaLabel',
                      { defaultMessage: 'Pending period' }
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
                    {i18n.translate('observability.alerting.opensearchFormSection.labelsTitle', {
                      defaultMessage: 'Labels',
                    })}
                  </h3>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  {i18n.translate(
                    'observability.alerting.opensearchFormSection.labelsDescription',
                    { defaultMessage: 'Categorize and route alerts' }
                  )}
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
                    <strong>
                      {i18n.translate(
                        'observability.alerting.opensearchFormSection.annotationsTitle',
                        { defaultMessage: 'Annotations' }
                      )}
                    </strong>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="hollow">
                      {i18n.translate(
                        'observability.alerting.opensearchFormSection.optionalBadge',
                        { defaultMessage: 'Optional' }
                      )}
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
        </>

      ) : (
        <>
          {/* DSL Trigger */}
          <EuiPanel paddingSize="m" color="subdued">
            <EuiTitle size="xs">
              <h3>
                {i18n.translate('observability.alerting.opensearchFormSection.triggerTitle', {
                  defaultMessage: 'Trigger',
                })}
              </h3>
            </EuiTitle>
            <EuiSpacer size="s" />
            <EuiFormRow
              label={i18n.translate(
                'observability.alerting.opensearchFormSection.triggerNameLabel',
                { defaultMessage: 'Trigger Name' }
              )}
              fullWidth
            >
              <EuiFieldText
                placeholder={i18n.translate(
                  'observability.alerting.opensearchFormSection.triggerNamePlaceholder',
                  { defaultMessage: 'e.g. Error count threshold' }
                )}
                value={form.triggerName}
                onChange={(e) => onUpdate('triggerName', e.target.value)}
                fullWidth
                aria-label={i18n.translate(
                  'observability.alerting.opensearchFormSection.triggerNameAriaLabel',
                  { defaultMessage: 'Trigger name' }
                )}
              />
            </EuiFormRow>
            <EuiSpacer size="s" />
            <EuiFormRow
              label={i18n.translate('observability.alerting.opensearchFormSection.conditionLabel', {
                defaultMessage: 'Condition (Painless script)',
              })}
              helpText={i18n.translate(
                'observability.alerting.opensearchFormSection.conditionHelpText',
                { defaultMessage: 'e.g. ctx.results[0].hits.total.value > 100' }
              )}
              fullWidth
            >
              <EuiFieldText
                placeholder="ctx.results[0].hits.total.value > 100"
                value={form.triggerCondition}
                onChange={(e) => onUpdate('triggerCondition', e.target.value)}
                fullWidth
                style={{ fontFamily: 'monospace' }}
                aria-label={i18n.translate(
                  'observability.alerting.opensearchFormSection.triggerConditionAriaLabel',
                  { defaultMessage: 'Trigger condition' }
                )}
              />
            </EuiFormRow>
          </EuiPanel>

          <EuiSpacer size="m" />

          {/* DSL Action (optional) */}
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
      )}

      {!isPPL && (
        <>
          <EuiSpacer size="m" />

          {/* DSL Action (optional) — PPL handles per-trigger destinations inline */}
          <EuiPanel paddingSize="m" color="subdued">
            <EuiAccordion
              id="os-action"
              buttonContent={
                <EuiFlexGroup alignItems="center" responsive={false} gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <strong>
                      {i18n.translate('observability.alerting.opensearchFormSection.actionTitle', {
                        defaultMessage: 'Action',
                      })}
                    </strong>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="hollow">
                      {i18n.translate(
                        'observability.alerting.opensearchFormSection.actionOptionalBadge',
                        { defaultMessage: 'Optional' }
                      )}
                    </EuiBadge>
                  </EuiFlexItem>
                </EuiFlexGroup>
              }
              initialIsOpen={false}
              paddingSize="none"
            >
              <EuiSpacer size="s" />
              <EuiFormRow
                label={i18n.translate(
                  'observability.alerting.opensearchFormSection.actionNameLabel',
                  { defaultMessage: 'Action Name' }
                )}
              >
                <EuiFieldText
                  placeholder={i18n.translate(
                    'observability.alerting.opensearchFormSection.actionNamePlaceholder',
                    { defaultMessage: 'Notify Slack' }
                  )}
                  value={form.actionName}
                  onChange={(e) => onUpdate('actionName', e.target.value)}
                  aria-label={i18n.translate(
                    'observability.alerting.opensearchFormSection.actionNameAriaLabel',
                    { defaultMessage: 'Action name' }
                  )}
                />
              </EuiFormRow>
              <EuiSpacer size="s" />
              <EuiFormRow
                label={i18n.translate(
                  'observability.alerting.opensearchFormSection.destinationIdLabel',
                  { defaultMessage: 'Destination ID' }
                )}
              >
                <EuiFieldText
                  placeholder={i18n.translate(
                    'observability.alerting.opensearchFormSection.destinationIdPlaceholder',
                    { defaultMessage: 'Destination ID' }
                  )}
                  value={form.actionDestination}
                  onChange={(e) => onUpdate('actionDestination', e.target.value)}
                  aria-label={i18n.translate(
                    'observability.alerting.opensearchFormSection.destinationIdAriaLabel',
                    { defaultMessage: 'Destination ID' }
                  )}
                />
              </EuiFormRow>
              <EuiSpacer size="s" />
              <EuiFormRow
                label={i18n.translate(
                  'observability.alerting.opensearchFormSection.messageTemplateLabel',
                  { defaultMessage: 'Message Template' }
                )}
              >
                <EuiTextArea
                  placeholder="Alert: {{ctx.monitor.name}} triggered"
                  value={form.actionMessage}
                  onChange={(e) => onUpdate('actionMessage', e.target.value)}
                  rows={3}
                  aria-label={i18n.translate(
                    'observability.alerting.opensearchFormSection.messageTemplateAriaLabel',
                    { defaultMessage: 'Message template' }
                  )}
                />
              </EuiFormRow>
            </EuiAccordion>
          </EuiPanel>
        </>
      )}
    </>
  );
};

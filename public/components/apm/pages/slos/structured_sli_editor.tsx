/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLI editor for the structured (non-custom) SLI types — `availability` and
 * `latency_threshold`. Mirrors `CustomPromqlEditor`'s shape so every template,
 * regardless of SLI type, has the same two-tier UX:
 *
 *   Simple view  → a plain-language summary + read-only generated query, driven
 *                  by the metric/filter/threshold and the selected service.
 *   Advanced     → an accordion that reveals the editable structured fields:
 *                  a metric picker (autocomplete from the datasource) plus the
 *                  type-specific control — a "good events" label filter for
 *                  availability, the per-objective latency threshold for
 *                  latency. The SLI keeps its structured type/canonicalKind —
 *                  this is NOT a raw-PromQL conversion (that lives only on the
 *                  `custom` template).
 *
 * Unlike the custom editor, the query here is derived (not stored as PromQL):
 * we render the same `buildProbeQueries`/generator shape read-only so the user
 * sees exactly what will deploy.
 */

import React, { useState } from 'react';
import {
  EuiAccordion,
  EuiCode,
  EuiComboBox,
  EuiComboBoxOptionOption,
  EuiFieldText,
  EuiFormRow,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import type { SloTemplate } from '../../../../../common/slo/slo_templates';
import {
  ensureBucketMetric,
  formatLatencyBoundLe,
} from '../../../../../common/slo/slo_promql_generator';
import { usePrometheusMetadata } from '../../../alerting/hooks/use_prometheus_metadata';
import type { Action, FormState } from './wizard_state';

export interface StructuredSliEditorProps {
  state: FormState;
  errors: Record<string, string>;
  dispatch: React.Dispatch<Action>;
  template: SloTemplate;
  /** Datasource for metric autocomplete. Empty disables it (free text). */
  datasourceId: string;
  /**
   * Optional "test this query" control rendered directly under the query
   * summary, so verifying the SLI lives with the query itself rather than in a
   * separate panel. The wizard passes an embedded ProbeSliPanel.
   */
  probeSlot?: React.ReactNode;
}

const SLI_TYPE = {
  availability: 'availability' as const,
  latency: 'latency_threshold' as const,
};

/** Plain-language summary of what this SLI measures, for the simple view. */
function summaryText(template: SloTemplate, service: string): string {
  const svc =
    service ||
    i18n.translate('observability.apm.slo.wizard.structuredSli.thisService', {
      defaultMessage: 'this service',
    });
  if (template.sli.type === SLI_TYPE.latency) {
    return i18n.translate('observability.apm.slo.wizard.structuredSli.summaryLatency', {
      defaultMessage: 'Fraction of {service} requests completing under the latency threshold.',
      values: { service: svc },
    });
  }
  return i18n.translate('observability.apm.slo.wizard.structuredSli.summaryAvailability', {
    defaultMessage: 'Successful (good-event) request ratio for {service}.',
    values: { service: svc },
  });
}

/**
 * Read-only summary of the derived query. Uses the deploy path's own helpers
 * (`ensureBucketMetric`, `formatLatencyBoundLe`) so the preview matches what's
 * recorded — notably the latency `_bucket` suffix and unit-scaled `le` bound.
 * The `5m` window is illustrative (deploy emits one rule per MWMBR window).
 */
function summaryQuery(state: FormState, template: SloTemplate): string {
  const metric = state.metric || template.sli.metric || '';
  if (!metric) {
    return '';
  }
  const dims = state.dimensions
    .filter((d) => d.name && d.value)
    .map((d) => `${d.name}="${d.value}"`)
    .join(', ');
  if (template.sli.type === SLI_TYPE.latency) {
    const bucketMetric = ensureBucketMetric(metric);
    const raw = Number(state.objectives[0]?.latencyThreshold);
    const le =
      Number.isFinite(raw) && raw > 0 ? formatLatencyBoundLe(raw, state.latencyThresholdUnit) : '…';
    const sel = dims ? `${dims}, ` : '';
    return `sum(rate(${bucketMetric}{${sel}le="${le}"}[5m])) / sum(rate(${bucketMetric}{${sel}le="+Inf"}[5m]))`;
  }
  const good = state.goodEventsFilter
    ? `${dims ? `${dims}, ` : ''}${state.goodEventsFilter}`
    : dims;
  return `sum(rate(${metric}{${good}}[5m])) / sum(rate(${metric}{${dims}}[5m]))`;
}

/** True when the metric + good-filter are still the template defaults. */
function isTemplateDefault(state: FormState, template: SloTemplate): boolean {
  const metricUntouched = (state.metric || '') === (template.sli.metric ?? '');
  if (template.sli.type === SLI_TYPE.availability) {
    return metricUntouched && state.goodEventsFilter === (template.sli.goodEventsFilter ?? '');
  }
  return metricUntouched;
}

export const StructuredSliEditor: React.FC<StructuredSliEditorProps> = ({
  state,
  errors,
  dispatch,
  template,
  datasourceId,
  probeSlot,
}) => {
  const metricError = errors['spec.sli.definition.metric'];
  const goodFilterError = errors['spec.sli.definition.goodEventsFilter'];
  const hasErrors = !!(metricError || goodFilterError);

  // Same open/closed logic as the custom editor: collapsed while the SLI is the
  // untouched template default, auto-open once edited or on a validation error.
  const onTemplateDefault = isTemplateDefault(state, template);
  const [advancedOpen, setAdvancedOpen] = useState(!onTemplateDefault || hasErrors);

  const query = summaryQuery(state, template);

  return (
    <EuiPanel data-test-subj="slosWizardStructuredSli">
      <EuiText size="m">
        <h4>
          {i18n.translate('observability.apm.slo.wizard.structuredSli.heading', {
            defaultMessage: 'SLI query',
          })}
        </h4>
      </EuiText>

      <EuiSpacer size="s" />
      <EuiText size="s" data-test-subj="slosWizardStructuredSliSummary">
        {summaryText(template, state.service)}
      </EuiText>
      <EuiSpacer size="xs" />
      <EuiText size="xs" color="subdued">
        {i18n.translate('observability.apm.slo.wizard.structuredSli.summaryQueryLabel', {
          defaultMessage: 'Query:',
        })}{' '}
        <EuiCode data-test-subj="slosWizardStructuredSliSummaryQuery">
          {query ||
            i18n.translate('observability.apm.slo.wizard.structuredSli.summaryQueryEmpty', {
              defaultMessage: 'select a service to build the query',
            })}
        </EuiCode>
      </EuiText>

      <EuiSpacer size="m" />
      <EuiAccordion
        id="slosWizardStructuredSliAdvanced"
        forceState={advancedOpen ? 'open' : 'closed'}
        onToggle={(isOpen) => setAdvancedOpen(isOpen)}
        buttonContent={i18n.translate('observability.apm.slo.wizard.structuredSli.advancedToggle', {
          defaultMessage: 'Advanced — edit the SLI query',
        })}
        data-test-subj="slosWizardStructuredSliAdvanced"
        extraAction={
          hasErrors ? (
            <EuiText size="xs" color="danger" data-test-subj="slosWizardStructuredSliErrorHint">
              {i18n.translate('observability.apm.slo.wizard.structuredSli.advancedErrorHint', {
                defaultMessage: 'Needs attention',
              })}
            </EuiText>
          ) : undefined
        }
      >
        <EuiSpacer size="s" />
        <EuiText size="s" color="subdued">
          {i18n.translate('observability.apm.slo.wizard.structuredSli.advancedDescription', {
            defaultMessage:
              'Pick the metric and adjust the matcher. For a fully custom query, use the Custom template.',
          })}
        </EuiText>
        <EuiSpacer size="s" />

        <MetricField
          metric={state.metric}
          datasourceId={datasourceId}
          isInvalid={!!metricError}
          error={metricError}
          onChange={(value) => dispatch({ kind: 'setField', field: 'metric', value })}
        />

        {template.sli.type === SLI_TYPE.availability && (
          <EuiFormRow
            label={i18n.translate('observability.apm.slo.wizard.structuredSli.goodFilterLabel', {
              defaultMessage: 'Good events filter',
            })}
            helpText={i18n.translate('observability.apm.slo.wizard.structuredSli.goodFilterHelp', {
              defaultMessage:
                'A single label matcher selecting good events, e.g. status_code!~"5..". Default: {value}',
              values: { value: template.sli.goodEventsFilter ?? '—' },
            })}
            isInvalid={!!goodFilterError}
            error={goodFilterError}
            fullWidth
          >
            <EuiFieldText
              value={state.goodEventsFilter}
              onChange={(e) =>
                dispatch({ kind: 'setField', field: 'goodEventsFilter', value: e.target.value })
              }
              data-test-subj="slosWizardGoodEventsFilter"
            />
          </EuiFormRow>
        )}

        {template.sli.type === SLI_TYPE.latency && (
          <EuiText size="xs" color="subdued" data-test-subj="slosWizardStructuredSliLatencyHint">
            {i18n.translate('observability.apm.slo.wizard.structuredSli.latencyThresholdHint', {
              defaultMessage:
                'Set the latency threshold per objective in the Objectives section below.',
            })}
          </EuiText>
        )}
      </EuiAccordion>

      {probeSlot && (
        <>
          <EuiSpacer size="m" />
          {probeSlot}
        </>
      )}
    </EuiPanel>
  );
};

interface MetricFieldProps {
  metric: string;
  datasourceId: string;
  isInvalid: boolean;
  error?: string;
  onChange: (metric: string) => void;
}

/** Metric picker with datasource autocomplete; accepts free text as fallback. */
const MetricField: React.FC<MetricFieldProps> = ({
  metric,
  datasourceId,
  isInvalid,
  error,
  onChange,
}) => {
  const { metricOptions, metricsLoading, searchMetrics } = usePrometheusMetadata({
    datasourceId,
    selectedMetric: metric,
  });
  const selected: EuiComboBoxOptionOption[] = metric ? [{ label: metric }] : [];

  return (
    <EuiFormRow
      label={i18n.translate('observability.apm.slo.wizard.structuredSli.metricLabel', {
        defaultMessage: 'Metric',
      })}
      isInvalid={isInvalid}
      error={error}
      fullWidth
    >
      <EuiComboBox
        async
        singleSelection={{ asPlainText: true }}
        isClearable
        isInvalid={isInvalid}
        isLoading={metricsLoading}
        placeholder={i18n.translate(
          'observability.apm.slo.wizard.structuredSli.metricPlaceholder',
          {
            defaultMessage: 'Select or type a metric',
          }
        )}
        options={metricOptions}
        selectedOptions={selected}
        onSearchChange={(s) => searchMetrics(s)}
        onChange={(picked) => onChange(picked[0]?.label ?? '')}
        onCreateOption={(raw) => onChange(raw.trim())}
        fullWidth
        data-test-subj="slosWizardStructuredSliMetric"
      />
    </EuiFormRow>
  );
};

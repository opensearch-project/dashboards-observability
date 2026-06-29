/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Ratio-path metric input — the simple SLI authoring surface, modeled on
 * Grafana's "Success metric" / "Total metric" fields.
 *
 * The user picks (or types) a single metric; the `sum(rate(...[window]))` wrap
 * and ratio math are implicit, so no one writes PromQL for the common case.
 * Label filters are optional progressive disclosure — collapsed until the user
 * clicks "Add label filter" — so the simple case stays one field. Metric and
 * label autocomplete come from `usePrometheusMetadata` (graceful free-text
 * fallback when a datasource isn't selected or metadata APIs fail).
 *
 * A metric can optionally subtract a second metric (APM's
 * `good = request - fault`): "Subtract a metric" reveals a second metric+filter
 * editor that shares the main term's implicit agg/rate/window. Both terms keep
 * full dropdowns instead of forcing the whole query into raw text.
 *
 * Emits the serialized PromQL string via `onChange`; the live preview shows
 * exactly what will be deployed.
 */

import React, { useMemo, useState } from 'react';
import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCode,
  EuiComboBox,
  EuiComboBoxOptionOption,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSelect,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import {
  LabelFilter,
  MatchOp,
  MetricTerm,
  PromQLModel,
  serializePromQL,
} from '../../../../../common/slo/promql_builder';
import { usePrometheusMetadata } from '../../../alerting/hooks/use_prometheus_metadata';

const MATCH_OPS: MatchOp[] = ['=', '!=', '=~', '!~'];

export interface MetricPickerProps {
  /** Structured model — `agg`/`rate`/`window` are fixed by the Ratio path. */
  model: PromQLModel;
  onChange: (next: PromQLModel) => void;
  datasourceId: string;
  'data-test-subj'?: string;
}

export const MetricPicker: React.FC<MetricPickerProps> = ({
  model,
  onChange,
  datasourceId,
  'data-test-subj': dataTestSubj,
}) => {
  const hasSubtract = !!model.subtract;
  const preview = serializePromQL(model);

  const addSubtract = () => onChange({ ...model, subtract: { metric: '', filters: [] } });
  const removeSubtract = () => {
    const next = { ...model };
    delete next.subtract;
    onChange(next);
  };

  return (
    <div data-test-subj={dataTestSubj}>
      <MetricTermEditor
        term={{ metric: model.metric, filters: model.filters }}
        onChange={(t) => onChange({ ...model, metric: t.metric, filters: t.filters })}
        datasourceId={datasourceId}
        testSubj="slosWizardMetric"
      />

      {hasSubtract ? (
        <>
          <EuiSpacer size="s" />
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                <strong>
                  {i18n.translate('observability.apm.slo.wizard.metricPicker.minusLabel', {
                    defaultMessage: '− subtract',
                  })}
                </strong>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonIcon
                iconType="cross"
                color="danger"
                onClick={removeSubtract}
                aria-label={i18n.translate(
                  'observability.apm.slo.wizard.metricPicker.removeSubtract',
                  { defaultMessage: 'Remove subtracted metric' }
                )}
                data-test-subj="slosWizardMetricRemoveSubtract"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="xs" />
          <MetricTermEditor
            term={model.subtract!}
            onChange={(t) => onChange({ ...model, subtract: t })}
            datasourceId={datasourceId}
            testSubj="slosWizardSubtractMetric"
          />
        </>
      ) : (
        <>
          <EuiSpacer size="xs" />
          <EuiButtonEmpty
            size="xs"
            iconType="minusInCircle"
            onClick={addSubtract}
            data-test-subj="slosWizardMetricAddSubtract"
          >
            {i18n.translate('observability.apm.slo.wizard.metricPicker.addSubtract', {
              defaultMessage: 'Subtract a metric',
            })}
          </EuiButtonEmpty>
        </>
      )}

      <EuiSpacer size="xs" />
      <EuiText size="xs" color="subdued">
        {i18n.translate('observability.apm.slo.wizard.metricPicker.previewLabel', {
          defaultMessage: 'Query:',
        })}{' '}
        <EuiCode data-test-subj="slosWizardMetricPreview">
          {preview ||
            i18n.translate('observability.apm.slo.wizard.metricPicker.previewEmpty', {
              defaultMessage: 'pick a metric…',
            })}
        </EuiCode>
      </EuiText>
    </div>
  );
};

// ============================================================================
// MetricTermEditor — one metric + its label filters, with its own autocomplete.
// ============================================================================

interface MetricTermEditorProps {
  term: MetricTerm;
  onChange: (next: MetricTerm) => void;
  datasourceId: string;
  /** Test-subj prefix; the main and subtract terms pass distinct values. */
  testSubj: string;
}

const MetricTermEditor: React.FC<MetricTermEditorProps> = ({
  term,
  onChange,
  datasourceId,
  testSubj,
}) => {
  const {
    metricOptions,
    metricsLoading,
    searchMetrics,
    labelNames,
    labelValues,
    fetchLabelValues,
  } = usePrometheusMetadata({ datasourceId, selectedMetric: term.metric });

  // Filters are revealed on demand; auto-open if the term already carries some.
  const [showFilters, setShowFilters] = useState(term.filters.length > 0);

  const metricSelected: EuiComboBoxOptionOption[] = term.metric ? [{ label: term.metric }] : [];
  const labelNameOptions = useMemo(() => labelNames.map((l) => ({ label: l })), [labelNames]);

  const setFilters = (filters: LabelFilter[]) => onChange({ ...term, filters });
  const addFilter = () => {
    setShowFilters(true);
    setFilters([...term.filters, { label: '', op: '=', value: '' }]);
  };
  const updateFilter = (i: number, patch: Partial<LabelFilter>) =>
    setFilters(term.filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const removeFilter = (i: number) => setFilters(term.filters.filter((_, idx) => idx !== i));

  return (
    <div data-test-subj={`${testSubj}Term`}>
      <EuiComboBox
        async
        compressed
        singleSelection={{ asPlainText: true }}
        isClearable
        isLoading={metricsLoading}
        placeholder={i18n.translate('observability.apm.slo.wizard.metricPicker.placeholder', {
          defaultMessage: 'Select or type a metric',
        })}
        options={metricOptions}
        selectedOptions={metricSelected}
        onSearchChange={(s) => searchMetrics(s)}
        onChange={(picked) => onChange({ ...term, metric: picked[0]?.label ?? '' })}
        onCreateOption={(raw) => onChange({ ...term, metric: raw.trim() })}
        fullWidth
        data-test-subj={`${testSubj}Name`}
      />

      {(showFilters || term.filters.length > 0) && (
        <>
          <EuiSpacer size="s" />
          {term.filters.map((filter, i) => (
            <LabelFilterRow
              key={i}
              filter={filter}
              index={i}
              testSubj={testSubj}
              labelNameOptions={labelNameOptions}
              valueOptions={labelValues[filter.label] ?? []}
              onFocusValues={() => fetchLabelValues(filter.label)}
              onChange={(patch) => updateFilter(i, patch)}
              onRemove={() => removeFilter(i)}
            />
          ))}
        </>
      )}

      <EuiSpacer size="xs" />
      <EuiButtonEmpty
        size="xs"
        iconType="plusInCircle"
        onClick={addFilter}
        data-test-subj={`${testSubj}AddFilter`}
      >
        {i18n.translate('observability.apm.slo.wizard.metricPicker.addFilter', {
          defaultMessage: 'Add label filter',
        })}
      </EuiButtonEmpty>
    </div>
  );
};

interface LabelFilterRowProps {
  filter: LabelFilter;
  index: number;
  testSubj: string;
  labelNameOptions: EuiComboBoxOptionOption[];
  valueOptions: EuiComboBoxOptionOption[];
  onFocusValues: () => void;
  onChange: (patch: Partial<LabelFilter>) => void;
  onRemove: () => void;
}

const LabelFilterRow: React.FC<LabelFilterRowProps> = ({
  filter,
  index,
  testSubj,
  labelNameOptions,
  valueOptions,
  onFocusValues,
  onChange,
  onRemove,
}) => (
  <EuiFlexGroup
    gutterSize="s"
    alignItems="center"
    responsive={false}
    data-test-subj={`${testSubj}Filter-${index}`}
  >
    <EuiFlexItem grow={3}>
      <EuiComboBox
        compressed
        singleSelection={{ asPlainText: true }}
        isClearable={false}
        placeholder={i18n.translate('observability.apm.slo.wizard.metricPicker.labelPlaceholder', {
          defaultMessage: 'label',
        })}
        options={labelNameOptions}
        selectedOptions={filter.label ? [{ label: filter.label }] : []}
        onChange={(picked) => onChange({ label: picked[0]?.label ?? '' })}
        onCreateOption={(raw) => onChange({ label: raw.trim() })}
        data-test-subj={`${testSubj}FilterLabel-${index}`}
      />
    </EuiFlexItem>
    <EuiFlexItem grow={false} style={{ width: 64 }}>
      <EuiSelect
        compressed
        options={MATCH_OPS.map((o) => ({ value: o, text: o }))}
        value={filter.op}
        onChange={(e) => onChange({ op: e.target.value as MatchOp })}
        aria-label={i18n.translate('observability.apm.slo.wizard.metricPicker.opAriaLabel', {
          defaultMessage: 'Match operator',
        })}
        data-test-subj={`${testSubj}FilterOp-${index}`}
      />
    </EuiFlexItem>
    <EuiFlexItem grow={3}>
      <EuiComboBox
        compressed
        singleSelection={{ asPlainText: true }}
        isClearable={false}
        placeholder={i18n.translate('observability.apm.slo.wizard.metricPicker.valuePlaceholder', {
          defaultMessage: 'value',
        })}
        options={valueOptions}
        selectedOptions={filter.value ? [{ label: filter.value }] : []}
        onFocus={onFocusValues}
        onChange={(picked) => onChange({ value: picked[0]?.label ?? '' })}
        onCreateOption={(raw) => onChange({ value: raw.trim() })}
        data-test-subj={`${testSubj}FilterValue-${index}`}
      />
    </EuiFlexItem>
    <EuiFlexItem grow={false}>
      <EuiButtonIcon
        iconType="cross"
        color="danger"
        onClick={onRemove}
        aria-label={i18n.translate('observability.apm.slo.wizard.metricPicker.removeFilter', {
          defaultMessage: 'Remove filter',
        })}
        data-test-subj={`${testSubj}FilterRemove-${index}`}
      />
    </EuiFlexItem>
  </EuiFlexGroup>
);

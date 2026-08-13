/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PromQueryBuilder — the shared point-and-click PromQL builder used by both
 * the Alert Manager "Create metrics rule" flyout and the Metrics page
 * "Create alert rule" flyout.
 *
 * Builds expressions of the shape `metric` or `metric{label OP "value"}`
 * from live metadata (metric names, label names/values) fetched from the
 * datasource. Seeds its selections from an existing query when that query
 * is builder-representable; complex expressions leave the builder empty and
 * inert so a seeded query is never clobbered unless the user explicitly
 * picks a new metric.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  EuiButtonIcon,
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSelect,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { AlertingPromResourcesService } from '../query_services/alerting_prom_resources_service';

interface ParsedBuilderQuery {
  metric: string;
  labelName?: string;
  labelOperator?: string;
  labelValue?: string;
}

/**
 * Parse a PromQL expression back into builder selections, when the expression
 * has the exact shape the builder produces: `metric` or
 * `metric{label OP "value"}`. Returns null for anything more complex
 * (aggregations, comparisons, multiple matchers) — those cannot be
 * represented by the builder, so its fields stay empty and the builder→query
 * sync stays inert until the user makes a selection.
 */
export function parseBuilderQuery(query: string): ParsedBuilderQuery | null {
  const match = (query || '')
    .trim()
    .match(
      /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(=~|!~|!=|=)\s*"((?:[^"\\]|\\.)*)"\s*\})?$/
    );
  if (!match) return null;
  const [, metric, labelName, labelOperator, escapedValue] = match;
  if (!labelName) return { metric };
  // Reverse the escaping applied by the builder→query sync
  const labelValue = escapedValue.replace(/\\(["\\])/g, '$1');
  return { metric, labelName, labelOperator, labelValue };
}

export const PromQueryBuilder: React.FC<{
  /** Datasource to fetch metric/label metadata from. */
  datasourceId?: string;
  /** Current query, used to seed builder selections on mount. */
  query: string;
  /** Fired whenever builder selections produce (or clear) a query. */
  onQueryChange: (query: string) => void;
}> = ({ datasourceId, query, onQueryChange }) => {
  // Seeded once on mount — complex expressions yield null and an inert builder
  const [seededBuilder] = useState(() => parseBuilderQuery(query));
  const [metricOptions, setMetricOptions] = useState<Array<{ label: string }>>([]);
  const [selectedMetric, setSelectedMetric] = useState<Array<{ label: string }>>(
    seededBuilder ? [{ label: seededBuilder.metric }] : []
  );
  const [labelNameOptions, setLabelNameOptions] = useState<Array<{ label: string }>>([]);
  const [selectedLabelName, setSelectedLabelName] = useState<Array<{ label: string }>>(
    seededBuilder?.labelName ? [{ label: seededBuilder.labelName }] : []
  );
  const [labelValueOptions, setLabelValueOptions] = useState<Array<{ label: string }>>([]);
  const [selectedLabelValue, setSelectedLabelValue] = useState<Array<{ label: string }>>(
    seededBuilder?.labelValue ? [{ label: seededBuilder.labelValue }] : []
  );
  const [labelOperator, setLabelOperator] = useState(seededBuilder?.labelOperator || '=');

  // Fetch metric names when datasource changes. The `stale` flag guards
  // against out-of-order responses overwriting current options.
  useEffect(() => {
    if (!datasourceId) return;
    let stale = false;
    const service = new AlertingPromResourcesService(datasourceId);
    service
      .listMetricNames()
      .then(({ metrics }) => {
        if (!stale) setMetricOptions(metrics.map((m) => ({ label: m })));
      })
      .catch(() => {
        /* non-critical */
      });
    return () => {
      stale = true;
    };
  }, [datasourceId]);

  // Fetch label names when metric changes
  useEffect(() => {
    if (!datasourceId || selectedMetric.length === 0) {
      setLabelNameOptions([]);
      return;
    }
    let stale = false;
    const service = new AlertingPromResourcesService(datasourceId);
    service
      .listLabelNames(selectedMetric[0].label)
      .then(({ labels }) => {
        if (!stale) setLabelNameOptions(labels.map((l) => ({ label: l })));
      })
      .catch(() => {
        /* non-critical */
      });
    return () => {
      stale = true;
    };
  }, [datasourceId, selectedMetric]);

  // Fetch label values when label name changes
  useEffect(() => {
    if (!datasourceId || selectedLabelName.length === 0) {
      setLabelValueOptions([]);
      return;
    }
    let stale = false;
    const metric = selectedMetric.length > 0 ? selectedMetric[0].label : undefined;
    const selector = metric ? `{__name__="${metric}"}` : undefined;
    const service = new AlertingPromResourcesService(datasourceId);
    service
      .listLabelValues(selectedLabelName[0].label, selector)
      .then(({ values }) => {
        if (!stale) setLabelValueOptions(values.map((v) => ({ label: v })));
      })
      .catch(() => {
        /* non-critical */
      });
    return () => {
      stale = true;
    };
  }, [datasourceId, selectedLabelName, selectedMetric]);

  // Tracks whether the current query was authored by the builder. Only then
  // may clearing the metric clear the query — a complex seeded expression
  // the builder never produced must not be wiped.
  const builderOwnsQuery = useRef(false);

  const syncBuilderToQuery = useCallback(() => {
    if (selectedMetric.length === 0) return;
    const metric = selectedMetric[0].label;
    let next = metric;
    if (selectedLabelName.length > 0 && selectedLabelValue.length > 0) {
      // Escape backslashes and quotes so the value is a valid PromQL string literal
      const escapedValue = selectedLabelValue[0].label.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const labelFilter = `${selectedLabelName[0].label}${labelOperator}"${escapedValue}"`;
      next = `${metric}{${labelFilter}}`;
    }
    builderOwnsQuery.current = true;
    onQueryChange(next);
  }, [selectedMetric, selectedLabelName, selectedLabelValue, labelOperator, onQueryChange]);

  // Sync when builder field selections change; clearing the metric clears a
  // builder-authored query so the two stay consistent
  useEffect(() => {
    if (selectedMetric.length > 0) {
      syncBuilderToQuery();
    } else if (builderOwnsQuery.current) {
      builderOwnsQuery.current = false;
      onQueryChange('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMetric, selectedLabelName, selectedLabelValue, labelOperator]);

  return (
    <>
      <EuiFlexGroup gutterSize="m" alignItems="flexEnd" responsive={false}>
        <EuiFlexItem grow={3}>
          <EuiFormRow
            label={i18n.translate('observability.alerting.promQueryBuilder.metricLabel', {
              defaultMessage: 'Metric',
            })}
            display="rowCompressed"
          >
            <EuiComboBox
              placeholder={i18n.translate(
                'observability.alerting.promQueryBuilder.metricPlaceholder',
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
            label={i18n.translate('observability.alerting.promQueryBuilder.labelNameLabel', {
              defaultMessage: 'Label name',
            })}
            display="rowCompressed"
          >
            <EuiComboBox
              placeholder={i18n.translate(
                'observability.alerting.promQueryBuilder.labelNamePlaceholder',
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
            label={i18n.translate('observability.alerting.promQueryBuilder.labelValueLabel', {
              defaultMessage: 'Label value',
            })}
            display="rowCompressed"
          >
            <EuiComboBox
              placeholder={i18n.translate(
                'observability.alerting.promQueryBuilder.labelValuePlaceholder',
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
              'observability.alerting.promQueryBuilder.clearFilterAriaLabel',
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
        {i18n.translate('observability.alerting.promQueryBuilder.helpText', {
          defaultMessage: 'Select a metric to start.',
        })}
      </EuiText>
    </>
  );
};

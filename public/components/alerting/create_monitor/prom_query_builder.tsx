/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PromQueryBuilder — the shared point-and-click PromQL alert-condition builder
 * used by both the Alert Manager "Create metrics rule" flyout and the Metrics
 * page "Create alert rule" flyout.
 *
 * It assembles the expression in four stacked layers (see `prom_condition.ts`
 * for the pure composition/parse core):
 *
 *   1. Series    — metric + optional `{label OP "value"}` matcher
 *   2. Function  — rate / increase / delta, or the `_over_time` reduce family,
 *                  over a rolling window
 *   3. Aggregate — sum / avg / min / max / count across series, optional
 *                  `by (…)` / `without (…)` grouping
 *   4. Condition — IS ABOVE / BELOW / EQUAL / … or a range, i.e. the comparison
 *                  that makes the alert conditional rather than always-firing
 *
 * Metric names, label names, and label values are fetched live from the
 * datasource. Selections are seeded from an existing query when that query is
 * builder-representable (`parseExpr`); anything more complex leaves the builder
 * empty and inert so a seeded Code expression is never clobbered unless the
 * user explicitly picks a new metric.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  EuiButtonIcon,
  EuiCode,
  EuiComboBox,
  EuiFieldNumber,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormLabel,
  EuiFormRow,
  EuiSelect,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { AlertingPromResourcesService } from '../query_services/alerting_prom_resources_service';
import {
  AggGrouping,
  AggOp,
  buildExpr,
  ConditionBuilderState,
  ConditionOp,
  DEFAULT_WINDOW,
  isRangeOp,
  parseExpr,
  RangeFn,
} from './prom_condition';

/** Function options (value = PromQL function name). */
const FUNCTION_OPTIONS: Array<{ value: RangeFn; text: string }> = [
  {
    value: 'none',
    text: i18n.translate('observability.alerting.promQueryBuilder.fnNone', {
      defaultMessage: 'None (instant value)',
    }),
  },
  {
    value: 'rate',
    text: i18n.translate('observability.alerting.promQueryBuilder.fnRate', {
      defaultMessage: 'Rate',
    }),
  },
  {
    value: 'increase',
    text: i18n.translate('observability.alerting.promQueryBuilder.fnIncrease', {
      defaultMessage: 'Increase',
    }),
  },
  {
    value: 'delta',
    text: i18n.translate('observability.alerting.promQueryBuilder.fnDelta', {
      defaultMessage: 'Delta',
    }),
  },
  {
    value: 'avg_over_time',
    text: i18n.translate('observability.alerting.promQueryBuilder.fnAvgOverTime', {
      defaultMessage: 'Avg over time',
    }),
  },
  {
    value: 'min_over_time',
    text: i18n.translate('observability.alerting.promQueryBuilder.fnMinOverTime', {
      defaultMessage: 'Min over time',
    }),
  },
  {
    value: 'max_over_time',
    text: i18n.translate('observability.alerting.promQueryBuilder.fnMaxOverTime', {
      defaultMessage: 'Max over time',
    }),
  },
  {
    value: 'sum_over_time',
    text: i18n.translate('observability.alerting.promQueryBuilder.fnSumOverTime', {
      defaultMessage: 'Sum over time',
    }),
  },
  {
    value: 'count_over_time',
    text: i18n.translate('observability.alerting.promQueryBuilder.fnCountOverTime', {
      defaultMessage: 'Count over time',
    }),
  },
  {
    value: 'last_over_time',
    text: i18n.translate('observability.alerting.promQueryBuilder.fnLastOverTime', {
      defaultMessage: 'Last over time',
    }),
  },
];

/** Aggregation-operator options (value = PromQL aggregation keyword). */
const AGG_OP_OPTIONS: Array<{ value: AggOp; text: string }> = [
  {
    value: 'none',
    text: i18n.translate('observability.alerting.promQueryBuilder.aggNone', {
      defaultMessage: 'None',
    }),
  },
  {
    value: 'sum',
    text: i18n.translate('observability.alerting.promQueryBuilder.aggSum', {
      defaultMessage: 'Sum',
    }),
  },
  {
    value: 'avg',
    text: i18n.translate('observability.alerting.promQueryBuilder.aggAvg', {
      defaultMessage: 'Average',
    }),
  },
  {
    value: 'min',
    text: i18n.translate('observability.alerting.promQueryBuilder.aggMin', {
      defaultMessage: 'Min',
    }),
  },
  {
    value: 'max',
    text: i18n.translate('observability.alerting.promQueryBuilder.aggMax', {
      defaultMessage: 'Max',
    }),
  },
  {
    value: 'count',
    text: i18n.translate('observability.alerting.promQueryBuilder.aggCount', {
      defaultMessage: 'Count',
    }),
  },
];

/** Grouping-modifier options for the aggregation. */
const GROUPING_OPTIONS: Array<{ value: AggGrouping; text: string }> = [
  {
    value: 'none',
    text: i18n.translate('observability.alerting.promQueryBuilder.groupingNone', {
      defaultMessage: 'no grouping',
    }),
  },
  {
    value: 'by',
    text: i18n.translate('observability.alerting.promQueryBuilder.groupingBy', {
      defaultMessage: 'by',
    }),
  },
  {
    value: 'without',
    text: i18n.translate('observability.alerting.promQueryBuilder.groupingWithout', {
      defaultMessage: 'without',
    }),
  },
];

/** Condition-operator options (value → label). */
const CONDITION_OP_OPTIONS: Array<{ value: ConditionOp; text: string }> = [
  {
    value: 'none',
    text: i18n.translate('observability.alerting.promQueryBuilder.condNone', {
      defaultMessage: 'No condition (always firing)',
    }),
  },
  {
    value: 'gt',
    text: i18n.translate('observability.alerting.promQueryBuilder.condGt', {
      defaultMessage: 'IS ABOVE',
    }),
  },
  {
    value: 'gte',
    text: i18n.translate('observability.alerting.promQueryBuilder.condGte', {
      defaultMessage: 'IS ABOVE OR EQUAL',
    }),
  },
  {
    value: 'lt',
    text: i18n.translate('observability.alerting.promQueryBuilder.condLt', {
      defaultMessage: 'IS BELOW',
    }),
  },
  {
    value: 'lte',
    text: i18n.translate('observability.alerting.promQueryBuilder.condLte', {
      defaultMessage: 'IS BELOW OR EQUAL',
    }),
  },
  {
    value: 'eq',
    text: i18n.translate('observability.alerting.promQueryBuilder.condEq', {
      defaultMessage: 'IS EQUAL TO',
    }),
  },
  {
    value: 'neq',
    text: i18n.translate('observability.alerting.promQueryBuilder.condNeq', {
      defaultMessage: 'IS NOT EQUAL TO',
    }),
  },
  {
    value: 'outside',
    text: i18n.translate('observability.alerting.promQueryBuilder.condOutside', {
      defaultMessage: 'IS OUTSIDE RANGE',
    }),
  },
  {
    value: 'within',
    text: i18n.translate('observability.alerting.promQueryBuilder.condWithin', {
      defaultMessage: 'IS WITHIN RANGE',
    }),
  },
];

/** Re-export so callers (the always-firing warning) parse from one place. */
export { parseExpr, buildExpr } from './prom_condition';

export const PromQueryBuilder: React.FC<{
  /** Datasource to fetch metric/label metadata from. */
  datasourceId?: string;
  /** Current query, used to seed builder selections on mount. */
  query: string;
  /** Fired whenever builder selections produce (or clear) a query. */
  onQueryChange: (query: string) => void;
}> = ({ datasourceId, query, onQueryChange }) => {
  // Seeded once on mount — complex expressions yield null and an inert builder.
  const [seeded] = useState(() => parseExpr(query));
  const [metricOptions, setMetricOptions] = useState<Array<{ label: string }>>([]);
  const [selectedMetric, setSelectedMetric] = useState<Array<{ label: string }>>(
    seeded ? [{ label: seeded.metric }] : []
  );
  const [labelNameOptions, setLabelNameOptions] = useState<Array<{ label: string }>>([]);
  const [selectedLabelName, setSelectedLabelName] = useState<Array<{ label: string }>>(
    seeded?.labelName ? [{ label: seeded.labelName }] : []
  );
  const [labelValueOptions, setLabelValueOptions] = useState<Array<{ label: string }>>([]);
  const [selectedLabelValue, setSelectedLabelValue] = useState<Array<{ label: string }>>(
    seeded?.labelValue ? [{ label: seeded.labelValue }] : []
  );
  const [labelOperator, setLabelOperator] = useState(seeded?.labelOperator || '=');

  // Function + aggregate + condition layers.
  const [func, setFunc] = useState<RangeFn>(seeded?.func ?? 'none');
  const [window, setWindow] = useState(seeded?.window || DEFAULT_WINDOW);
  const [aggOp, setAggOp] = useState<AggOp>(seeded?.aggOp ?? 'none');
  const [aggGrouping, setAggGrouping] = useState<AggGrouping>(seeded?.aggGrouping ?? 'none');
  const [aggLabels, setAggLabels] = useState((seeded?.aggLabels || []).join(', '));
  const [conditionOp, setConditionOp] = useState<ConditionOp>(seeded?.conditionOp ?? 'none');
  // Thresholds are held as strings so the field can be cleared / mid-typed; the
  // pure core coerces a blank/NaN value to 0 when composing.
  const [thresholdA, setThresholdA] = useState(
    seeded?.thresholdA !== undefined ? String(seeded.thresholdA) : ''
  );
  const [thresholdB, setThresholdB] = useState(
    seeded?.thresholdB !== undefined ? String(seeded.thresholdB) : ''
  );

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

  // Fetch label names when metric changes.
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

  // Fetch label values when label name changes.
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
  // may clearing the metric clear the query — a complex seeded expression the
  // builder never produced must not be wiped.
  const builderOwnsQuery = useRef(false);

  const currentState = useCallback(
    (): ConditionBuilderState => ({
      metric: selectedMetric.length > 0 ? selectedMetric[0].label : '',
      labelName: selectedLabelName.length > 0 ? selectedLabelName[0].label : undefined,
      labelOperator,
      labelValue: selectedLabelValue.length > 0 ? selectedLabelValue[0].label : undefined,
      func,
      window,
      aggOp,
      aggGrouping,
      aggLabels: aggLabels
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean),
      conditionOp,
      thresholdA: thresholdA === '' ? undefined : Number(thresholdA),
      thresholdB: thresholdB === '' ? undefined : Number(thresholdB),
    }),
    [
      selectedMetric,
      selectedLabelName,
      selectedLabelValue,
      labelOperator,
      func,
      window,
      aggOp,
      aggGrouping,
      aggLabels,
      conditionOp,
      thresholdA,
      thresholdB,
    ]
  );

  // Sync whenever any builder field changes; clearing the metric clears a
  // builder-authored query so the two stay consistent.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      // Seeded FROM the query on mount: mark ownership so a later clear can
      // reset it, but do NOT re-emit — re-emitting would normalize whitespace
      // the user never touched and spuriously mark the form dirty.
      if (seeded) builderOwnsQuery.current = true;
      return;
    }
    if (selectedMetric.length > 0) {
      builderOwnsQuery.current = true;
      onQueryChange(buildExpr(currentState()));
    } else if (builderOwnsQuery.current) {
      builderOwnsQuery.current = false;
      onQueryChange('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedMetric,
    selectedLabelName,
    selectedLabelValue,
    labelOperator,
    func,
    window,
    aggOp,
    aggGrouping,
    aggLabels,
    conditionOp,
    thresholdA,
    thresholdB,
  ]);

  const showRange = isRangeOp(conditionOp);
  const numericWindow = window.replace(/[a-z]/gi, '');
  const windowUnit = window.replace(/[0-9.]/g, '') || 'm';

  return (
    <>
      {/* Layer 1 — series selector. Metric stands alone; the label matcher
        (name / operator / value / clear) is one tight cluster so it reads as a
        single `{name = value}` filter rather than three scattered fields. */}
      <EuiFlexGroup gutterSize="m" alignItems="flexEnd" responsive={false}>
        <EuiFlexItem grow={2}>
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
              onChange={(opts) => {
                setSelectedMetric(opts);
                // Reset the label filter when the metric changes — a label
                // name/value valid for the old metric can be invalid for the
                // new one, building an incorrect `newMetric{staleLabel=…}`.
                setSelectedLabelName([]);
                setSelectedLabelValue([]);
              }}
              singleSelection={{ asPlainText: true }}
              compressed
              isClearable
              data-test-subj="promBuilderMetric"
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem grow={3}>
          <EuiFormRow
            label={i18n.translate('observability.alerting.promQueryBuilder.labelFilterLabel', {
              defaultMessage: 'Label filter — optional',
            })}
            display="rowCompressed"
          >
            {/* xs gutter so name/op/value visually connect as one matcher. */}
            <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
              <EuiFlexItem grow={3}>
                <EuiComboBox
                  placeholder={i18n.translate(
                    'observability.alerting.promQueryBuilder.labelNamePlaceholder',
                    { defaultMessage: 'Label name' }
                  )}
                  aria-label={i18n.translate(
                    'observability.alerting.promQueryBuilder.labelNameLabel',
                    { defaultMessage: 'Label name' }
                  )}
                  options={labelNameOptions}
                  selectedOptions={selectedLabelName}
                  onChange={(opts) => setSelectedLabelName(opts)}
                  singleSelection={{ asPlainText: true }}
                  compressed
                  isClearable
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false} style={{ width: 68 }}>
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
                  aria-label={i18n.translate(
                    'observability.alerting.promQueryBuilder.labelOperatorAriaLabel',
                    { defaultMessage: 'Label match operator' }
                  )}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={3}>
                <EuiComboBox
                  placeholder={i18n.translate(
                    'observability.alerting.promQueryBuilder.labelValuePlaceholder',
                    { defaultMessage: 'Label value' }
                  )}
                  aria-label={i18n.translate(
                    'observability.alerting.promQueryBuilder.labelValueLabel',
                    { defaultMessage: 'Label value' }
                  )}
                  options={labelValueOptions}
                  selectedOptions={selectedLabelValue}
                  onChange={(opts) => setSelectedLabelValue(opts)}
                  singleSelection={{ asPlainText: true }}
                  compressed
                  isClearable
                />
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
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>

      {/* Progressive disclosure: the transform + condition layers only appear
        once a metric is chosen, so the empty state is a single clean row. */}
      {selectedMetric.length > 0 && (
        <>
          <EuiSpacer size="m" />
          <EuiFormLabel>
            {i18n.translate('observability.alerting.promQueryBuilder.transformSection', {
              defaultMessage: 'Transform (optional)',
            })}
          </EuiFormLabel>
          <EuiSpacer size="xs" />

          {/* Layer 2 — function, and Layer 3 — aggregation. Wraps so the
            compressed controls reflow instead of cramming on a narrow flyout. */}
          <EuiFlexGroup gutterSize="m" alignItems="flexEnd" responsive={false} wrap>
            <EuiFlexItem grow={false} style={{ minWidth: 150 }}>
              <EuiFormRow
                label={i18n.translate('observability.alerting.promQueryBuilder.functionLabel', {
                  defaultMessage: 'Function',
                })}
                display="rowCompressed"
              >
                <EuiSelect
                  options={FUNCTION_OPTIONS}
                  value={func}
                  onChange={(e) => setFunc(e.target.value as RangeFn)}
                  compressed
                  data-test-subj="promBuilderFunction"
                  aria-label={i18n.translate(
                    'observability.alerting.promQueryBuilder.functionAriaLabel',
                    { defaultMessage: 'Range function' }
                  )}
                />
              </EuiFormRow>
            </EuiFlexItem>
            {func !== 'none' && (
              <>
                <EuiFlexItem grow={false} style={{ width: 72 }}>
                  <EuiFormRow
                    label={i18n.translate('observability.alerting.promQueryBuilder.windowLabel', {
                      defaultMessage: 'Window',
                    })}
                    display="rowCompressed"
                  >
                    <EuiFieldNumber
                      value={numericWindow}
                      min={1}
                      step={1}
                      onChange={(e) => {
                        // Prometheus durations are integers only, and a bare unit
                        // (e.g. `[m]`) is invalid PromQL. Keep digits only and,
                        // when the field is cleared, emit '' so `buildExpr` falls
                        // back to the default window instead of a unit-only value.
                        const digits = e.target.value.replace(/[^0-9]/g, '');
                        setWindow(digits ? `${digits}${windowUnit}` : '');
                      }}
                      compressed
                      data-test-subj="promBuilderWindow"
                      aria-label={i18n.translate(
                        'observability.alerting.promQueryBuilder.windowAriaLabel',
                        { defaultMessage: 'Function window' }
                      )}
                    />
                  </EuiFormRow>
                </EuiFlexItem>
                <EuiFlexItem grow={false} style={{ width: 64 }}>
                  {/* Unit as its own control — an `append` select gets clipped at
                these compressed widths, hiding the current unit. */}
                  <EuiFormRow label="&nbsp;" display="rowCompressed">
                    <EuiSelect
                      options={[
                        { value: 's', text: 's' },
                        { value: 'm', text: 'm' },
                        { value: 'h', text: 'h' },
                        { value: 'd', text: 'd' },
                        { value: 'w', text: 'w' },
                        { value: 'y', text: 'y' },
                      ]}
                      value={windowUnit}
                      onChange={(e) => setWindow(`${numericWindow || '5'}${e.target.value}`)}
                      compressed
                      aria-label={i18n.translate(
                        'observability.alerting.promQueryBuilder.windowUnitAriaLabel',
                        { defaultMessage: 'Window unit' }
                      )}
                    />
                  </EuiFormRow>
                </EuiFlexItem>
              </>
            )}
            <EuiFlexItem grow={false} style={{ minWidth: 150 }}>
              <EuiFormRow
                label={i18n.translate('observability.alerting.promQueryBuilder.aggregateLabel', {
                  defaultMessage: 'Aggregate',
                })}
                display="rowCompressed"
              >
                <EuiSelect
                  options={AGG_OP_OPTIONS}
                  value={aggOp}
                  onChange={(e) => setAggOp(e.target.value as AggOp)}
                  compressed
                  data-test-subj="promBuilderAggregate"
                  aria-label={i18n.translate(
                    'observability.alerting.promQueryBuilder.aggregateAriaLabel',
                    { defaultMessage: 'Aggregation operator' }
                  )}
                />
              </EuiFormRow>
            </EuiFlexItem>
            {aggOp !== 'none' && (
              <>
                <EuiFlexItem grow={false} style={{ width: 120 }}>
                  <EuiFormRow
                    label={i18n.translate('observability.alerting.promQueryBuilder.groupingLabel', {
                      defaultMessage: 'Grouping',
                    })}
                    display="rowCompressed"
                  >
                    <EuiSelect
                      options={GROUPING_OPTIONS}
                      value={aggGrouping}
                      onChange={(e) => setAggGrouping(e.target.value as AggGrouping)}
                      compressed
                      data-test-subj="promBuilderGrouping"
                      aria-label={i18n.translate(
                        'observability.alerting.promQueryBuilder.groupingAriaLabel',
                        { defaultMessage: 'Aggregation grouping' }
                      )}
                    />
                  </EuiFormRow>
                </EuiFlexItem>
                {aggGrouping !== 'none' && (
                  <EuiFlexItem grow={false} style={{ minWidth: 160 }}>
                    <EuiFormRow
                      label={i18n.translate(
                        'observability.alerting.promQueryBuilder.groupLabelsLabel',
                        {
                          defaultMessage: 'Labels',
                        }
                      )}
                      display="rowCompressed"
                    >
                      <EuiFieldText
                        placeholder={i18n.translate(
                          'observability.alerting.promQueryBuilder.groupLabelsPlaceholder',
                          { defaultMessage: 'e.g. job, instance' }
                        )}
                        value={aggLabels}
                        onChange={(e) => setAggLabels(e.target.value)}
                        compressed
                        data-test-subj="promBuilderGroupLabels"
                        aria-label={i18n.translate(
                          'observability.alerting.promQueryBuilder.groupLabelsAriaLabel',
                          { defaultMessage: 'Grouping labels (comma-separated)' }
                        )}
                      />
                    </EuiFormRow>
                  </EuiFlexItem>
                )}
              </>
            )}
          </EuiFlexGroup>

          <EuiSpacer size="m" />

          {/* Layer 4 — condition. No wrap: the operator and its value(s) must
            stay on one line so the "IS ABOVE → 6" pairing reads as one decision. */}
          <EuiFlexGroup gutterSize="m" alignItems="flexEnd" responsive={false}>
            <EuiFlexItem grow={false} style={{ minWidth: 220 }}>
              <EuiFormRow
                label={i18n.translate('observability.alerting.promQueryBuilder.conditionLabel', {
                  defaultMessage: 'Condition',
                })}
                display="rowCompressed"
              >
                <EuiSelect
                  options={CONDITION_OP_OPTIONS}
                  value={conditionOp}
                  onChange={(e) => setConditionOp(e.target.value as ConditionOp)}
                  compressed
                  data-test-subj="promBuilderConditionOp"
                  aria-label={i18n.translate(
                    'observability.alerting.promQueryBuilder.conditionAriaLabel',
                    { defaultMessage: 'Alert condition' }
                  )}
                />
              </EuiFormRow>
            </EuiFlexItem>
            {conditionOp !== 'none' && (
              <EuiFlexItem grow={false} style={{ width: 140 }}>
                <EuiFormRow
                  label={
                    showRange
                      ? i18n.translate('observability.alerting.promQueryBuilder.rangeLowLabel', {
                          defaultMessage: 'From',
                        })
                      : i18n.translate('observability.alerting.promQueryBuilder.thresholdLabel', {
                          defaultMessage: 'Value',
                        })
                  }
                  display="rowCompressed"
                >
                  <EuiFieldNumber
                    value={thresholdA}
                    onChange={(e) => setThresholdA(e.target.value)}
                    compressed
                    data-test-subj="promBuilderThresholdA"
                    aria-label={i18n.translate(
                      'observability.alerting.promQueryBuilder.thresholdAAriaLabel',
                      { defaultMessage: 'Threshold value' }
                    )}
                  />
                </EuiFormRow>
              </EuiFlexItem>
            )}
            {showRange && (
              <EuiFlexItem grow={false} style={{ width: 140 }}>
                <EuiFormRow
                  label={i18n.translate('observability.alerting.promQueryBuilder.rangeHighLabel', {
                    defaultMessage: 'To',
                  })}
                  display="rowCompressed"
                >
                  <EuiFieldNumber
                    value={thresholdB}
                    onChange={(e) => setThresholdB(e.target.value)}
                    compressed
                    data-test-subj="promBuilderThresholdB"
                    aria-label={i18n.translate(
                      'observability.alerting.promQueryBuilder.thresholdBAriaLabel',
                      { defaultMessage: 'Upper threshold value' }
                    )}
                  />
                </EuiFormRow>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </>
      )}

      <EuiSpacer size="m" />
      {selectedMetric.length === 0 ? (
        <EuiText size="xs" color="subdued">
          {i18n.translate('observability.alerting.promQueryBuilder.helpText', {
            defaultMessage: 'Select a metric to start.',
          })}
        </EuiText>
      ) : (
        <>
          {/* Live composed expression — the single source of truth the Code
            editor also shows, so switching modes never surprises the user.
            Inline EuiCode (not a block) keeps it one text node, and Code mode
            already exposes the same string for copy/edit. */}
          <EuiFormLabel>
            {i18n.translate('observability.alerting.promQueryBuilder.expressionLabel', {
              defaultMessage: 'Expression',
            })}
          </EuiFormLabel>
          <EuiSpacer size="xs" />
          <EuiCode data-test-subj="promBuilderExpression">{buildExpr(currentState())}</EuiCode>
          {conditionOp === 'none' && (
            <>
              <EuiSpacer size="xs" />
              <EuiText size="xs" color="subdued">
                {i18n.translate('observability.alerting.promQueryBuilder.noConditionHint', {
                  defaultMessage:
                    'No condition set — this alert fires whenever the series exists. Add a condition to make it conditional.',
                })}
              </EuiText>
            </>
          )}
        </>
      )}
    </>
  );
};

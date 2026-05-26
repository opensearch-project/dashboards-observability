/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Error-budget-remaining chart.
 *
 * Area chart of `errorBudgetRemaining(t) = 1 - errorRatio(t) / (1 - target)`
 * over the SLO's rolling window. When the chart line crosses below the first
 * budget-warning threshold an operator should treat this SLO as "at risk";
 * when it hits zero the SLO has exhausted its budget and the fill turns
 * danger-red — Jay's review check for "budget-at-zero must visually scream".
 *
 * Data comes from the same inline PromQL the burn-rate panel uses
 * (buildErrorRatioExprForWindow) so the chart lights up immediately even
 * before the recording rules have evaluated. Math is pushed into the PromQL
 * expression (subtract from 1, divide by errorBudget) rather than done in
 * JS — ECharts then sees a pre-shaped series without an extra transform step.
 */

import React, { useMemo } from 'react';
import { EuiCallOut, EuiIcon, EuiPanel, EuiSpacer, EuiText } from '@elastic/eui';
import * as echarts from 'echarts';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { i18n } from '@osd/i18n';
import { EchartsRender } from '../../../alerting/echarts_render';
import { usePromQLChartData } from '../../shared/hooks/use_promql_chart_data';
import { TimeRange } from '../../common/types/service_types';
import type {
  BudgetWarningThreshold,
  Objective,
  SloDocument,
} from '../../../../../common/slo/slo_types';
import { buildCoverageProbeQuery, buildErrorRatioExprForWindow } from './slo_query_builders';
import { formatPct } from '../../../../../common/slo/format';

export interface SloBudgetRemainingChartProps {
  slo: SloDocument;
  objective: Objective;
  prometheusConnectionId: string;
  timeRange: TimeRange;
  refreshTrigger: number;
}

/**
 * Construct a PromQL expression for `((1 - target) - errorRatio(t)) / (1 - target)`,
 * which maps [budget exhausted, full budget] to [0, 1]. Values below 0 mean the
 * SLO is in breach; the chart's yAxis expands its floor dynamically to show the
 * real dip so the chart agrees with the "Budget remaining" headline stat.
 */
function buildBudgetRemainingExpr(
  slo: SloDocument,
  objective: Objective,
  window: string
): string | null {
  const errorRatioExpr = buildErrorRatioExprForWindow(slo, objective, window);
  if (!errorRatioExpr) return null;
  const errorBudget = 1 - objective.target;
  if (errorBudget <= 0) return null;
  // PromQL: ((1 - target) - errorRatio) / (1 - target)
  // Returned unclamped — the headline stat on the budget panel shows the true
  // deep-breach number (e.g. -1900%), and clamping here used to leave the chart
  // pinned at -50% while the panel screamed -1900%, which looked like a bug.
  // The yAxis now autoscales its floor from the data, so extreme dips render
  // truthfully without collapsing the rest of the chart.
  return `(${errorBudget} - (${errorRatioExpr})) / ${errorBudget}`;
}

export interface BudgetRemainingOptionInputs {
  seriesName: string;
  data: Array<[number, number]>;
  warningThreshold?: BudgetWarningThreshold;
  atZero: boolean;
}

/**
 * Exported separately so the unit test can assert on the ECharts spec shape
 * without rendering into jsdom. Keep in sync with the inline render below.
 */
export function buildBudgetRemainingOption(
  inputs: BudgetRemainingOptionInputs
): echarts.EChartsOption {
  const { seriesName, data, warningThreshold, atZero } = inputs;
  const fillColor = atZero ? euiThemeVars.euiColorDanger : euiThemeVars.euiColorSuccess;
  const fillRgba = atZero ? 'rgba(189, 39, 30, 0.35)' : 'rgba(84, 179, 153, 0.25)';

  const markLines: Array<Record<string, unknown>> = [
    {
      yAxis: 0,
      lineStyle: { color: euiThemeVars.euiColorDanger, type: 'solid', width: 1 },
      label: {
        formatter: i18n.translate('observability.apm.slo.budgetRemainingChart.exhaustedMarkLabel', {
          defaultMessage: 'exhausted',
        }),
        position: 'insideStartTop',
        color: euiThemeVars.euiColorDanger,
        fontSize: 10,
      },
    },
  ];
  if (warningThreshold) {
    markLines.push({
      yAxis: warningThreshold.threshold,
      lineStyle: {
        color: euiThemeVars.euiColorWarning,
        type: 'dashed',
        width: 1,
      },
      label: {
        formatter: `${warningThreshold.severity} @ ${formatPct(warningThreshold.threshold)}`,
        // Pin the warning label to the end so it doesn't collide with the
        // "exhausted" label in deep-breach renders where the axis is stretched
        // downward and both markLines sit near the chart's top edge.
        position: 'insideEndTop',
        color: euiThemeVars.euiColorWarningText,
        fontSize: 10,
      },
    });
  }

  return {
    grid: { left: 50, right: 20, top: 24, bottom: 30, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const list = params as Array<{ axisValue: number; value: [number, number] }>;
        if (!list || list.length === 0) return '';
        const p = list[0];
        const ts = new Date(p.axisValue).toLocaleString();
        const v = Array.isArray(p.value) ? p.value[1] : (p.value as number);
        return `${ts}<br/><strong>${formatPct(v)}</strong> remaining`;
      },
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: euiThemeVars.euiColorLightShade } },
      axisLabel: { color: euiThemeVars.euiColorDarkShade, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      // Healthy series (min >= 0) pin the floor at 0 so the "exhausted" markLine
      // acts as the axis baseline; rendering a -10% gutter on a flat 100% line
      // reads as a phantom breach region. Only drop below zero when the series
      // actually breaches — in that case, keep -0.1 headroom so shallow dips are
      // legible and honour deeper values (PromQL clamps at -0.5) when present.
      min: (value: { min: number; max: number }) => {
        if (!Number.isFinite(value.min)) return -0.1;
        if (value.min >= 0) return 0;
        return Math.min(-0.1, value.min);
      },
      max: 1,
      axisLabel: {
        color: euiThemeVars.euiColorDarkShade,
        fontSize: 11,
        formatter: (value: number) => formatPct(value),
      },
      splitLine: {
        lineStyle: { color: euiThemeVars.euiColorLightestShade, type: 'dashed' },
      },
    },
    series: [
      {
        name: seriesName,
        type: 'line',
        data,
        smooth: false,
        symbol: 'none',
        lineStyle: { color: fillColor, width: 2 },
        itemStyle: { color: fillColor },
        areaStyle: { color: fillRgba },
        markLine: {
          silent: true,
          symbol: 'none',
          data: markLines,
        },
      },
    ],
  };
}

export const SloBudgetRemainingChart: React.FC<SloBudgetRemainingChartProps> = ({
  slo,
  objective,
  prometheusConnectionId,
  timeRange,
  refreshTrigger,
}) => {
  const window = slo.spec.window.type === 'rolling' ? slo.spec.window.duration : '30d';
  const query = useMemo(() => buildBudgetRemainingExpr(slo, objective, window), [
    slo,
    objective,
    window,
  ]);

  // The first budget-warning threshold drives the "at risk" line. Sort
  // descending so a list like [0.25, 0.5, 0.1] still surfaces the most
  // generous guardrail first — users configure thresholds by risk, not order.
  const warningThreshold = useMemo(() => {
    const list = slo.spec.budgetWarningThresholds ?? [];
    if (list.length === 0) return undefined;
    return [...list].sort((a, b) => b.threshold - a.threshold)[0];
  }, [slo.spec.budgetWarningThresholds]);

  const { series, isLoading, error } = usePromQLChartData({
    promqlQuery: query ?? '',
    timeRange,
    prometheusConnectionId,
    refreshTrigger,
    enabled: Boolean(query),
  });

  // Coverage probe — fires alongside the main query so that when the chart is
  // empty we can say *why*. A hit here with no chart data means the metric
  // exists but the current window has no samples (wait/widen-range story). A
  // miss here means the SLI's source metric is absent from the datasource
  // entirely (permanent misconfig — typing out "waiting for data" would lie).
  const probeQuery = useMemo(() => buildCoverageProbeQuery(slo, objective), [slo, objective]);
  const { series: probeSeries, isLoading: probeLoading } = usePromQLChartData({
    promqlQuery: probeQuery ?? '',
    timeRange,
    prometheusConnectionId,
    refreshTrigger,
    enabled: Boolean(probeQuery),
  });

  // All hooks must be called before the early return — the spec is derived
  // from the fetched series so it's cheap when query is null (empty data).
  const data: Array<[number, number]> = (series[0]?.data ?? []).map((d) => [d.timestamp, d.value]);
  const latest = data.length > 0 ? data[data.length - 1][1] : null;
  const atZero = latest !== null && latest <= 0;
  const hasData = !isLoading && !error && data.length > 0;
  const metricExists = probeSeries.some((s) => s.data.length > 0);

  const spec = useMemo(
    () =>
      buildBudgetRemainingOption({
        seriesName: objective.displayName ?? objective.name,
        data,
        warningThreshold,
        atZero,
      }),
    [objective.displayName, objective.name, data, warningThreshold, atZero]
  );

  if (!query) {
    return (
      <EuiPanel data-test-subj="slosBudgetRemainingChart">
        <EuiText size="m">
          <h4>
            {i18n.translate('observability.apm.slo.budgetRemainingChart.heading', {
              defaultMessage: 'Error budget remaining',
            })}
          </h4>
        </EuiText>
        <EuiSpacer size="s" />
        <EuiCallOut
          size="s"
          color="warning"
          iconType="iInCircle"
          title={i18n.translate('observability.apm.slo.budgetRemainingChart.unavailable.title', {
            defaultMessage: 'Budget chart unavailable',
          })}
        >
          <EuiText size="s">
            {i18n.translate('observability.apm.slo.budgetRemainingChart.unavailable.body', {
              defaultMessage:
                'The SLI is missing the metric or custom expression required to compute the budget.',
            })}
          </EuiText>
        </EuiCallOut>
      </EuiPanel>
    );
  }

  return (
    <EuiPanel data-test-subj="slosBudgetRemainingChart">
      <EuiText size="m">
        <h4>
          {i18n.translate('observability.apm.slo.budgetRemainingChart.heading', {
            defaultMessage: 'Error budget remaining',
          })}
        </h4>
      </EuiText>
      <EuiText size="xs" color="subdued">
        {i18n.translate('observability.apm.slo.budgetRemainingChart.description', {
          defaultMessage:
            'Fraction of the {window} error budget still available. Starts at 100% and trends toward 0 as bad events accumulate. Crossing the warning threshold means an escalation is close.',
          values: { window },
        })}
      </EuiText>
      <EuiSpacer size="s" />
      {error && (
        <EuiCallOut
          size="s"
          color="danger"
          iconType="alert"
          title={i18n.translate('observability.apm.slo.budgetRemainingChart.error.title', {
            defaultMessage: 'Failed to load budget series',
          })}
          data-test-subj="slosBudgetRemainingError"
        >
          <EuiText size="s">{error.message}</EuiText>
        </EuiCallOut>
      )}
      {!error && !isLoading && !hasData && !probeLoading && !metricExists && (
        <EuiCallOut
          size="s"
          color="warning"
          iconType="alert"
          title={i18n.translate('observability.apm.slo.budgetRemainingChart.missingMetric.title', {
            defaultMessage: 'SLI source metric not found in this datasource',
          })}
          data-test-subj="slosBudgetRemainingMissingMetric"
        >
          <EuiText size="s">
            {i18n.translate('observability.apm.slo.budgetRemainingChart.missingMetric.bodyPrefix', {
              defaultMessage: 'No samples exist for the metric this SLI queries on',
            })}
            <strong> {prometheusConnectionId}</strong>
            {i18n.translate('observability.apm.slo.budgetRemainingChart.missingMetric.bodySuffix', {
              defaultMessage:
                ". This usually means the SLI was configured against a metric name or label set that the datasource has never scraped — waiting won't populate the chart. Check the SLI's metric / selectors, or point the SLO at a datasource that has them.",
            })}
          </EuiText>
        </EuiCallOut>
      )}
      {!error && !isLoading && !hasData && !probeLoading && metricExists && (
        <EuiCallOut
          size="s"
          color="primary"
          iconType="iInCircle"
          title={i18n.translate('observability.apm.slo.budgetRemainingChart.emptyRange.title', {
            defaultMessage: 'No samples in the selected time range',
          })}
          data-test-subj="slosBudgetRemainingEmpty"
        >
          <EuiText size="s">
            {i18n.translate('observability.apm.slo.budgetRemainingChart.emptyRange.body', {
              defaultMessage:
                'The metric exists in this datasource but the current range has no data. Widen the time range, or wait for the next Prometheus scrape + rule evaluation.',
            })}
          </EuiText>
        </EuiCallOut>
      )}
      {hasData && <EchartsRender spec={spec} height={220} />}
      {hasData && atZero && (
        <>
          <EuiSpacer size="xs" />
          <EuiText size="xs" color="danger" data-test-subj="slosBudgetRemainingExhausted">
            <EuiIcon type="alert" size="s" />{' '}
            {i18n.translate('observability.apm.slo.budgetRemainingChart.exhaustedNote', {
              defaultMessage:
                'Budget exhausted — any further bad events push the SLO further into breach.',
            })}
          </EuiText>
        </>
      )}
    </EuiPanel>
  );
};

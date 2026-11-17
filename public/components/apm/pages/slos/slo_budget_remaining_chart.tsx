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
import moment from 'moment-timezone';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { i18n } from '@osd/i18n';
import { EchartsRender } from '../../../alerting/echarts_render';
import { usePromQLChartData } from '../../shared/hooks/use_promql_chart_data';
import { TimeRange } from '../../common/types/service_types';
import type {
  BudgetWarningThreshold,
  CalendarWindow,
  Objective,
  SloDocument,
  Window,
} from '../../../../../common/slo/slo_types';
import { buildCoverageProbeQuery, buildErrorRatioExprForWindow } from './slo_query_builders';
import { formatPct, SLO_PRECISION } from '../../../../../common/slo/format';
import { uiSettingsService } from '../../../../../common/utils';

/**
 * Escape values interpolated into the ECharts tooltip HTML. The tooltip
 * `formatter` returns a raw HTML string, so any dynamic value (timestamp,
 * formatted percentages, delta) must be escaped to prevent HTML injection
 * should an upstream value ever contain angle brackets or quotes.
 */
const escapeHtml = (s: string): string =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );

/**
 * Prometheus range-duration equivalents for each calendar period. Calendar
 * windows aren't backed by recording rules yet, so the inline chart approximates
 * the period with a rolling range of equal length. Deriving the duration from
 * the spec (rather than hardcoding "30d") keeps the chart's copy honest: a
 * calendar-week SLO no longer claims to cover a rolling 30-day window.
 */
const CALENDAR_PERIOD_DURATIONS: Record<CalendarWindow['period'], string> = {
  week: '7d',
  month: '30d',
  quarter: '90d',
};

/** Resolve the PromQL range duration the chart should query for this window. */
export function deriveWindowDuration(window: Window): string {
  return window.type === 'rolling' ? window.duration : CALENDAR_PERIOD_DURATIONS[window.period];
}

/**
 * Resolve the timezone the user configured via `dateFormat:tz`, falling back to
 * the browser zone. Mirrors the alerts dashboard's helper (kept local so this
 * file owns its own copy rather than reaching across the plugin).
 */
function resolveDisplayTz(): string {
  const tz = uiSettingsService.get('dateFormat:tz');
  if (!tz || tz === 'Browser') {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return tz;
}

/** Format an epoch-ms tooltip timestamp with an explicit timezone abbreviation. */
function formatTooltipTs(ms: number, tz: string): string {
  return moment.tz(ms, tz).format('YYYY-MM-DD HH:mm z');
}

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
  /** Timezone for tooltip timestamps. Defaults to the user's `dateFormat:tz`. */
  tz?: string;
}

/**
 * Exported separately so the unit test can assert on the ECharts spec shape
 * without rendering into jsdom. Keep in sync with the inline render below.
 */
export function buildBudgetRemainingOption(
  inputs: BudgetRemainingOptionInputs
): echarts.EChartsOption {
  const { seriesName, data, warningThreshold, atZero } = inputs;
  const tz = inputs.tz ?? resolveDisplayTz();
  const fillColor = atZero ? euiThemeVars.euiColorDanger : euiThemeVars.euiColorSuccess;
  const fillRgba = atZero ? 'rgba(189, 39, 30, 0.35)' : 'rgba(84, 179, 153, 0.25)';
  // WCAG 1.4.1: don't rely on hue alone to distinguish a breached (at-zero)
  // series from a healthy one. A dashed stroke + visible markers give a
  // redundant, color-independent cue for the danger state.
  const lineType = atZero ? 'dashed' : 'solid';
  const symbol = atZero ? 'triangle' : 'none';

  const markLines: Array<Record<string, unknown>> = [
    {
      yAxis: 0,
      // Dashed so this threshold annotation reads as a reference line, not as
      // plotted data.
      lineStyle: { color: euiThemeVars.euiColorDanger, type: 'dashed', width: 1 },
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
        formatter: `${warningThreshold.severity} @ ${formatPct(warningThreshold.threshold, {
          decimals: SLO_PRECISION.budget,
        })}`,
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
        const ts = formatTooltipTs(p.axisValue, tz);
        const v = Array.isArray(p.value) ? p.value[1] : (p.value as number);
        const remainingLabel = i18n.translate(
          'observability.apm.slo.budgetRemainingChart.tooltip.remaining',
          { defaultMessage: 'remaining' }
        );
        // Delta versus the warning threshold: positive = headroom left before
        // escalation, negative = already past the guardrail.
        let deltaLine = '';
        if (warningThreshold && Number.isFinite(v)) {
          const delta = v - warningThreshold.threshold;
          const sign = delta >= 0 ? '+' : '';
          deltaLine = `<br/>${escapeHtml(
            i18n.translate('observability.apm.slo.budgetRemainingChart.tooltip.deltaVsThreshold', {
              defaultMessage: '{delta} vs warning threshold',
              values: { delta: `${sign}${formatPct(delta, { decimals: SLO_PRECISION.budget })}` },
            })
          )}`;
        }
        return `${escapeHtml(ts)}<br/><strong>${escapeHtml(
          formatPct(v, { decimals: SLO_PRECISION.budget })
        )}</strong> ${escapeHtml(remainingLabel)}${deltaLine}`;
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
        formatter: (value: number) => formatPct(value, { decimals: SLO_PRECISION.budget }),
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
        // Redundant non-color cues for the breached state (see lineType/symbol).
        symbol,
        symbolSize: 5,
        showSymbol: atZero,
        lineStyle: { color: fillColor, width: 2, type: lineType },
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
  // Derive the actual PromQL range from the spec's window. Rolling windows use
  // their configured duration; calendar windows approximate their period with a
  // rolling range of equal length (recording rules for calendar windows aren't
  // wired up yet). Never hardcode "30d" — that mislabeled every calendar SLO.
  const window = useMemo(() => deriveWindowDuration(slo.spec.window), [slo.spec.window]);
  const query = useMemo(
    () => buildBudgetRemainingExpr(slo, objective, window),
    [slo, objective, window]
  );

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
        {slo.spec.window.type === 'calendar'
          ? i18n.translate('observability.apm.slo.budgetRemainingChart.description.calendar', {
              defaultMessage:
                'Fraction of the calendar-{period} error budget still available (approximated over a rolling {window} range until calendar recording rules land). Starts at 100% and trends toward 0 as bad events accumulate. Crossing the warning threshold means an escalation is close.',
              values: { period: slo.spec.window.period, window },
            })
          : i18n.translate('observability.apm.slo.budgetRemainingChart.description', {
              defaultMessage:
                'Fraction of the rolling {window} error budget still available. Starts at 100% and trends toward 0 as bad events accumulate. Crossing the warning threshold means an escalation is close.',
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

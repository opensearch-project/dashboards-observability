/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Burn-rate-per-tier chart.
 *
 * Overlaid line chart showing `burnRate(t) = errorRatio(t, longWindow) / (1 - target)`
 * for each MWMBR tier the user configured. A horizontal markLine per tier shows
 * that tier's `burnRateMultiplier` threshold, annotated with the tier's
 * severity — Jay's chart-conventions review check.
 *
 * The alerting rule fires when burn > threshold AND sustained for `forDuration`;
 * this chart shows the "about to page me?" trajectory.
 *
 * Hook-count discipline: each tier renders its own child component (TierFetcher)
 * so the number of hooks per component stays fixed across renders. If the
 * user later edits the spec to add/remove tiers, the child list mounts/
 * unmounts cleanly instead of violating rules-of-hooks via in-map hooks.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { EuiCallOut, EuiPanel, EuiSpacer, EuiText } from '@elastic/eui';
import * as echarts from 'echarts';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { i18n } from '@osd/i18n';
import { EchartsRender } from '../../../alerting/echarts_render';
import { usePromQLChartData } from '../../shared/hooks/use_promql_chart_data';
import { TimeRange } from '../../common/types/service_types';
import { CHART_COLORS } from '../../common/constants';
import type { BurnRateConfig, Objective, SloDocument } from '../../../../../common/slo/slo_types';
import { buildCoverageProbeQuery, buildErrorRatioExprForWindow } from './slo_query_builders';

export interface SloBurnRateChartProps {
  slo: SloDocument;
  objective: Objective;
  prometheusConnectionId: string;
  timeRange: TimeRange;
  refreshTrigger: number;
}

/** Friendly labels for the four default MWMBR tiers, in index order. */
const TIER_LABELS = [
  i18n.translate('observability.apm.slo.burnRateChart.tier.pageQuick', {
    defaultMessage: 'Page · Quick',
  }),
  i18n.translate('observability.apm.slo.burnRateChart.tier.pageSlow', {
    defaultMessage: 'Page · Slow',
  }),
  i18n.translate('observability.apm.slo.burnRateChart.tier.ticketQuick', {
    defaultMessage: 'Ticket · Quick',
  }),
  i18n.translate('observability.apm.slo.burnRateChart.tier.ticketSlow', {
    defaultMessage: 'Ticket · Slow',
  }),
] as const;

function formatMultiplier(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}x` : `${rounded.toFixed(1)}x`;
}

export interface BurnRateOptionInputs {
  tiers: Array<{
    label: string;
    severity: string;
    multiplier: number;
    color: string;
    data: Array<[number, number]>;
  }>;
}

/**
 * Exported separately so unit tests can assert on the ECharts spec shape
 * without rendering into jsdom. Keep in sync with the render below.
 */
export function buildBurnRateOption(inputs: BurnRateOptionInputs): echarts.EChartsOption {
  const { tiers } = inputs;

  // Y-axis is log10: default MWMBR tiers span 14.4x / 6x / 3x / 1x, and a linear
  // axis dominated by the top tier crushes the 1x / 3x lines (and any <10x burn
  // activity) into an unreadable sliver near zero. Log keeps all tiers legible
  // across the decades of burn that actually show up in production.
  //
  // Log axes can't represent zero, so we pick a display floor of 0.1x — burn
  // rates below that are operationally "quiet" and live at the axis bottom
  // instead of breaking the line. Sample floor-substitution happens in the
  // series mapping below; the tooltip reads from a parallel raw value so a
  // flat-zero point still shows "0x" on hover instead of "0.1x".
  const seriesMax = tiers.reduce((acc, t) => {
    for (const [, v] of t.data) {
      if (Number.isFinite(v) && v > acc) acc = v;
    }
    return acc;
  }, 0);
  const thresholdMax = tiers.reduce((acc, t) => (t.multiplier > acc ? t.multiplier : acc), 0);
  const yMaxCandidate = Math.max(seriesMax, thresholdMax);
  // Snap yMax up to the next power of 10 above the padded anchor so the top
  // threshold markLine sits clear of the grid border and the decade tick
  // labels ECharts picks (0.1x, 1x, 10x, 100x) don't render half-visible.
  const yMaxRaw = yMaxCandidate > 0 ? yMaxCandidate * 1.25 : 1;
  const yMax = Math.pow(10, Math.ceil(Math.log10(yMaxRaw)));
  const Y_AXIS_FLOOR = 0.1;
  return {
    // No legend — each tier's threshold markLine is already labeled with
    // `<severity> @ <multiplier>x` inline, which is what operators actually
    // read. The separate legend row duplicated that information and
    // crowded the time-axis labels at the bottom of the chart.
    grid: { left: 50, right: 20, top: 24, bottom: 32, containLabel: true },
    legend: { show: false },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const list = params as Array<{
          axisValue: number;
          // Points carry a third element [ts, plotted, raw] so the tooltip
          // can show the original value even when the plotted coordinate was
          // floored up to Y_AXIS_FLOOR for log-axis visibility.
          value: [number, number, number];
          seriesName: string;
          color: string;
        }>;
        if (!list || list.length === 0) return '';
        const ts = new Date(list[0].axisValue).toLocaleString();
        const rows = list
          .map((p) => {
            const raw = Array.isArray(p.value) ? p.value[2] ?? p.value[1] : (p.value as number);
            const swatch = `<span style="display:inline-block;width:10px;height:10px;background:${p.color};margin-right:6px;border-radius:2px;"></span>`;
            return `<div>${swatch}${p.seriesName}: <strong>${formatMultiplier(raw)}</strong></div>`;
          })
          .join('');
        return `<div>${ts}</div>${rows}`;
      },
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: euiThemeVars.euiColorLightShade } },
      axisLabel: { color: euiThemeVars.euiColorDarkShade, fontSize: 11 },
    },
    yAxis: {
      type: 'log',
      logBase: 10,
      name: i18n.translate('observability.apm.slo.burnRateChart.yAxisName', {
        defaultMessage: 'burn rate',
      }),
      nameGap: 25,
      nameTextStyle: { color: euiThemeVars.euiColorDarkShade, fontSize: 11 },
      min: Y_AXIS_FLOOR,
      max: yMax,
      axisLabel: {
        color: euiThemeVars.euiColorDarkShade,
        fontSize: 11,
        formatter: (v: number) => formatMultiplier(v),
      },
      splitLine: {
        lineStyle: { color: euiThemeVars.euiColorLightestShade, type: 'dashed' },
      },
    },
    series: tiers.map((t) => ({
      name: t.label,
      type: 'line',
      // Floor each sample at Y_AXIS_FLOOR so the log axis doesn't drop points
      // where burn = 0. Tooltip reads the raw value from index [2] so a genuine
      // zero still shows "0x" on hover.
      data: t.data.map(([ts, v]) => {
        const plotted = Number.isFinite(v) && v > Y_AXIS_FLOOR ? v : Y_AXIS_FLOOR;
        return [ts, plotted, v];
      }),
      smooth: false,
      symbol: 'none',
      lineStyle: { color: t.color, width: 2 },
      itemStyle: { color: t.color },
      // Each tier owns its own threshold markLine so the line + threshold
      // share a color — makes 4 overlaid tiers legible without a separate
      // legend entry per threshold.
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: t.color, type: 'dashed', width: 1 },
        label: {
          formatter: `${t.severity} @ ${formatMultiplier(t.multiplier)}`,
          // Always anchor to the right edge. The previous alternating
          // `insideStartTop` placed odd-indexed labels flush against the
          // y-axis gutter, where they overprinted the axis tick label at
          // the same y-coordinate (e.g. `critical @ 14.4x` landed on the
          // `15x` tick). The right edge has no axis labels, and different
          // tiers occupy different y-values so these threshold labels
          // don't stack on each other.
          position: 'insideEndTop',
          // Nudge the label up a pixel so it doesn't kiss the dashed line
          // it belongs to.
          distance: [0, 2],
          color: t.color,
          fontSize: 10,
          // Opaque panel-colored chip so the label over-writes any grid
          // split-line or neighboring series point it happens to land on,
          // instead of letting the line bleed through the glyph strokes.
          backgroundColor: '#FFFFFF',
          padding: [1, 4],
        },
        data: [{ yAxis: t.multiplier }],
      },
    })),
  };
}

export interface TierSeriesData {
  data: Array<[number, number]>;
  isLoading: boolean;
  error: Error | null;
}

/**
 * One tier fetch. Mounts once per tier and calls its hooks exactly once
 * per render — the parent uses a `Map<index, TierSeriesData>` so adding
 * or removing tiers doesn't shuffle hooks between component instances.
 *
 * Reports data up via an `onChange` callback rather than lifting refs
 * so the parent stays a pure function of state.
 */
interface TierFetcherProps {
  index: number;
  tier: BurnRateConfig;
  slo: SloDocument;
  objective: Objective;
  prometheusConnectionId: string;
  timeRange: TimeRange;
  refreshTrigger: number;
  errorBudget: number;
  onChange: (index: number, result: TierSeriesData) => void;
}

const TierFetcher: React.FC<TierFetcherProps> = ({
  index,
  tier,
  slo,
  objective,
  prometheusConnectionId,
  timeRange,
  refreshTrigger,
  errorBudget,
  onChange,
}) => {
  const query = useMemo(() => buildErrorRatioExprForWindow(slo, objective, tier.longWindow), [
    slo,
    objective,
    tier.longWindow,
  ]);
  const { series, isLoading, error } = usePromQLChartData({
    promqlQuery: query ?? '',
    timeRange,
    prometheusConnectionId,
    refreshTrigger,
    enabled: Boolean(query),
  });

  const result: TierSeriesData = useMemo(() => {
    if (errorBudget <= 0) return { data: [], isLoading, error };
    const points = series[0]?.data ?? [];
    return {
      data: points.map((p) => [p.timestamp, p.value / errorBudget] as [number, number]),
      isLoading,
      error,
    };
  }, [series, errorBudget, isLoading, error]);

  React.useEffect(() => {
    onChange(index, result);
  }, [index, result, onChange]);

  return null;
};

export const SloBurnRateChart: React.FC<SloBurnRateChartProps> = ({
  slo,
  objective,
  prometheusConnectionId,
  timeRange,
  refreshTrigger,
}) => {
  const tiers = slo.spec.alerting.strategy === 'mwmbr' ? slo.spec.alerting.burnRates : [];
  const errorBudget = 1 - objective.target;

  // Cap at 4 tiers. Chart-density guidance: "if >3, stack or use the legend
  // pattern" — overlay-with-legend reads cleanly up to 4. Surface the
  // overflow count rather than silently dropping tiers.
  const visible = tiers.slice(0, 4);
  const overflow = tiers.length - visible.length;

  const [seriesByIndex, setSeriesByIndex] = useState<Record<number, TierSeriesData>>({});
  const onTierChange = useCallback((index: number, result: TierSeriesData) => {
    setSeriesByIndex((prev) => ({ ...prev, [index]: result }));
  }, []);

  const tierResults = visible.map((tier, idx) => {
    const entry = seriesByIndex[idx];
    return {
      tier,
      color: CHART_COLORS[idx % CHART_COLORS.length],
      data: entry?.data ?? [],
      isLoading: entry?.isLoading ?? false,
      error: entry?.error ?? null,
    };
  });

  const isLoading = tierResults.some((r) => r.isLoading);
  const hasData = tierResults.some((r) => r.data.length > 0);
  const firstError = tierResults.find((r) => r.error)?.error ?? null;

  // Coverage probe — one shared fetch per chart mount. See slo_budget_remaining_chart.tsx
  // for the rationale behind distinguishing "metric missing" vs "window empty".
  const probeQuery = useMemo(() => buildCoverageProbeQuery(slo, objective), [slo, objective]);
  const { series: probeSeries, isLoading: probeLoading } = usePromQLChartData({
    promqlQuery: probeQuery ?? '',
    timeRange,
    prometheusConnectionId,
    refreshTrigger,
    enabled: Boolean(probeQuery),
  });
  const metricExists = probeSeries.some((s) => s.data.length > 0);

  const spec = useMemo(
    () =>
      buildBurnRateOption({
        tiers: tierResults.map((r, idx) => ({
          label:
            TIER_LABELS[idx] ??
            i18n.translate('observability.apm.slo.burnRateChart.tierFallback', {
              defaultMessage: 'Tier {index}',
              values: { index: idx + 1 },
            }),
          severity: r.tier.severity,
          multiplier: r.tier.burnRateMultiplier,
          color: r.color,
          data: r.data,
        })),
      }),
    [tierResults]
  );

  return (
    <EuiPanel data-test-subj="slosBurnRateChart">
      <EuiText size="m">
        <h4>
          {i18n.translate('observability.apm.slo.burnRateChart.heading', {
            defaultMessage: 'Burn rate by tier',
          })}
        </h4>
      </EuiText>
      <EuiText size="xs" color="subdued">
        {i18n.translate('observability.apm.slo.burnRateChart.descriptionPrefix', {
          defaultMessage:
            "Each tier's long-window burn rate plotted against its threshold. An alert fires when the line stays above the dashed threshold for the tier's ",
        })}
        <code>for</code>
        {i18n.translate('observability.apm.slo.burnRateChart.descriptionSuffix', {
          defaultMessage: ' duration.',
        })}
      </EuiText>
      <EuiSpacer size="s" />

      {visible.map((tier, idx) => (
        <TierFetcher
          key={`${tier.shortWindow}-${tier.longWindow}-${tier.severity}`}
          index={idx}
          tier={tier}
          slo={slo}
          objective={objective}
          prometheusConnectionId={prometheusConnectionId}
          timeRange={timeRange}
          refreshTrigger={refreshTrigger}
          errorBudget={errorBudget}
          onChange={onTierChange}
        />
      ))}

      {tiers.length === 0 && (
        <EuiCallOut
          size="s"
          color="warning"
          iconType="iInCircle"
          title={i18n.translate('observability.apm.slo.burnRateChart.noTiers.title', {
            defaultMessage: 'No burn-rate tiers configured',
          })}
          data-test-subj="slosBurnRateEmptyTiers"
        >
          <EuiText size="s">
            {i18n.translate('observability.apm.slo.burnRateChart.noTiers.body', {
              defaultMessage:
                'Configure MWMBR tiers in the Advanced section of the SLO wizard to populate this chart.',
            })}
          </EuiText>
        </EuiCallOut>
      )}
      {tiers.length > 0 && firstError && (
        <EuiCallOut
          size="s"
          color="danger"
          iconType="alert"
          title={i18n.translate('observability.apm.slo.burnRateChart.error.title', {
            defaultMessage: 'Failed to load burn-rate series',
          })}
          data-test-subj="slosBurnRateError"
        >
          <EuiText size="s">{firstError.message}</EuiText>
        </EuiCallOut>
      )}
      {tiers.length > 0 && !firstError && !isLoading && !hasData && !probeLoading && !metricExists && (
        <EuiCallOut
          size="s"
          color="warning"
          iconType="alert"
          title={i18n.translate('observability.apm.slo.burnRateChart.missingMetric.title', {
            defaultMessage: 'SLI source metric not found in this datasource',
          })}
          data-test-subj="slosBurnRateMissingMetric"
        >
          <EuiText size="s">
            {i18n.translate('observability.apm.slo.burnRateChart.missingMetric.bodyPrefix', {
              defaultMessage: 'No samples exist for the metric this SLI queries on',
            })}
            <strong> {prometheusConnectionId}</strong>
            {i18n.translate('observability.apm.slo.burnRateChart.missingMetric.bodySuffix', {
              defaultMessage:
                ". Burn rate is derived from the same error ratio as the budget chart — if that metric is absent, burn rate can't populate. Waiting won't help; re-check the SLI's metric / selectors.",
            })}
          </EuiText>
        </EuiCallOut>
      )}
      {tiers.length > 0 && !firstError && !isLoading && !hasData && !probeLoading && metricExists && (
        <EuiCallOut
          size="s"
          color="primary"
          iconType="iInCircle"
          title={i18n.translate('observability.apm.slo.burnRateChart.emptyRange.title', {
            defaultMessage: 'No samples in the selected time range',
          })}
          data-test-subj="slosBurnRateEmpty"
        >
          <EuiText size="s">
            {i18n.translate('observability.apm.slo.burnRateChart.emptyRange.body', {
              defaultMessage:
                'The metric exists in this datasource but the current range returned no burn-rate samples. Widen the time range, or wait for the next Prometheus scrape + rule evaluation.',
            })}
          </EuiText>
        </EuiCallOut>
      )}
      {tiers.length > 0 && hasData && <EchartsRender spec={spec} height={260} />}
      {overflow > 0 && (
        <>
          <EuiSpacer size="xs" />
          <EuiText size="xs" color="subdued">
            {i18n.translate('observability.apm.slo.burnRateChart.overflow', {
              defaultMessage:
                '{overflow, plural, one {# additional tier} other {# additional tiers}} hidden for legibility. See the burn-rate alerts panel below for the full matrix.',
              values: { overflow },
            })}
          </EuiText>
        </>
      )}
    </EuiPanel>
  );
};

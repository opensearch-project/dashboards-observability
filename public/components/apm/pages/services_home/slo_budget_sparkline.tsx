/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Aggregate 7d error-ratio sparkline for the Services Home header panel.
 *
 * Plots one line: the mean of every SLO's 3d error-ratio recording rule on
 * the page's datasource, sampled across a fixed 7d window. Trending up =
 * worse. The sparkline is deliberately time-picker-independent — SLO
 * health on this page evaluates against each SLO's own rolling window,
 * and a 7d rolling view gives the operator a "is our SLO posture getting
 * better or worse this week?" read that doesn't change when they zoom
 * the rest of the page.
 *
 * Scope note: ideally the aggregate would average across *this page's
 * service set*. That isn't computable from the current recording rules —
 * fingerprint dedup deliberately strips SLO identity labels from the
 * recording-rule side (service / name / objective live on the alert-
 * rule side instead). So the sparkline shows the datasource-wide aggregate
 * rather than a page-services subset. It still answers "is SLO posture
 * trending?"; a truer per-service aggregate would require relabeling or
 * a join against a label-carrying metric and is out of scope here.
 *
 * Why error ratio and not true budget-remaining? Each SLO has its own
 * target, and the recording rules don't stamp a `slo_target` label today,
 * so a single PromQL expression can't compute a genuine aggregate budget-
 * remaining curve. The ratio (inverted colors) is the most honest signal
 * we can compute without extending the recording-rule surface. Per-SLO
 * budget remaining lives on the detail page (`slo_budget_remaining_chart`).
 *
 * Degradation: missing query (no services, no datasource) or fetch failure
 * renders nothing — the chip row above it doesn't move. A pending fetch
 * reserves the vertical space so the panel doesn't jitter.
 */

import React, { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { EuiFlexGroup, EuiFlexItem, EuiLoadingContent, EuiSpacer, EuiText } from '@elastic/eui';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { i18n } from '@osd/i18n';
import { EchartsRender } from '../../../alerting/echarts_render';
import { usePromQLChartData } from '../../shared/hooks/use_promql_chart_data';
import { formatPct } from '../../../../../common/slo/format';

/** Fixed 7d window. Independent of the page time picker by design. */
const TIME_RANGE = { from: 'now-7d', to: 'now' } as const;

/**
 * 168 points over 7d → 1h step. Keeps the trace smooth enough to read
 * direction without dragging thousands of samples into the bundle.
 */
const RESOLUTION = 168;

/**
 * Compact chart height — keeps the CTA row in the header above the fold.
 * Matches the 60px height used by alerts_charts `StateBreakdown`.
 */
const CHART_HEIGHT = 60;

/**
 * Build the aggregate error-ratio PromQL. Uses the pre-evaluated 3d
 * recording rules so the server doesn't have to compute the ratio on every
 * range-query step. Returns null when the page has no services showing
 * (we still don't render the chart then).
 *
 * The filter is just the `__name__` regex — fingerprint dedup strips SLO
 * identity labels from recording rules, so we can't narrow to this page's
 * service set here; see the module header for the scope note.
 */
export function buildAggregateErrorRatioQuery(services: string[]): string | null {
  if (services.length === 0) return null;
  return `avg by () ({__name__=~"slo:sli_error:ratio_rate_3d:.+"})`;
}

export interface SloBudgetSparklineProps {
  services: string[];
  /** Prometheus datasource id (apm config — same one the SLO panel uses). */
  prometheusConnectionId: string;
}

const t = {
  label: i18n.translate('observability.apm.services.sloBudgetSparkline.label', {
    defaultMessage: 'Aggregate error ratio (7d)',
  }),
  scopeCaption: i18n.translate('observability.apm.services.sloHealth.sparklineScopeCaption', {
    defaultMessage: '7d error-ratio trend across all services in this datasource',
  }),
  tooltipRemaining: (v: number, ts: string) =>
    i18n.translate('observability.apm.services.sloBudgetSparkline.tooltip', {
      defaultMessage: '{ts}: {pct} error ratio',
      values: { ts, pct: formatPct(v) },
    }),
};

function buildOption(data: Array<[number, number]>): EChartsOption {
  return {
    grid: { left: 0, right: 0, top: 2, bottom: 2, containLabel: false },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const list = params as Array<{ axisValue: number; value: [number, number] }>;
        if (!list || list.length === 0) return '';
        const p = list[0];
        const v = Array.isArray(p.value) ? p.value[1] : (p.value as number);
        const ts = new Date(p.axisValue).toLocaleString();
        return t.tooltipRemaining(v, ts);
      },
    },
    xAxis: {
      type: 'time',
      show: false,
    },
    yAxis: {
      type: 'value',
      show: false,
      // Let the floor float so the trace actually uses the vertical band;
      // at this height a fixed [0, 1] axis flattens everything to a
      // horizontal line for healthy SLOs.
      min: (value: { min: number; max: number }) =>
        Number.isFinite(value.min) ? Math.max(0, value.min - 0.001) : 0,
    },
    series: [
      {
        type: 'line',
        data,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: euiThemeVars.euiColorPrimary, width: 1.5 },
        areaStyle: { color: euiThemeVars.euiColorPrimary, opacity: 0.12 },
      },
    ],
  };
}

/**
 * Single render prop: whatever we render, keep the vertical footprint
 * constant so the sibling CTA row doesn't jump when data arrives.
 */
const SparklineShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ minHeight: CHART_HEIGHT + 16 }} data-test-subj="sloBudgetSparkline">
    {children}
  </div>
);

export const SloBudgetSparkline: React.FC<SloBudgetSparklineProps> = ({
  services,
  prometheusConnectionId,
}) => {
  const query = useMemo(() => buildAggregateErrorRatioQuery(services), [services]);

  const { series, isLoading, error } = usePromQLChartData({
    promqlQuery: query ?? '',
    timeRange: TIME_RANGE,
    prometheusConnectionId,
    enabled: Boolean(query) && Boolean(prometheusConnectionId),
    resolution: RESOLUTION,
  });

  const data = useMemo<Array<[number, number]>>(() => {
    const first = series[0];
    if (!first) return [];
    return first.data.map((d) => [d.timestamp, d.value]);
  }, [series]);

  const spec = useMemo(() => buildOption(data), [data]);

  // Nothing to plot: no services, no datasource. Render nothing — don't
  // reserve vertical space either, so the panel collapses back to the
  // chip-row-only shape it had pre-F3.
  if (!query || !prometheusConnectionId) {
    return null;
  }

  // Fetch failures + empty results: silently omit per plan §7 constraint
  // ("Degrade gracefully"). The rollup panel above already surfaces any
  // access / config error; we don't want to double-shout.
  if (error) {
    return null;
  }

  if (isLoading) {
    return (
      <SparklineShell>
        <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              {t.label}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="xs" />
        <EuiLoadingContent lines={2} data-test-subj="sloBudgetSparklineLoading" />
      </SparklineShell>
    );
  }

  if (data.length === 0) {
    return null;
  }

  return (
    <SparklineShell>
      <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {t.label}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EchartsRender spec={spec} height={CHART_HEIGHT} />
      <EuiText size="xs" color="subdued" data-test-subj="sloBudgetSparklineScopeCaption">
        {t.scopeCaption}
      </EuiText>
    </SparklineShell>
  );
};

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sparkline visualization for the monitor-detail flyout's "Condition
 * preview" section. Receives a series of timestamped values from the
 * detail-resolver pipeline; renders an EChart line plot with an optional
 * dashed `threshold` mark line.
 *
 * Falls back to a single-stat card when fewer than 3 points are available
 * (charts with 1-2 points read as random noise rather than a trend).
 *
 * Pulled out of `monitor_detail_flyout.tsx` so the flyout focuses on
 * orchestration; the chart spec is independent and self-contained.
 */
import React, { useMemo } from 'react';
import type { EChartsOption, SeriesOption } from 'echarts';
import { EuiPanel, EuiSpacer, EuiStat, EuiText } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import { EchartsRender } from '../echarts_render';
import { escapeHtml } from '../shared_constants';

export interface ConditionPreviewGraphProps {
  data: Array<{ timestamp: number; value: number }>;
  threshold?: { operator: string; value: number; unit?: string };
}

export const ConditionPreviewGraph: React.FC<ConditionPreviewGraphProps> = ({
  data,
  threshold,
}) => {
  // Handle sparse data: show a stat card instead of a chart for 1-2 data points
  const isSparse = data && data.length > 0 && data.length <= 2;

  const spec = useMemo((): EChartsOption | null => {
    if (!data || data.length === 0 || isSparse) return null;

    const timestamps = data.map((d) =>
      new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    const values = data.map((d) => d.value);

    const series: SeriesOption[] = [
      {
        type: 'line',
        data: values,
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { color: '#006BB4', width: 2 },
        itemStyle: { color: '#006BB4' },
        areaStyle: { color: 'rgba(0, 107, 180, 0.08)' },
      },
    ];

    // Threshold line as a markLine
    if (threshold) {
      (series[0] as Record<string, unknown>).markLine = {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#BD271E', type: 'dashed', width: 1.5 },
        label: {
          formatter: `${threshold.value}${threshold.unit || ''}`,
          position: 'end',
          color: '#BD271E',
          fontSize: 10,
        },
        data: [{ yAxis: threshold.value }],
      };
    }

    return {
      grid: { left: 45, right: 15, top: 15, bottom: 30 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const p = (params as Array<{ axisValue: string; value: number }>)[0];
          // Escape user-derived strings before building tooltip HTML — ECharts
          // renders the formatter's return value verbatim as HTML.
          return `${escapeHtml(String(p.axisValue))}<br/>${escapeHtml(p.value.toFixed(2))}`;
        },
      },
      xAxis: {
        type: 'category',
        data: timestamps,
        axisLine: { lineStyle: { color: '#EDF0F5' } },
        axisLabel: { color: '#98A2B3', fontSize: 9 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#EDF0F5' } },
        axisLabel: { color: '#98A2B3', fontSize: 9 },
      },
      series,
    };
  }, [data, threshold, isSparse]);

  if (!data || data.length === 0)
    return (
      <EuiText size="s" color="subdued">
        <em>
          <FormattedMessage
            id="observability.alerting.monitorDetailFlyout.preview.noData"
            defaultMessage="No recent evaluation data available. The condition preview populates after the monitor executes and records metric data."
          />
        </em>
      </EuiText>
    );

  if (isSparse) {
    const latestPoint = data[data.length - 1];
    const formattedValue = Number.isInteger(latestPoint.value)
      ? String(latestPoint.value)
      : latestPoint.value.toFixed(2);
    return (
      <EuiPanel color="subdued" paddingSize="m">
        <EuiStat
          title={formattedValue}
          description={i18n.translate(
            'observability.alerting.monitorDetailFlyout.preview.latestEvaluatedValue',
            {
              defaultMessage: 'Latest evaluated value',
            }
          )}
          titleSize="l"
        />
        <EuiSpacer size="xs" />
        <EuiText size="xs" color="subdued">
          <em>
            <FormattedMessage
              id="observability.alerting.monitorDetailFlyout.preview.limitedData"
              defaultMessage="Limited evaluation data — showing latest value"
            />
          </em>
        </EuiText>
      </EuiPanel>
    );
  }

  return <EchartsRender spec={spec!} height={180} />;
};

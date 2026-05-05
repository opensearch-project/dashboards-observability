/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alerts Charts — ECharts visualizations for the Alerts dashboard.
 *
 * Currently exposes:
 *  - AlertTimeline: stacked bar chart of alerts over 24h time buckets
 *
 * Other breakdown panels (SeverityDonut, StateBreakdown, AlertsByDatasource,
 * AlertsByMonitor) were removed in a UI cleanup pass — the facet filter panel
 * already surfaces those dimensions and the redundant chart panels were
 * cluttering the dashboard.
 */
import React, { useMemo } from 'react';
import { EuiText } from '@elastic/eui';
import { EchartsRender } from './echarts_render';
import { UnifiedAlertSummary } from '../../../common/types/alerting';

// ============================================================================
// Color map (kept for AlertTimeline severity bars)
// ============================================================================

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#BD271E',
  high: '#F5A700',
  medium: '#006BB4',
  low: '#98A2B3',
  info: '#D3DAE6',
};

// ============================================================================
// AlertTimeline — stacked bar chart by time buckets
// ============================================================================

export const AlertTimeline: React.FC<{ alerts: UnifiedAlertSummary[] }> = ({ alerts }) => {
  const spec = useMemo(() => {
    if (alerts.length === 0) return null;

    const now = Date.now();
    const bucketCount = 12;
    const bucketDuration = (24 * 60 * 60 * 1000) / bucketCount;
    const buckets: Array<{
      label: string;
      critical: number;
      high: number;
      medium: number;
      low: number;
      info: number;
    }> = [];

    for (let i = 0; i < bucketCount; i++) {
      const bucketStart = now - (bucketCount - i) * bucketDuration;
      const bucketEnd = bucketStart + bucketDuration;
      const label = new Date(bucketStart).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const inBucket = alerts.filter((a) => {
        const t = new Date(a.startTime).getTime();
        return t >= bucketStart && t < bucketEnd;
      });
      buckets.push({
        label,
        critical: inBucket.filter((a) => a.severity === 'critical').length,
        high: inBucket.filter((a) => a.severity === 'high').length,
        medium: inBucket.filter((a) => a.severity === 'medium').length,
        low: inBucket.filter((a) => a.severity === 'low').length,
        info: inBucket.filter((a) => a.severity === 'info').length,
      });
    }

    const timeLabels = buckets.map((b) => b.label);
    const severities: Array<{ key: string; color: string }> = [
      { key: 'critical', color: SEVERITY_COLORS.critical },
      { key: 'high', color: SEVERITY_COLORS.high },
      { key: 'medium', color: SEVERITY_COLORS.medium },
      { key: 'low', color: SEVERITY_COLORS.low },
      { key: 'info', color: SEVERITY_COLORS.info },
    ];

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
      },
      legend: { bottom: 0, left: 'center', textStyle: { fontSize: 10 } },
      grid: { top: 10, right: 15, bottom: 36, left: 40 },
      xAxis: {
        type: 'category' as const,
        data: timeLabels,
        axisLabel: { fontSize: 9, color: '#98A2B3', interval: 1 },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#EDF0F5' } },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { fontSize: 9, color: '#98A2B3' },
        splitLine: { lineStyle: { color: '#EDF0F5' } },
        minInterval: 1,
      },
      series: severities.map((s) => ({
        name: s.key,
        type: 'bar' as const,
        stack: 'severity',
        data: buckets.map((b) => ((b as unknown) as Record<string, number>)[s.key]),
        itemStyle: { color: s.color },
        barMaxWidth: 32,
      })),
    };
  }, [alerts]);

  if (alerts.length === 0)
    return (
      <EuiText size="s" color="subdued">
        No timeline data
      </EuiText>
    );

  return <EchartsRender spec={spec!} height={160} />;
};

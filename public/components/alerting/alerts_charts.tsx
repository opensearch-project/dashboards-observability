/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alerts Charts — ECharts visualizations extracted from AlertsDashboard.
 *
 * Includes:
 *  - SeverityDonut: pie/donut chart of alert severity distribution
 *  - AlertTimeline: stacked bar chart of alerts over 24h time buckets
 *  - StateBreakdown: horizontal stacked bar of alert state distribution
 *  - AlertsByDatasource: horizontal bar chart grouping by datasource type
 *  - AlertsByMonitor: horizontal bar chart grouping by monitor name
 *  - AlertsByGroup: generic label-based grouping mini-chart
 */
import React, { useMemo } from 'react';
import { EuiText } from '@elastic/eui';
import { EchartsRender } from './echarts_render';
import { escapeHtml, countBy } from './shared_constants';
import {
  UnifiedAlert,
  UnifiedAlertSeverity,
  UnifiedAlertState,
} from '../../../server/services/alerting';

// ============================================================================
// Color maps
// ============================================================================

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#BD271E',
  high: '#F5A700',
  medium: '#006BB4',
  low: '#98A2B3',
  info: '#D3DAE6',
};

const STATE_COLORS: Record<string, string> = {
  active: '#BD271E',
  pending: '#F5A700',
  acknowledged: '#006BB4',
  silenced: '#98A2B3',
  resolved: '#017D73',
  error: '#BD271E',
};

const DATASOURCE_DISPLAY_NAMES: Record<string, string> = {
  opensearch: 'OpenSearch',
  prometheus: 'Prometheus',
};

// ============================================================================
// Shared order arrays (hoisted to module scope to avoid re-creation per render)
// ============================================================================

const SEVERITY_ORDER: UnifiedAlertSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
const STATE_ORDER: UnifiedAlertState[] = [
  'active',
  'pending',
  'acknowledged',
  'silenced',
  'resolved',
  'error',
];

// ============================================================================
// SeverityDonut
// ============================================================================

export const SeverityDonut: React.FC<{ alerts: UnifiedAlert[] }> = ({ alerts }) => {
  const spec = useMemo(() => {
    const counts = countBy(alerts, (a) => a.severity);
    const total = alerts.length;
    if (total === 0) return null;
    return {
      tooltip: { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, left: 'center', textStyle: { fontSize: 11 } },
      series: [
        {
          type: 'pie' as const,
          radius: ['45%', '70%'],
          center: ['50%', '45%'],
          data: SEVERITY_ORDER.filter((s) => (counts[s] || 0) > 0).map((s) => ({
            value: counts[s] || 0,
            name: s,
            itemStyle: { color: SEVERITY_COLORS[s] },
          })),
          label: { show: false },
          emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' as const } },
        },
      ],
      graphic: [
        {
          type: 'text' as const,
          left: 'center',
          top: '40%',
          style: {
            text: total.toString(),
            fontSize: 24,
            fontWeight: 'bold' as const,
            fill: '#343741',
            textAlign: 'center' as const,
          },
        },
        {
          type: 'text' as const,
          left: 'center',
          top: '52%',
          style: {
            text: 'alerts',
            fontSize: 11,
            fill: '#98A2B3',
            textAlign: 'center' as const,
          },
        },
      ],
    };
  }, [alerts]);

  if (alerts.length === 0)
    return (
      <EuiText size="s" color="subdued" textAlign="center">
        No alerts
      </EuiText>
    );

  return <EchartsRender spec={spec!} height={180} />;
};

// ============================================================================
// AlertTimeline — stacked bar chart by time buckets
// ============================================================================

export const AlertTimeline: React.FC<{ alerts: UnifiedAlert[] }> = ({ alerts }) => {
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
        data: buckets.map((b) => (b as Record<string, number>)[s.key]),
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

// ============================================================================
// StateBreakdown — horizontal stacked bar
// ============================================================================

export const StateBreakdown: React.FC<{ alerts: UnifiedAlert[] }> = ({ alerts }) => {
  const spec = useMemo(() => {
    const counts = countBy(alerts, (a) => a.state);
    const presentStates = STATE_ORDER.filter((s) => (counts[s] || 0) > 0);
    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
      },
      legend: { bottom: 0, left: 'center', textStyle: { fontSize: 11 } },
      grid: { top: 0, right: 0, bottom: 30, left: 0 },
      xAxis: { type: 'value' as const, show: false },
      yAxis: { type: 'category' as const, data: [''], show: false },
      series: presentStates.map((s) => ({
        name: s,
        type: 'bar' as const,
        stack: 'state',
        data: [counts[s] || 0],
        itemStyle: { color: STATE_COLORS[s], borderRadius: 0 },
        barWidth: 14,
      })),
    };
  }, [alerts]);

  if (alerts.length === 0)
    return (
      <div>
        <div style={{ height: 14, background: '#EDF0F5', borderRadius: 4 }} />
      </div>
    );

  return <EchartsRender spec={spec} height={60} />;
};

// ============================================================================
// AlertsByDatasource — horizontal bar chart
// ============================================================================

export const AlertsByDatasource: React.FC<{ alerts: UnifiedAlert[] }> = ({ alerts }) => {
  const spec = useMemo(() => {
    const groups = countBy(alerts, (a) => a.datasourceType || 'unknown');
    const sorted = Object.entries(groups)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    if (sorted.length === 0) return null;
    const names = [...sorted]
      .map(
        ([name]) => DATASOURCE_DISPLAY_NAMES[name] || name.charAt(0).toUpperCase() + name.slice(1)
      )
      .reverse();
    const values = [...sorted].map(([, count]) => count).reverse();
    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        formatter: (
          params: { name: string; value: number } | Array<{ name: string; value: number }>
        ) => {
          const p = Array.isArray(params) ? params[0] : params;
          return `<b>${escapeHtml(p.name)}</b>: ${p.value}`;
        },
      },
      grid: { top: 4, right: 40, bottom: 4, left: 90 },
      xAxis: { type: 'value' as const, show: false },
      yAxis: {
        type: 'category' as const,
        data: names,
        axisLabel: {
          fontSize: 11,
          color: '#343741',
          width: 80,
          overflow: 'truncate' as const,
        },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      series: [
        {
          type: 'bar' as const,
          data: values,
          itemStyle: { color: '#006BB4', borderRadius: [0, 4, 4, 0] },
          barMaxWidth: 12,
          label: {
            show: true,
            position: 'right' as const,
            fontSize: 11,
            fontWeight: 'bold' as const,
            color: '#343741',
          },
        },
      ],
    };
  }, [alerts]);

  if (!spec)
    return (
      <EuiText size="s" color="subdued">
        No data
      </EuiText>
    );

  const barCount = spec.yAxis.data.length;
  return <EchartsRender spec={spec} height={Math.max(80, barCount * 28 + 16)} />;
};

// ============================================================================
// AlertsByMonitor — horizontal bar chart
// ============================================================================

export const AlertsByMonitor: React.FC<{ alerts: UnifiedAlert[] }> = ({ alerts }) => {
  const spec = useMemo(() => {
    const groups = countBy(alerts, (a) => {
      const dashIdx = a.name.indexOf(' \u2014 ');
      return dashIdx > 0 ? a.name.substring(0, dashIdx) : a.name;
    });
    const sorted = Object.entries(groups)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    if (sorted.length === 0) return null;
    const names = [...sorted].map(([name]) => name).reverse();
    const values = [...sorted].map(([, count]) => count).reverse();
    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        formatter: (
          params: { name: string; value: number } | Array<{ name: string; value: number }>
        ) => {
          const p = Array.isArray(params) ? params[0] : params;
          return `<b>${escapeHtml(p.name)}</b>: ${p.value}`;
        },
      },
      grid: { top: 4, right: 40, bottom: 4, left: 130 },
      xAxis: { type: 'value' as const, show: false },
      yAxis: {
        type: 'category' as const,
        data: names,
        axisLabel: {
          fontSize: 11,
          color: '#343741',
          width: 120,
          overflow: 'truncate' as const,
        },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      series: [
        {
          type: 'bar' as const,
          data: values,
          itemStyle: { color: '#006BB4', borderRadius: [0, 4, 4, 0] },
          barMaxWidth: 12,
          label: {
            show: true,
            position: 'right' as const,
            fontSize: 11,
            fontWeight: 'bold' as const,
            color: '#343741',
          },
        },
      ],
    };
  }, [alerts]);

  if (!spec)
    return (
      <EuiText size="s" color="subdued">
        No data
      </EuiText>
    );

  const barCount = spec.yAxis.data.length;
  return <EchartsRender spec={spec} height={Math.max(80, barCount * 28 + 16)} />;
};

// ============================================================================
// AlertsByGroup — generic label-based grouping
// ============================================================================

export const AlertsByGroup: React.FC<{ alerts: UnifiedAlert[]; groupKey: string }> = ({
  alerts,
  groupKey,
}) => {
  const sorted = useMemo(() => {
    const groups = countBy(alerts, (a) => a.labels[groupKey] || 'unknown');
    return Object.entries(groups)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [alerts, groupKey]);

  if (sorted.length === 0)
    return (
      <EuiText size="s" color="subdued">
        No data
      </EuiText>
    );

  const allUnknown = sorted.length === 1 && sorted[0][0] === 'unknown';
  if (allUnknown) {
    return (
      <EuiText size="s" color="subdued" style={{ fontStyle: 'italic', padding: '8px 0' }}>
        Add <code>{groupKey}</code> labels to your alerts for grouping.
      </EuiText>
    );
  }

  const maxCount = sorted[0][1];

  return (
    <div style={{ fontSize: 12 }} data-test-subj="alertsByGroup">
      {sorted.map(([name, count]) => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span
            style={{
              width: 90,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
              color: '#343741',
            }}
          >
            {name}
          </span>
          <div
            style={{
              flex: 1,
              height: 8,
              background: '#EDF0F5',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(count / maxCount) * 100}%`,
                height: '100%',
                background: '#006BB4',
                borderRadius: 4,
              }}
            />
          </div>
          <span style={{ fontWeight: 600, minWidth: 20, textAlign: 'right' as const }}>
            {count}
          </span>
        </div>
      ))}
    </div>
  );
};

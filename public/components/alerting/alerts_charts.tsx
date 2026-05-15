/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alerts Charts — ECharts visualizations for the Alerts dashboard.
 *
 * Currently exposes:
 *  - AlertTimeline: stacked bar chart of alerts over a variable-range time
 *    window. The parent owns range resolution (date-math → epoch ms) and
 *    passes pre-resolved `startMs` / `endMs` props so this component never
 *    re-resolves date-math on every render.
 *
 * Other breakdown panels (SeverityDonut, StateBreakdown, AlertsByDatasource,
 * AlertsByMonitor) were removed in a UI cleanup pass — the facet filter panel
 * already surfaces those dimensions and the redundant chart panels were
 * cluttering the dashboard.
 */
import React, { useMemo } from 'react';
import moment from 'moment-timezone';
import { EuiText } from '@elastic/eui';
import { FormattedMessage } from '@osd/i18n/react';
import { EchartsRender } from './echarts_render';
import { UnifiedAlertSummary } from '../../../common/types/alerting';
import { uiSettingsService } from '../../../common/utils';

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

/** Common range thresholds (ms). */
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

/** Target bucket width — 5 minutes. With a 1h range, this yields exactly 12 */
/** buckets (ceil(60m / 5m) = 12), matching the fixed bucketCount used before. */
const TARGET_BUCKET_MS = 5 * 60 * 1000;

/** Minimum / maximum bucket counts. Within this clamp the X-axis stays */
/** readable across ranges from 5 minutes up to 30 days. */
const MIN_BUCKETS = 12;
const MAX_BUCKETS = 24;

/** Clamp `value` to `[min, max]`. Matches lodash's `(value, min, max)`
 *  argument order so callers don't have to think twice. Kept local to
 *  avoid a lodash import for a two-line helper. */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Resolve the timezone the user configured via `dateFormat:tz`. Mirrors the
 * resolution APM does in `formatDisplayTimestamp` so Discover, APM, and the
 * Alerts dashboard all render the same instant the same way for a given user.
 */
function resolveDisplayTz(): string {
  const tz = uiSettingsService.get('dateFormat:tz');
  if (!tz || tz === 'Browser') {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return tz;
}

/**
 * Format a bucket-start timestamp based on the overall range length:
 *  - `HH:mm` for ranges ≤ 24h
 *  - `MM-DD HH:mm` for ranges ≤ 7d
 *  - `MM-DD` otherwise
 *
 * Honors `dateFormat:tz` so users in different timezones don't see different
 * labels for the same bucket — matches Discover / Dashboards / APM.
 */
function formatBucketLabel(ts: number, rangeMs: number, tz: string): string {
  const m = moment.tz(ts, tz);
  if (rangeMs <= ONE_DAY_MS) return m.format('HH:mm');
  if (rangeMs <= SEVEN_DAYS_MS) return m.format('MM-DD HH:mm');
  return m.format('MM-DD');
}

export interface AlertTimelineProps {
  alerts: UnifiedAlertSummary[];
  /** Range start in epoch ms (resolved by the parent). */
  startMs: number;
  /** Range end in epoch ms (resolved by the parent). */
  endMs: number;
}

export const AlertTimeline: React.FC<AlertTimelineProps> = ({ alerts, startMs, endMs }) => {
  const spec = useMemo(() => {
    if (alerts.length === 0) return null;

    // Defend against inverted or zero-length ranges — pick a minimum 1ms
    // window so division below doesn't blow up. In practice the parent
    // should never send this, but the picker+sessionStorage cycle can
    // produce transient oddities on first mount.
    const rangeMs = Math.max(1, endMs - startMs);

    // bucketCount = clamp(ceil(rangeMs / targetBucketMs), 12, 24)
    const rawBucketCount = Math.ceil(rangeMs / TARGET_BUCKET_MS);
    const bucketCount = clamp(rawBucketCount, MIN_BUCKETS, MAX_BUCKETS);
    const bucketDuration = rangeMs / bucketCount;

    const buckets: Array<{
      label: string;
      critical: number;
      high: number;
      medium: number;
      low: number;
      info: number;
    }> = [];

    // Clamp each alert's effective start to the window start so alerts that
    // began before the window but are still-firing / resolved inside it get
    // credited to the first bucket. Matches the OS backend's interval-overlap
    // filter (opensearch_backend.ts) — otherwise the summary cards show "1
    // alert" while the timeline shows zero bars for the same data. Also a
    // perf win: parse each startTime once instead of per-bucket.
    const alertBucketStart = alerts.map((a) => Math.max(startMs, new Date(a.startTime).getTime()));

    const tz = resolveDisplayTz();

    for (let i = 0; i < bucketCount; i++) {
      const bucketStart = startMs + i * bucketDuration;
      const bucketEnd = bucketStart + bucketDuration;
      const label = formatBucketLabel(bucketStart, rangeMs, tz);
      const inBucket = alerts.filter(
        (_, idx) => alertBucketStart[idx] >= bucketStart && alertBucketStart[idx] < bucketEnd
      );
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
  }, [alerts, startMs, endMs]);

  if (alerts.length === 0)
    return (
      <EuiText size="s" color="subdued">
        <FormattedMessage
          id="observability.alerting.alertsCharts.noTimelineData"
          defaultMessage="No timeline data"
        />
      </EuiText>
    );

  return <EchartsRender spec={spec!} height={160} />;
};

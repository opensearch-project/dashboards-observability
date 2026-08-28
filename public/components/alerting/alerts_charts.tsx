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
import { i18n } from '@osd/i18n';
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

    const tz = resolveDisplayTz();

    // Parse each alert's start time once, then bucket in a single O(alerts)
    // pass. The previous approach re-scanned the whole alerts array per bucket
    // and ran five more severity `.filter` passes inside each — O(buckets ×
    // alerts × 6). A single pass that computes the bucket index per alert is
    // O(alerts), which matters once the list runs into the thousands.
    const alertStartMs = alerts.map((a) => new Date(a.startTime).getTime());

    const buckets = Array.from({ length: bucketCount }, (_, i) => ({
      label: formatBucketLabel(startMs + i * bucketDuration, rangeMs, tz),
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    }));

    // This histogram counts alert *starts* per time bucket. The OS backend's
    // interval-overlap filter (opensearch_backend.ts) also returns alerts that
    // began BEFORE the picked window but are still firing / recently resolved
    // inside it. Those alerts are real, but they did not *start* in any visible
    // bucket — the previous `Math.max(startMs, ...)` clamp forced them into
    // bucket 0, painting a false spike at the left edge. We instead count them
    // separately and surface the count in the title. A malformed/missing
    // `startTime` parses to `NaN`; it is counted as its own "unknown start
    // time" note. Together these keep every alert reconcilable against the
    // summary cards — each is either in a bar, before the window, or unknown —
    // rather than silently vanishing from both the bars and the notes.
    let excludedBeforeWindow = 0;
    let unknownStart = 0;
    for (let idx = 0; idx < alerts.length; idx++) {
      const t = alertStartMs[idx];
      if (Number.isNaN(t)) {
        unknownStart += 1;
        continue;
      }
      if (t < startMs) {
        excludedBeforeWindow += 1;
        continue;
      }
      // Bucket index. `bucketDuration` is a float, so a start at exactly `endMs`
      // computes an index of `bucketCount` (out of range). Fold a start at (or
      // right at the float edge of) `endMs` into the last bucket so it isn't
      // dropped, but leave a start strictly after `endMs` excluded from the
      // bars — the backend's overlap filter shouldn't return those, and folding
      // them in would paint a false spike on the right edge.
      let bucketIdx = Math.floor((t - startMs) / bucketDuration);
      if (bucketIdx >= bucketCount) {
        if (t > endMs) continue;
        bucketIdx = bucketCount - 1;
      }
      const severity = alerts[idx].severity;
      if (
        severity === 'critical' ||
        severity === 'high' ||
        severity === 'medium' ||
        severity === 'low' ||
        severity === 'info'
      ) {
        buckets[bucketIdx][severity] += 1;
      }
    }

    // Build the reconciliation note(s) shown above the chart. Joined with a
    // middot when both are present so no dropped alert is left unexplained.
    const notes: string[] = [];
    if (excludedBeforeWindow > 0) {
      notes.push(
        i18n.translate('observability.alerting.alertsCharts.excludedBeforeWindow', {
          defaultMessage:
            '{count, plural, one {# alert started} other {# alerts started}} before this window',
          values: { count: excludedBeforeWindow },
        })
      );
    }
    if (unknownStart > 0) {
      notes.push(
        i18n.translate('observability.alerting.alertsCharts.unknownStart', {
          defaultMessage:
            '{count, plural, one {# alert has} other {# alerts have}} an unknown start time',
          values: { count: unknownStart },
        })
      );
    }
    const noteText = notes.join(' · ');

    const timeLabels = buckets.map((b) => b.label);
    const severities: Array<{ key: string; color: string }> = [
      { key: 'critical', color: SEVERITY_COLORS.critical },
      { key: 'high', color: SEVERITY_COLORS.high },
      { key: 'medium', color: SEVERITY_COLORS.medium },
      { key: 'low', color: SEVERITY_COLORS.low },
      { key: 'info', color: SEVERITY_COLORS.info },
    ];

    return {
      // Surface alerts excluded from the bars (started before the window, or
      // with an unknown start time — see the counting pass above) as a small
      // subtitle instead of silently dropping them. Omitted when there's none.
      title: noteText
        ? {
            left: 'center' as const,
            top: 0,
            text: noteText,
            textStyle: { fontSize: 10, fontWeight: 'normal' as const, color: '#98A2B3' },
          }
        : undefined,
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        // Render the tooltip on document.body so it escapes the chart's
        // bounding box. Without this the tooltip clips against the chart
        // container's top edge when the cursor is over the lower buckets.
        appendToBody: true,
        confine: false,
      },
      legend: { bottom: 0, left: 'center', textStyle: { fontSize: 10 } },
      // Reserve extra headroom for the reconciliation subtitle when present.
      // `left: 50` (was 44) gives the rotated y-axis name + 3-digit count tick
      // labels room so they don't clip the chart's left edge.
      grid: { top: noteText ? 24 : 10, right: 15, bottom: 36, left: 50 },
      xAxis: {
        type: 'category' as const,
        data: timeLabels,
        axisLabel: { fontSize: 9, color: '#98A2B3', interval: 1 },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#EDF0F5' } },
      },
      yAxis: {
        type: 'value' as const,
        name: i18n.translate('observability.alerting.alertsCharts.yAxisTitle', {
          defaultMessage: 'Alerts',
        }),
        nameLocation: 'middle' as const,
        nameGap: 30,
        nameTextStyle: { fontSize: 10, color: '#98A2B3' },
        axisLabel: { fontSize: 9, color: '#98A2B3' },
        splitLine: { lineStyle: { color: '#EDF0F5' } },
        minInterval: 1,
      },
      series: severities.map((s) => ({
        name: s.key,
        type: 'bar' as const,
        stack: 'severity',
        data: buckets.map((b) => (b as unknown as Record<string, number>)[s.key]),
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

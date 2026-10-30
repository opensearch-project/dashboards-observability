/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CloudWatch Alarm Detail Flyout — read-only view of a single CloudWatch alarm.
 *
 * Two layouts keyed by `alarmType`:
 *   - metric   → Summary, Metric preview (series + threshold + ALARM band),
 *                Conditions & evaluation, State history, Alarm actions,
 *                Related alarms.
 *   - composite→ State timeline, Rule expression, Relationships tree
 *                (cycle-safe, tombstone-aware, lazy deeper levels), State
 *                history.
 *
 * Everything is read-only ("Read-only" pill + "View in CloudWatch" deep link).
 * Sections degrade independently: a history AccessDenied renders a partial-
 * permission callout, a missing metric preview is simply omitted, and a hard
 * fetch failure surfaces an actionable datasource-failure callout with retry.
 * Built from the same EUI primitives + `EchartsRender` the sibling flyouts use.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiBetaBadge,
  EuiBreadcrumbs,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiCodeBlock,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiHealth,
  EuiHorizontalRule,
  EuiLink,
  EuiLoadingContent,
  EuiSpacer,
  EuiText,
  EuiTextColor,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import * as echarts from 'echarts';
import moment from 'moment';
import { i18n } from '@osd/i18n';
import type {
  CloudWatchAlarm,
  CloudWatchAlarmHistoryItem,
  CloudWatchAlarmState,
  CloudWatchAlarmType,
  CloudWatchMetricPreview,
  CloudWatchRelationshipGraph,
  CloudWatchRelationshipNode,
  MonitorType,
  UnifiedCloudWatchMeta,
  UnifiedAlertSeverity,
} from '../../../common/types/alerting';
import { EchartsRender } from './echarts_render';
import { ClassifiedErrorCallout } from '../common/error';
import { useCloudWatchAlarmDetail } from './hooks/use_cloudwatch_alarm_detail';
import { AlertingOpenSearchService } from './query_services/alerting_opensearch_service';
import { SEVERITY_COLORS } from './shared_constants';
import { formatTimestamp, localizeTimestampsInText } from './time_format';
import {
  getCloudWatchStateLabel,
  getMonitorStateLabel,
  getSeverityLabel,
  getStateLabel,
} from './enum_labels';
import {
  AlarmTimeWindow,
  defaultAlarmTimeWindow,
  isInWindow,
  noChangesInWindowMessage,
} from './alarm_time_window';

/**
 * Structural subset shared by `UnifiedRuleSummary` (Rules tab) and
 * `UnifiedAlertSummary` (Alerts tab) so the same flyout serves both. Only the
 * header reads these fields directly; the full detail comes from the hook.
 */
export interface CloudWatchAlarmFlyoutRow {
  id: string;
  name: string;
  datasourceId: string;
  /**
   * Optional: rows pushed by in-flyout navigation (parent/child drill-down)
   * don't know severity until the detail loads; the header falls back to
   * 'info' and re-derives it from the fetched alarm.
   */
  severity?: UnifiedAlertSeverity;
  monitorType?: MonitorType;
  cloudWatch?: UnifiedCloudWatchMeta;
}

export interface CloudWatchAlarmDetailFlyoutProps {
  rule: CloudWatchAlarmFlyoutRow;
  onClose: () => void;
  /**
   * The window that scopes the state timeline, metric preview and state history (the Rules
   * tab's time picker). Default: the last 24h as of opening. Memoize it: a new window refetches.
   */
  timeRange?: AlarmTimeWindow;
}

// State → OUI health colour used consistently for dots/badges in this flyout.
const STATE_HEALTH: Record<CloudWatchAlarmState, string> = {
  ALARM: 'danger',
  OK: 'success',
  INSUFFICIENT_DATA: 'warning',
};

// State → hex for the timeline band / chart shading (OUI semantic hexes).
const STATE_HEX: Record<CloudWatchAlarmState, string> = {
  ALARM: '#BD271E',
  OK: '#017D73',
  INSUFFICIENT_DATA: '#F5A700',
};

function stateHealthColor(state?: CloudWatchAlarmState): string {
  return state ? STATE_HEALTH[state] : 'subdued';
}

/**
 * Client-side severity for a CloudWatch alarm, mirroring the server mapper
 * (`cloudWatchSeverity`): a constant default unless the name or description names one. Used for
 * the header badge when navigating to a related alarm whose severity wasn't carried on the
 * originating row.
 */
function deriveSeverity(alarm: CloudWatchAlarm): UnifiedAlertSeverity {
  const hint = `${alarm.alarmName} ${alarm.description || ''}`.toLowerCase();
  if (/\bcritical\b|\bsev-?1\b|\bp0\b/.test(hint)) return 'critical';
  if (/\bwarn(ing)?\b/.test(hint)) return 'low';
  return 'medium';
}

// ============================================================================
// Metric preview chart
// ============================================================================

const METRIC_LINE_COLOR = '#006BB4';
const THRESHOLD_LABEL = i18n.translate('observability.alerting.cloudwatch.legendThreshold', {
  defaultMessage: 'Threshold',
});
const STATE_BAND_LABEL = i18n.translate('observability.alerting.cloudwatch.legendStateBand', {
  defaultMessage: 'State band',
});

/**
 * "Composite" / "Metric", in theme colors (`accent` follows light and dark themes, unlike a
 * fixed hex).
 */
const AlarmTypeBadge: React.FC<{ alarmType?: CloudWatchAlarmType }> = ({ alarmType }) =>
  alarmType === 'composite' ? (
    <EuiBadge color="accent">
      {i18n.translate('observability.alerting.cloudwatch.alarmTypeComposite', {
        defaultMessage: 'Composite',
      })}
    </EuiBadge>
  ) : (
    <EuiBadge color="hollow">
      {i18n.translate('observability.alerting.cloudwatch.alarmTypeMetric', {
        defaultMessage: 'Metric',
      })}
    </EuiBadge>
  );
const STATE_BAND_FILL = 'rgba(189,39,30,0.12)';

function buildMetricPreviewSpec(preview: CloudWatchMetricPreview): echarts.EChartsOption {
  const seriesName = preview.label || 'metric';
  const data = preview.points.map((p) => [p.timestamp, p.value] as [number, number]);
  const markLineData =
    preview.threshold != null
      ? [
          {
            yAxis: preview.threshold,
            label: {
              formatter: i18n.translate('observability.alerting.cloudwatch.thresholdLine', {
                defaultMessage: 'threshold {value}',
                values: { value: preview.threshold },
              }),
              position: 'insideStartTop' as const,
            },
            lineStyle: { color: STATE_HEX.ALARM, type: 'dashed' as const, width: 1.5 },
          },
        ]
      : [];
  const bands = preview.alarmBands || [];
  const markAreaData = bands.map((band, i) => [
    {
      xAxis: band[0],
      itemStyle: { color: STATE_BAND_FILL },
      // Label only the first band "ALARM", so repeated breaches don't stack labels.
      label:
        i === 0
          ? {
              show: true,
              formatter: 'ALARM',
              position: 'insideTop' as const,
              color: STATE_HEX.ALARM,
            }
          : undefined,
    },
    { xAxis: band[1] },
  ]);
  return {
    // Extra bottom room for the legend row.
    grid: { left: 48, right: 16, top: 16, bottom: 44 },
    tooltip: { trigger: 'axis' },
    legend: {
      bottom: 0,
      data: [seriesName, THRESHOLD_LABEL, STATE_BAND_LABEL],
      icon: 'roundRect',
    },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', scale: true },
    // Cast: the bundled echarts typings reject valid literal option shapes
    // (markLine/markArea unions); the values conform to the runtime API.
    series: [
      {
        name: seriesName,
        type: 'line',
        showSymbol: false,
        data,
        lineStyle: { color: METRIC_LINE_COLOR },
        itemStyle: { color: METRIC_LINE_COLOR },
        markLine: markLineData.length
          ? { symbol: 'none', data: markLineData, silent: true }
          : undefined,
        markArea: markAreaData.length ? { silent: true, data: markAreaData } : undefined,
      },
      // Legend-only phantom series so "Threshold" and "State band" appear in the
      // legend with the correct swatch colors (markLine/markArea can't legend).
      {
        name: THRESHOLD_LABEL,
        type: 'line',
        data: [],
        lineStyle: { color: STATE_HEX.ALARM, type: 'dashed' },
        itemStyle: { color: STATE_HEX.ALARM },
      },
      {
        name: STATE_BAND_LABEL,
        type: 'line',
        data: [],
        lineStyle: { color: STATE_BAND_FILL },
        itemStyle: { color: STATE_HEX.ALARM, opacity: 0.35 },
      },
    ] as unknown as echarts.EChartsOption['series'],
  };
}

// ============================================================================
// Relationships tree
// ============================================================================

/** Navigate the flyout to another alarm (parent/child) within the same view. */
type OpenAlarmFn = (node: {
  alarmName: string;
  alarmType?: CloudWatchAlarmType;
  stateValue?: CloudWatchAlarmState;
}) => void;

const RelationshipRow: React.FC<{
  node: CloudWatchRelationshipNode;
  depth: number;
  isSelf?: boolean;
  onOpen: OpenAlarmFn;
}> = ({ node, depth, isSelf, onOpen }) => {
  return (
    <>
      <div style={{ paddingLeft: depth * 20, marginBottom: 4 }}>
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
          {node.alarmType && (
            <EuiFlexItem grow={false}>
              <AlarmTypeBadge alarmType={node.alarmType} />
            </EuiFlexItem>
          )}
          {/* minWidth 0 + overflowWrap lets long unbroken alarm names wrap
              inside the row instead of pushing past the flyout edge. */}
          <EuiFlexItem grow={false} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            {node.deleted ? (
              <EuiTextColor color="subdued">
                <s>{node.alarmName}</s>
              </EuiTextColor>
            ) : isSelf ? (
              <strong>{node.alarmName}</strong>
            ) : (
              // Clickable: navigate the flyout to this related alarm.
              <EuiLink onClick={() => onOpen(node)}>{node.alarmName}</EuiLink>
            )}
          </EuiFlexItem>
          {isSelf && (
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">
                {i18n.translate('observability.alerting.cloudwatch.thisAlarm', {
                  defaultMessage: 'this alarm',
                })}
              </EuiBadge>
            </EuiFlexItem>
          )}
          {node.childCount ? (
            <EuiFlexItem grow={false}>
              <EuiTextColor color="subdued">
                {i18n.translate('observability.alerting.cloudwatch.childCount', {
                  defaultMessage: '{count, plural, one {# child alarm} other {# child alarms}}',
                  values: { count: node.childCount },
                })}
              </EuiTextColor>
            </EuiFlexItem>
          ) : null}
          {node.deleted && (
            <EuiFlexItem grow={false}>
              <EuiBadge color="warning">
                {i18n.translate('observability.alerting.cloudwatch.deletedTarget', {
                  defaultMessage: 'deleted in CloudWatch',
                })}
              </EuiBadge>
            </EuiFlexItem>
          )}
          {node.cycle && (
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">
                {i18n.translate('observability.alerting.cloudwatch.cycleStopped', {
                  defaultMessage: 'already shown — cycle stopped',
                })}
              </EuiBadge>
            </EuiFlexItem>
          )}
          {!node.deleted && node.stateValue && (
            <EuiFlexItem grow={false}>
              <EuiHealth color={stateHealthColor(node.stateValue)} />
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </div>
      {(node.children || []).map((child, i) => (
        <RelationshipRow
          key={`${child.alarmName}-${i}`}
          node={child}
          depth={depth + 1}
          onOpen={onOpen}
        />
      ))}
    </>
  );
};

const RelationshipsSection: React.FC<{
  dsId: string;
  alarmName: string;
  graph: CloudWatchRelationshipGraph;
  onOpen: OpenAlarmFn;
}> = ({ dsId, alarmName, graph, onOpen }) => {
  const service = useMemo(() => new AlertingOpenSearchService(), []);
  const [current, setCurrent] = useState<CloudWatchRelationshipGraph>(graph);
  const [depth, setDepth] = useState(2);
  const [loadingDeeper, setLoadingDeeper] = useState(false);

  const loadDeeper = async () => {
    setLoadingDeeper(true);
    try {
      const next = await service.getCloudWatchAlarmRelationships(dsId, alarmName, depth + 2);
      setCurrent(next);
      setDepth(depth + 2);
    } catch {
      // Leave the current graph in place; deeper expansion is best-effort.
    } finally {
      setLoadingDeeper(false);
    }
  };

  return (
    <div>
      {current.parents.length > 0 && (
        <>
          {current.parents.map((p, i) => (
            <div key={`${p.alarmName}-${i}`} style={{ marginBottom: 4 }}>
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
                <EuiFlexItem grow={false}>
                  <EuiBadge color="hollow">
                    {i18n.translate('observability.alerting.cloudwatch.parent', {
                      defaultMessage: 'parent',
                    })}
                  </EuiBadge>
                </EuiFlexItem>
                <EuiFlexItem grow={false} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <EuiLink onClick={() => onOpen(p)}>{p.alarmName}</EuiLink>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiHealth color={stateHealthColor(p.stateValue)} />
                </EuiFlexItem>
              </EuiFlexGroup>
            </div>
          ))}
          <EuiSpacer size="s" />
        </>
      )}
      <RelationshipRow node={current.tree} depth={0} isSelf onOpen={onOpen} />
      {current.maxDepthReached && (
        <div style={{ marginTop: 6 }}>
          <EuiButtonEmpty size="xs" onClick={loadDeeper} isLoading={loadingDeeper} flush="left">
            {i18n.translate('observability.alerting.cloudwatch.loadDeeper', {
              defaultMessage:
                'Show child alarms {more} more levels down (showing {depth} {depth, plural, one {level} other {levels}} now)',
              values: { more: 2, depth },
            })}
          </EuiButtonEmpty>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// State timeline (composite header band)
// ============================================================================

/** How the timeline's axis names a window edge: "now" when it's the present, else M/D HH:mm. */
function axisLabel(ms: number): string {
  return Math.abs(Date.now() - ms) < 60 * 1000 ? 'now' : moment(ms).format('M/D HH:mm');
}

export interface TimelineSegment {
  start: number;
  end: number;
  state: CloudWatchAlarmState;
}

/**
 * The state bands across a window, from an alarm's history: the state at the window start (the
 * last change before it, else the first in-window change's prior state, else the current
 * state), then one band per change. CloudWatch only records transitions, so the backfill makes
 * the bands span the whole window. `changes` counts the transitions inside the window.
 */
export function buildTimelineSegments(
  history: CloudWatchAlarmHistoryItem[] | undefined,
  windowStart: number,
  windowEnd: number,
  currentState?: CloudWatchAlarmState
): { segments: TimelineSegment[]; changes: number } {
  const updates = (history || [])
    .filter((h) => h.historyItemType === 'StateUpdate' && (h.newState || h.oldState))
    .map((h) => ({
      ts: new Date(h.timestamp).getTime(),
      oldState: h.oldState,
      newState: h.newState,
    }))
    .filter((u) => Number.isFinite(u.ts) && u.ts <= windowEnd)
    .sort((a, b) => a.ts - b.ts);
  const inWindow = updates.filter((u) => u.ts >= windowStart);
  const before = updates.filter((u) => u.ts < windowStart);
  const initial =
    before[before.length - 1]?.newState ||
    inWindow[0]?.oldState ||
    inWindow[0]?.newState ||
    currentState;
  const segments: TimelineSegment[] = [];
  let cursor = windowStart;
  let state = initial;
  for (const u of inWindow) {
    if (state && u.ts > cursor) segments.push({ start: cursor, end: u.ts, state });
    cursor = Math.max(cursor, u.ts);
    state = u.newState || state;
  }
  if (state && windowEnd > cursor) segments.push({ start: cursor, end: windowEnd, state });
  return { segments, changes: inWindow.length };
}

/** "ALARM · 9/24 19:22 → 9/24 19:24 (2m)" for a band's tooltip. */
function segmentTooltip(seg: TimelineSegment): string {
  const span = moment.duration(seg.end - seg.start);
  const days = Math.floor(span.asDays());
  const length =
    days > 0
      ? `${days}d ${span.hours()}h`
      : span.hours() > 0
        ? `${span.hours()}h ${span.minutes()}m`
        : `${Math.max(1, span.minutes())}m`;
  return `${getCloudWatchStateLabel(seg.state)} · ${axisLabel(seg.start)} → ${axisLabel(
    seg.end
  )} (${length})`;
}

export const StateTimeline: React.FC<{
  history?: CloudWatchAlarmHistoryItem[];
  timeWindow: AlarmTimeWindow;
  /** The alarm's current state, drawn across the window when nothing changed in it. */
  currentState?: CloudWatchAlarmState;
  /** When the alarm last changed state, for "No changes in last 24h, last change 9/24". */
  lastChange?: string;
}> = ({ history, timeWindow, currentState, lastChange }) => {
  const { startMs: windowStart, endMs: windowEnd } = timeWindow;
  const { segments, changes } = useMemo(
    () => buildTimelineSegments(history, windowStart, windowEnd, currentState),
    [history, windowStart, windowEnd, currentState]
  );
  // Always say how many changes the bands stand for, so one flat band reads as "no changes"
  // rather than looking the same as a busy window.
  const caption =
    changes > 0 ? (
      <EuiTextColor color="subdued" data-test-subj="cwAlarmTimelineChanges">
        {i18n.translate('observability.alerting.cloudwatch.timelineChanges', {
          defaultMessage:
            '{count, plural, one {# state change} other {# state changes}} in {window}',
          values: { count: changes, window: timeWindow.label },
        })}
      </EuiTextColor>
    ) : (
      <EuiTextColor color="subdued" data-test-subj="cwAlarmTimelineNoChanges">
        {noChangesInWindowMessage(timeWindow, lastChange)}
      </EuiTextColor>
    );
  if (segments.length === 0) return caption;
  const total = windowEnd - windowStart;
  // An ECharts horizontal stacked bar, one segment per state interval, on a time axis with
  // ticks; hovering a segment names its state and span.
  const spec: echarts.EChartsOption = {
    grid: { left: 8, right: 8, top: 2, bottom: 22 },
    tooltip: {
      trigger: 'item',
      // Cast: echarts' TooltipOption formatter typing rejects this narrower (and safe) param
      // shape; only `seriesIndex` is read.
      formatter: ((p: { seriesIndex?: number }) => {
        const seg = segments[p.seriesIndex ?? -1];
        return seg ? segmentTooltip(seg) : '';
      }) as unknown as echarts.TooltipComponentOption['formatter'],
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: total,
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: true },
      splitLine: { show: false },
      axisLabel: {
        fontSize: 10,
        color: '#69707D',
        formatter: (v: number) => axisLabel(windowStart + v),
      },
    },
    yAxis: { type: 'category', data: [''], show: false },
    series: segments.map((seg) => ({
      name: getCloudWatchStateLabel(seg.state),
      type: 'bar' as const,
      stack: 'timeline',
      barWidth: 16,
      data: [seg.end - seg.start],
      // A thin gap between bands so adjacent transitions stay visible.
      itemStyle: { color: STATE_HEX[seg.state], borderColor: '#FFFFFF', borderWidth: 1 },
    })),
  };
  return (
    <div>
      <EchartsRender spec={spec} height={44} />
      <EuiSpacer size="xs" />
      {caption}
    </div>
  );
};

// ============================================================================
// Section header
// ============================================================================

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <EuiTitle size="xs">
    <h3>{children}</h3>
  </EuiTitle>
);

// ============================================================================
// Flyout
// ============================================================================

export const CloudWatchAlarmDetailFlyout: React.FC<CloudWatchAlarmDetailFlyoutProps> = ({
  rule,
  onClose,
  timeRange,
}) => {
  const dsId = rule.datasourceId;
  const defaultWindow = useMemo(() => defaultAlarmTimeWindow(), []);
  const timeWindow = timeRange ?? defaultWindow;

  // In-flyout navigation stack. Clicking a related alarm (parent/child) pushes
  // it here and re-fetches its detail, so users move between linked alarms
  // without leaving the unified view (no external CloudWatch links). The first
  // entry is the alarm the flyout opened on.
  const [stack, setStack] = useState<CloudWatchAlarmFlyoutRow[]>([rule]);
  const current = stack[stack.length - 1];
  // Rows from the tables carry a region/account-qualified id; the alarm name is on the meta.
  const alarmName = current.cloudWatch?.alarmName ?? current.name;
  const { detail, isLoading, error, classifiedError, retry, windowRejected } =
    useCloudWatchAlarmDetail({
      dsId,
      alarmName,
      startTime: new Date(timeWindow.startMs).toISOString(),
      endTime: new Date(timeWindow.endMs).toISOString(),
    });

  const openAlarm = useCallback<OpenAlarmFn>(
    (node) => {
      setStack((s) => [
        ...s,
        {
          id: node.alarmName,
          name: node.alarmName,
          datasourceId: dsId,
          monitorType: node.alarmType,
          cloudWatch: node.stateValue
            ? { state: node.stateValue, alarmType: node.alarmType || 'metric' }
            : undefined,
        },
      ]);
    },
    [dsId]
  );
  /** Go back to the stack entry at `index` (a breadcrumb in the trail). */
  const goTo = useCallback((index: number) => {
    setStack((s) => (index >= 0 && index < s.length - 1 ? s.slice(0, index + 1) : s));
  }, []);

  // Header shows the current stack entry's meta immediately, then prefers the
  // freshly-fetched detail once it arrives so state/severity can't lag.
  const displayName = detail?.alarm.alarmName || current.name;
  const severity: UnifiedAlertSeverity = detail
    ? deriveSeverity(detail.alarm)
    : current.severity || 'info';
  const alarmType =
    detail?.alarm.alarmType ||
    current.cloudWatch?.alarmType ||
    (current.monitorType === 'composite' ? 'composite' : 'metric');
  const state = detail?.alarm.stateValue || current.cloudWatch?.state;
  const cw = { accountId: detail?.alarm.accountId, region: detail?.alarm.region };

  const headerState = (
    <EuiText size="s">
      <EuiFlexGroup gutterSize="l" responsive={false} wrap alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiTextColor color="subdued">
            {i18n.translate('observability.alerting.cloudwatch.stateLabel', {
              defaultMessage: 'CloudWatch state',
            })}
          </EuiTextColor>{' '}
          {state ? (
            <EuiBadge color={STATE_HEALTH[state]}>{getCloudWatchStateLabel(state)}</EuiBadge>
          ) : (
            '—'
          )}
        </EuiFlexItem>
        {cw?.accountId && (
          <EuiFlexItem grow={false}>
            <EuiTextColor color="subdued">
              {i18n.translate('observability.alerting.cloudwatch.accountLabel', {
                defaultMessage: 'Account',
              })}
            </EuiTextColor>{' '}
            {cw.accountId}
          </EuiFlexItem>
        )}
        {cw?.region && (
          <EuiFlexItem grow={false}>
            <EuiTextColor color="subdued">
              {i18n.translate('observability.alerting.cloudwatch.regionLabel', {
                defaultMessage: 'Region',
              })}
            </EuiTextColor>{' '}
            {cw.region}
          </EuiFlexItem>
        )}
        <EuiFlexItem grow={false}>
          <EuiTextColor color="subdued">
            {i18n.translate('observability.alerting.cloudwatch.sourceLabel', {
              defaultMessage: 'Source',
            })}
          </EuiTextColor>{' '}
          CloudWatch
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiText>
  );

  return (
    <EuiFlyout onClose={onClose} size="m" aria-labelledby="cwAlarmFlyoutTitle" ownFocus>
      <EuiFlyoutHeader hasBorder>
        {stack.length > 1 && (
          <>
            {/* The trail of alarms opened from here: each earlier one is a link back to it, so
                several levels in it's clear where you are and how you got there. */}
            <EuiBreadcrumbs
              data-test-subj="cwAlarmFlyoutTrail"
              truncate
              max={5}
              responsive={false}
              aria-label={i18n.translate('observability.alerting.cloudwatch.trailAria', {
                defaultMessage: 'Alarms opened in this flyout',
              })}
              breadcrumbs={stack.map((entry, i) => ({
                text: entry.name,
                ...(i < stack.length - 1 ? { onClick: () => goTo(i) } : {}),
              }))}
            />
            <EuiSpacer size="xs" />
          </>
        )}
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="flexStart" gutterSize="s">
          <EuiFlexItem>
            <EuiTitle size="m">
              {/* Alarm names can be 255 chars with no spaces — force wrapping
                  so the title never overflows the flyout header. */}
              <h2 id="cwAlarmFlyoutTitle" style={{ overflowWrap: 'anywhere' }}>
                {displayName}
              </h2>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="xs" responsive={false} wrap>
              {state && (
                <EuiFlexItem grow={false}>
                  <EuiHealth color={STATE_HEALTH[state]}>
                    {state === 'ALARM'
                      ? getStateLabel('active')
                      : state === 'INSUFFICIENT_DATA'
                        ? getStateLabel('insufficient_data')
                        : getMonitorStateLabel('ok')}
                  </EuiHealth>
                </EuiFlexItem>
              )}
              <EuiFlexItem grow={false}>
                <EuiBadge color={SEVERITY_COLORS[severity] || 'default'}>
                  {getSeverityLabel(severity)}
                </EuiBadge>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <AlarmTypeBadge alarmType={alarmType} />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBetaBadge
                  label={i18n.translate('observability.alerting.cloudwatch.experimentalBadge', {
                    defaultMessage: 'Experimental',
                  })}
                  tooltipContent={i18n.translate(
                    'observability.alerting.cloudwatch.experimentalTooltip',
                    {
                      defaultMessage:
                        'CloudWatch alarms support is experimental and may change or be removed in a future release.',
                    }
                  )}
                />
              </EuiFlexItem>
              {/* The one place the flyout says it's read-only (no edit, ack or mute here). */}
              <EuiFlexItem grow={false}>
                <EuiToolTip
                  content={i18n.translate('observability.alerting.cloudwatch.readOnlyTooltip', {
                    defaultMessage: 'CloudWatch alarms are read-only in this view.',
                  })}
                >
                  <EuiBadge color="hollow" data-test-subj="cwAlarmReadOnlyBadge">
                    {i18n.translate('observability.alerting.cloudwatch.readOnly', {
                      defaultMessage: 'Read-only',
                    })}
                  </EuiBadge>
                </EuiToolTip>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        {headerState}
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {isLoading && <EuiLoadingContent lines={6} />}

        {!isLoading && error && (
          <>
            {/* Prefer the structured classification when the server attached
                one: it names the failure class (expired session, missing
                permission, unreachable region, …) with remediation and safe
                diagnostics. Fall back to the generic callout otherwise. */}
            {classifiedError ? (
              <ClassifiedErrorCallout
                error={classifiedError}
                dataTestSubj="cwAlarmDetailClassifiedError"
              />
            ) : (
              <EuiCallOut
                color="danger"
                iconType="alert"
                title={i18n.translate('observability.alerting.cloudwatch.loadErrorTitle', {
                  defaultMessage: 'Could not load alarm detail from CloudWatch',
                })}
              >
                <p>{error.message}</p>
                <p>
                  {i18n.translate('observability.alerting.cloudwatch.loadErrorHint', {
                    defaultMessage:
                      'Check that your AWS credentials allow cloudwatch:DescribeAlarms, then reopen this alarm.',
                  })}
                </p>
              </EuiCallOut>
            )}
            <EuiSpacer size="s" />
            <EuiButton
              size="s"
              iconType="refresh"
              onClick={retry}
              data-test-subj="cwAlarmDetailRetry"
            >
              {i18n.translate('observability.alerting.cloudwatch.loadErrorRetry', {
                defaultMessage: 'Retry',
              })}
            </EuiButton>
          </>
        )}

        {!isLoading && detail && (
          <>
            {(detail.summary || detail.causedBy || detail.alarm.stateUpdatedTimestamp) && (
              <>
                <EuiText size="s">
                  {detail.summary && <p>{localizeTimestampsInText(detail.summary)}</p>}
                  {detail.alarm.stateUpdatedTimestamp && (
                    <p data-test-subj="cwAlarmDetailLastChange">
                      <EuiTextColor color="subdued">
                        {i18n.translate('observability.alerting.cloudwatch.lastStateChange', {
                          defaultMessage: 'Last state change {time}',
                          values: { time: formatTimestamp(detail.alarm.stateUpdatedTimestamp) },
                        })}
                      </EuiTextColor>
                    </p>
                  )}
                  {/* A composite's cause, by name and as a link, instead of the raw ARN in
                      CloudWatch's reason text. */}
                  {detail.causedBy && (
                    <p data-test-subj="cwAlarmDetailCausedBy">
                      {i18n.translate('observability.alerting.cloudwatch.causedBy', {
                        defaultMessage: 'Caused by:',
                      })}{' '}
                      <EuiLink
                        onClick={() => openAlarm(detail.causedBy!)}
                        data-test-subj="cwAlarmDetailCausedByLink"
                      >
                        {detail.causedBy.alarmName}
                      </EuiLink>
                    </p>
                  )}
                </EuiText>
                <EuiSpacer size="m" />
              </>
            )}

            {windowRejected && (
              <>
                <EuiCallOut
                  size="s"
                  iconType="iInCircle"
                  data-test-subj="cwAlarmDetailWindowRejected"
                  title={i18n.translate('observability.alerting.cloudwatch.windowRejected', {
                    defaultMessage:
                      "The selected time range couldn't be used, so the metric preview shows recent data.",
                  })}
                />
                <EuiSpacer size="m" />
              </>
            )}

            {detail.historyAccessDenied && (
              <>
                <EuiCallOut
                  color="warning"
                  size="s"
                  iconType="lock"
                  title={i18n.translate('observability.alerting.cloudwatch.partialPermission', {
                    defaultMessage:
                      "History can't be read with the current role (cloudwatch:DescribeAlarmHistory denied). Other sections are unaffected.",
                  })}
                />
                <EuiSpacer size="m" />
              </>
            )}

            {alarmType === 'composite'
              ? renderCompositeBody(detail, dsId, alarmName, openAlarm, timeWindow)
              : renderMetricBody(detail, openAlarm, timeWindow)}
          </>
        )}
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};

// ============================================================================
// Body renderers
// ============================================================================

export function renderStateHistory(
  history: CloudWatchAlarmHistoryItem[] | undefined,
  timeWindow: AlarmTimeWindow,
  lastChange?: string
): React.ReactNode {
  const stateUpdates = (history || []).filter(
    (h) =>
      (h.historyItemType === 'StateUpdate' || h.oldState || h.newState) &&
      isInWindow(h.timestamp, timeWindow)
  );
  if (stateUpdates.length === 0) {
    return (
      <EuiTextColor color="subdued" data-test-subj="cwAlarmHistoryNoChanges">
        {noChangesInWindowMessage(timeWindow, lastChange)}
      </EuiTextColor>
    );
  }
  return (
    <div>
      {stateUpdates.slice(0, 20).map((h, i) => (
        <div key={i} style={{ marginBottom: 6 }}>
          <EuiFlexGroup gutterSize="s" responsive={false} wrap alignItems="baseline">
            <EuiFlexItem grow={false} style={{ minWidth: 150 }}>
              <EuiTextColor color="subdued">{formatTimestamp(h.timestamp)}</EuiTextColor>
            </EuiFlexItem>
            {(h.oldState || h.newState) && (
              <EuiFlexItem grow={false}>
                <strong>
                  {h.oldState ? getCloudWatchStateLabel(h.oldState) : '—'} →{' '}
                  {h.newState ? getCloudWatchStateLabel(h.newState) : '—'}
                </strong>
              </EuiFlexItem>
            )}
            {h.summary && (
              <EuiFlexItem>
                <EuiText size="s">{localizeTimestampsInText(h.summary)}</EuiText>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </div>
      ))}
    </div>
  );
}

function renderAlarmActions(alarm: CloudWatchAlarm): React.ReactNode {
  // SNS topic ARNs are long unbroken strings — force them to wrap so they
  // never overflow the flyout's description-list column.
  const arn = (a: string): React.ReactElement => (
    <span style={{ overflowWrap: 'anywhere' }}>{a}</span>
  );
  const rows: Array<{ title: string; description: React.ReactElement }> = [];
  (alarm.alarmActions || []).forEach((a) => rows.push({ title: 'On ALARM', description: arn(a) }));
  (alarm.okActions || []).forEach((a) => rows.push({ title: 'On OK', description: arn(a) }));
  (alarm.insufficientDataActions || []).forEach((a) =>
    rows.push({ title: 'On INSUFFICIENT_DATA', description: arn(a) })
  );
  if (rows.length === 0) {
    return (
      <EuiTextColor color="subdued">
        {i18n.translate('observability.alerting.cloudwatch.noActions', {
          defaultMessage: 'No notification actions configured.',
        })}
      </EuiTextColor>
    );
  }
  // Cast: the plugin-local and OSD-root @types/react disagree on ReactNode,
  // so EUI's NonNullable<ReactNode> rejects our (non-null) elements.
  return (
    <EuiDescriptionList
      type="column"
      compressed
      listItems={rows as React.ComponentProps<typeof EuiDescriptionList>['listItems']}
    />
  );
}

function renderMetricBody(
  detail: import('../../../common/types/alerting').CloudWatchAlarmDetail,
  onOpen: OpenAlarmFn,
  timeWindow: AlarmTimeWindow
) {
  const { alarm, metricPreview } = detail;
  const conditions = [
    {
      title: i18n.translate('observability.alerting.cloudwatch.namespaceMetric', {
        defaultMessage: 'Namespace / metric',
      }),
      description: `${alarm.namespace || '—'} · ${alarm.metricName || '—'}`,
    },
    {
      title: i18n.translate('observability.alerting.cloudwatch.dimensions', {
        defaultMessage: 'Dimensions',
      }),
      description: (alarm.dimensions || []).map((d) => `${d.name} = ${d.value}`).join(', ') || '—',
    },
    {
      title: i18n.translate('observability.alerting.cloudwatch.statisticPeriod', {
        defaultMessage: 'Statistic · period',
      }),
      description: `${alarm.statistic || alarm.extendedStatistic || '—'} · ${
        alarm.period ? `${alarm.period}s` : '—'
      }`,
    },
    {
      title: i18n.translate('observability.alerting.cloudwatch.condition', {
        defaultMessage: 'Condition',
      }),
      description: `${alarm.comparisonOperator || '—'} ${alarm.threshold != null ? alarm.threshold : ''}`,
    },
    {
      title: i18n.translate('observability.alerting.cloudwatch.datapointsToAlarm', {
        defaultMessage: 'Datapoints to alarm',
      }),
      description:
        alarm.datapointsToAlarm && alarm.evaluationPeriods
          ? `${alarm.datapointsToAlarm} of ${alarm.evaluationPeriods} evaluation periods`
          : '—',
    },
    {
      title: i18n.translate('observability.alerting.cloudwatch.missingData', {
        defaultMessage: 'Missing data',
      }),
      description: alarm.treatMissingData || '—',
    },
  ];

  return (
    <>
      {/* Metric preview always renders for metric alarms so the visualization
          is present; when the window has no samples we show an empty state. */}
      <SectionTitle>
        {i18n.translate('observability.alerting.cloudwatch.metricPreview', {
          defaultMessage: 'Metric preview',
        })}
      </SectionTitle>
      <EuiSpacer size="s" />
      {metricPreview && metricPreview.points.length > 0 ? (
        <EchartsRender spec={buildMetricPreviewSpec(metricPreview)} height={220} />
      ) : (
        <EuiTextColor color="subdued" data-test-subj="cwAlarmNoMetricData">
          {i18n.translate('observability.alerting.cloudwatch.noMetricData', {
            defaultMessage: 'No metric data in {window}.',
            values: { window: timeWindow.label },
          })}
        </EuiTextColor>
      )}
      <EuiHorizontalRule margin="m" />

      <SectionTitle>
        {i18n.translate('observability.alerting.cloudwatch.conditionsEvaluation', {
          defaultMessage: 'Conditions & evaluation',
        })}
      </SectionTitle>
      <EuiSpacer size="s" />
      <EuiDescriptionList type="column" compressed listItems={conditions} />
      <EuiHorizontalRule margin="m" />

      <SectionTitle>
        {i18n.translate('observability.alerting.cloudwatch.stateHistory', {
          defaultMessage: 'State history',
        })}
      </SectionTitle>
      <EuiSpacer size="s" />
      {renderStateHistory(detail.history, timeWindow, detail.alarm.stateUpdatedTimestamp)}
      <EuiHorizontalRule margin="m" />

      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <SectionTitle>
            {i18n.translate('observability.alerting.cloudwatch.alarmActions', {
              defaultMessage: 'Alarm actions',
            })}
          </SectionTitle>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      {renderAlarmActions(alarm)}

      {detail.relationships && detail.relationships.parents.length > 0 && (
        <>
          <EuiHorizontalRule margin="m" />
          <SectionTitle>
            {i18n.translate('observability.alerting.cloudwatch.relatedAlarms', {
              defaultMessage: 'Related alarms',
            })}
          </SectionTitle>
          <EuiSpacer size="s" />
          {detail.relationships.parents.map((p, i) => (
            <div key={`${p.alarmName}-${i}`} style={{ marginBottom: 4 }}>
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
                <EuiFlexItem grow={false}>
                  <EuiBadge color="hollow">
                    {i18n.translate('observability.alerting.cloudwatch.parent', {
                      defaultMessage: 'parent',
                    })}
                  </EuiBadge>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <AlarmTypeBadge alarmType="composite" />
                </EuiFlexItem>
                <EuiFlexItem grow={false} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <EuiLink onClick={() => onOpen(p)}>{p.alarmName}</EuiLink>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiHealth color={stateHealthColor(p.stateValue)} />
                </EuiFlexItem>
              </EuiFlexGroup>
            </div>
          ))}
        </>
      )}
    </>
  );
}

function renderCompositeBody(
  detail: import('../../../common/types/alerting').CloudWatchAlarmDetail,
  dsId: string,
  alarmName: string,
  onOpen: OpenAlarmFn,
  timeWindow: AlarmTimeWindow
) {
  const { alarm } = detail;
  return (
    <>
      <SectionTitle>
        {i18n.translate('observability.alerting.cloudwatch.stateTimeline', {
          defaultMessage: 'State timeline',
        })}
      </SectionTitle>
      <EuiSpacer size="s" />
      <StateTimeline
        history={detail.history}
        timeWindow={timeWindow}
        currentState={alarm.stateValue}
        lastChange={alarm.stateUpdatedTimestamp}
      />
      <EuiHorizontalRule margin="m" />

      <SectionTitle>
        {i18n.translate('observability.alerting.cloudwatch.ruleExpression', {
          defaultMessage: 'Rule expression',
        })}
      </SectionTitle>
      <EuiSpacer size="s" />
      {alarm.alarmRule ? (
        <EuiCodeBlock language="text" paddingSize="s" fontSize="s" isCopyable>
          {alarm.alarmRule}
        </EuiCodeBlock>
      ) : (
        <EuiTextColor color="subdued">
          {i18n.translate('observability.alerting.cloudwatch.noRule', {
            defaultMessage: 'No rule expression available.',
          })}
        </EuiTextColor>
      )}
      <EuiHorizontalRule margin="m" />

      <SectionTitle>
        {/* Same name as the metric alarm's section: it's the same tree. */}
        {i18n.translate('observability.alerting.cloudwatch.relatedAlarms', {
          defaultMessage: 'Related alarms',
        })}
      </SectionTitle>
      <EuiSpacer size="s" />
      {detail.relationships ? (
        <RelationshipsSection
          dsId={dsId}
          alarmName={alarmName}
          graph={detail.relationships}
          onOpen={onOpen}
        />
      ) : (
        <EuiTextColor color="subdued">
          {i18n.translate('observability.alerting.cloudwatch.noRelationships', {
            defaultMessage: 'No related alarms.',
          })}
        </EuiTextColor>
      )}
      <EuiHorizontalRule margin="m" />

      <SectionTitle>
        {i18n.translate('observability.alerting.cloudwatch.stateHistory', {
          defaultMessage: 'State history',
        })}
      </SectionTitle>
      <EuiSpacer size="s" />
      {renderStateHistory(detail.history, timeWindow, detail.alarm.stateUpdatedTimestamp)}
    </>
  );
}

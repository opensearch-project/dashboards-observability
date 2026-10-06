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
 * (`cloudWatchSeverity`). Used for the header badge when navigating to a
 * related alarm whose severity wasn't carried on the originating row.
 */
function deriveSeverity(alarm: CloudWatchAlarm): UnifiedAlertSeverity {
  const hint = `${alarm.alarmName} ${alarm.description || ''}`.toLowerCase();
  if (/\bcritical\b|\bsev1\b|\bsev-1\b|\bp0\b|\bpage\b/.test(hint)) return 'critical';
  if (alarm.stateValue === 'ALARM') return alarm.alarmType === 'composite' ? 'critical' : 'medium';
  if (/\bwarn/.test(hint)) return 'medium';
  return 'info';
}

function formatTs(ts?: string): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toISOString().replace('T', ' ').replace(/\..+/, ' UTC');
}

// ============================================================================
// Metric preview chart
// ============================================================================

const METRIC_LINE_COLOR = '#006BB4';
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
              formatter: `threshold ${preview.threshold}`,
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
      // Label the first band "ALARM" like the proposal; keep the rest unlabeled.
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
      data: [seriesName, 'Threshold', 'State band'],
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
        name: 'Threshold',
        type: 'line',
        data: [],
        lineStyle: { color: STATE_HEX.ALARM, type: 'dashed' },
        itemStyle: { color: STATE_HEX.ALARM },
      },
      {
        name: 'State band',
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
              <EuiBadge color={node.alarmType === 'composite' ? '#E0D6FB' : 'hollow'}>
                {node.alarmType === 'composite' ? 'Composite' : 'Metric'}
              </EuiBadge>
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
                  defaultMessage: '{count} children',
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
              defaultMessage: 'Load 2 deeper levels…',
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

const StateTimeline: React.FC<{ history?: CloudWatchAlarmHistoryItem[] }> = ({ history }) => {
  const now = Date.now();
  const windowStart = now - 24 * 60 * 60 * 1000;
  const segments = useMemo(() => {
    const updates = (history || [])
      .filter((h) => h.historyItemType === 'StateUpdate' && (h.newState || h.oldState))
      .map((h) => ({
        ts: new Date(h.timestamp).getTime(),
        oldState: h.oldState,
        newState: h.newState,
      }))
      .filter((u) => Number.isFinite(u.ts))
      .sort((a, b) => a.ts - b.ts);
    if (updates.length === 0)
      return [] as Array<{ start: number; end: number; state: CloudWatchAlarmState }>;
    const segs: Array<{ start: number; end: number; state: CloudWatchAlarmState }> = [];
    // Backfill from the window start using the first transition's prior state
    // (`oldState`) so the band spans the whole 24h rather than a sliver at the
    // right — CloudWatch only records transitions at real evaluation times.
    const firstPrior = updates[0].oldState || updates[0].newState;
    if (firstPrior && updates[0].ts > windowStart) {
      segs.push({ start: windowStart, end: updates[0].ts, state: firstPrior });
    }
    for (let i = 0; i < updates.length; i++) {
      const state = updates[i].newState || updates[i].oldState;
      if (!state) continue;
      const start = Math.max(updates[i].ts, windowStart);
      const end = i + 1 < updates.length ? updates[i + 1].ts : now;
      if (end <= windowStart) continue;
      segs.push({ start, end: Math.min(end, now), state });
    }
    return segs;
  }, [history, now, windowStart]);

  if (segments.length === 0) {
    return (
      <EuiTextColor color="subdued">
        {i18n.translate('observability.alerting.cloudwatch.noTimeline', {
          defaultMessage: 'No state changes recorded in the selected window.',
        })}
      </EuiTextColor>
    );
  }
  const total = now - windowStart;
  // Render the timeline as an ECharts horizontal stacked bar (one segment per
  // state interval) so it uses the same viz engine as the rest of the plugin.
  const spec: echarts.EChartsOption = {
    grid: { left: 0, right: 0, top: 2, bottom: 2 },
    tooltip: {
      trigger: 'item',
      // Cast: echarts' TooltipOption formatter typing rejects this narrower
      // (and safe) param shape; only `seriesName` is read.
      formatter: ((p: { seriesName?: string }) =>
        p.seriesName || '') as unknown as echarts.TooltipComponentOption['formatter'],
    },
    xAxis: { type: 'value', min: 0, max: total, show: false },
    yAxis: { type: 'category', data: [''], show: false },
    series: segments.map((s) => ({
      name: s.state,
      type: 'bar' as const,
      stack: 'timeline',
      barWidth: 16,
      data: [s.end - s.start],
      itemStyle: { color: STATE_HEX[s.state] },
    })),
  };
  return (
    <div>
      <EchartsRender spec={spec} height={26} />
      <EuiFlexGroup justifyContent="spaceBetween" gutterSize="none">
        <EuiFlexItem grow={false}>
          <EuiTextColor color="subdued" style={{ fontSize: 11 }}>
            -24h
          </EuiTextColor>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiTextColor color="subdued" style={{ fontSize: 11 }}>
            now
          </EuiTextColor>
        </EuiFlexItem>
      </EuiFlexGroup>
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
}) => {
  const dsId = rule.datasourceId;

  // In-flyout navigation stack. Clicking a related alarm (parent/child) pushes
  // it here and re-fetches its detail, so users move between linked alarms
  // without leaving the unified view (no external CloudWatch links). The first
  // entry is the alarm the flyout opened on.
  const [stack, setStack] = useState<CloudWatchAlarmFlyoutRow[]>([rule]);
  const current = stack[stack.length - 1];
  const alarmName = current.id;
  const { detail, isLoading, error, classifiedError, retry } = useCloudWatchAlarmDetail({
    dsId,
    alarmName,
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
  const goBack = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
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
          {state ? <EuiBadge color={STATE_HEALTH[state]}>{state}</EuiBadge> : '—'}
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
            <EuiButtonEmpty size="xs" iconType="arrowLeft" flush="left" onClick={goBack}>
              {i18n.translate('observability.alerting.cloudwatch.back', {
                defaultMessage: 'Back to {name}',
                values: { name: stack[stack.length - 2].name },
              })}
            </EuiButtonEmpty>
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
                      ? 'active'
                      : state === 'INSUFFICIENT_DATA'
                        ? 'insufficient data'
                        : 'ok'}
                  </EuiHealth>
                </EuiFlexItem>
              )}
              <EuiFlexItem grow={false}>
                <EuiBadge color={SEVERITY_COLORS[severity] || 'default'}>{severity}</EuiBadge>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color={alarmType === 'composite' ? '#E0D6FB' : 'hollow'}>
                  {alarmType === 'composite' ? 'Composite' : 'Metric'}
                </EuiBadge>
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
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        {headerState}
        <EuiSpacer size="s" />
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiToolTip
              content={i18n.translate('observability.alerting.cloudwatch.readOnlyTooltip', {
                defaultMessage: 'CloudWatch alarms are read-only in this view.',
              })}
            >
              <EuiBadge color="hollow">
                {i18n.translate('observability.alerting.cloudwatch.readOnly', {
                  defaultMessage: 'Read-only',
                })}
              </EuiBadge>
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
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
                      'Check that the server has valid AWS credentials and cloudwatch:DescribeAlarms permission, then reopen this alarm.',
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
            {detail.summary && (
              <>
                <EuiText size="s">
                  <p>{detail.summary}</p>
                </EuiText>
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
              ? renderCompositeBody(detail, dsId, alarmName, openAlarm)
              : renderMetricBody(detail, openAlarm)}
          </>
        )}
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};

// ============================================================================
// Body renderers
// ============================================================================

function renderStateHistory(history?: CloudWatchAlarmHistoryItem[]): React.ReactNode {
  const stateUpdates = (history || []).filter(
    (h) => h.historyItemType === 'StateUpdate' || h.oldState || h.newState
  );
  if (stateUpdates.length === 0) {
    return (
      <EuiTextColor color="subdued">
        {i18n.translate('observability.alerting.cloudwatch.noHistory', {
          defaultMessage: 'No state changes recorded in the selected window.',
        })}
      </EuiTextColor>
    );
  }
  return (
    <div>
      {stateUpdates.slice(0, 20).map((h, i) => (
        <div key={i} style={{ marginBottom: 6 }}>
          <EuiFlexGroup gutterSize="s" responsive={false} wrap alignItems="baseline">
            <EuiFlexItem grow={false} style={{ minWidth: 150 }}>
              <EuiTextColor color="subdued">{formatTs(h.timestamp)}</EuiTextColor>
            </EuiFlexItem>
            {(h.oldState || h.newState) && (
              <EuiFlexItem grow={false}>
                <strong>
                  {h.oldState || '—'} → {h.newState || '—'}
                </strong>
              </EuiFlexItem>
            )}
            {h.summary && (
              <EuiFlexItem>
                <EuiText size="s">{h.summary}</EuiText>
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
  onOpen: OpenAlarmFn
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
        <EuiTextColor color="subdued">
          {i18n.translate('observability.alerting.cloudwatch.noMetricData', {
            defaultMessage: 'No metric data reported in the selected window.',
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
      {renderStateHistory(detail.history)}
      <EuiHorizontalRule margin="m" />

      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <SectionTitle>
            {i18n.translate('observability.alerting.cloudwatch.alarmActions', {
              defaultMessage: 'Alarm actions',
            })}
          </SectionTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color="hollow">
            {i18n.translate('observability.alerting.cloudwatch.readOnly', {
              defaultMessage: 'Read-only',
            })}
          </EuiBadge>
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
                  <EuiBadge color="#E0D6FB">Composite</EuiBadge>
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
  onOpen: OpenAlarmFn
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
      <StateTimeline history={detail.history} />
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
        {i18n.translate('observability.alerting.cloudwatch.relationships', {
          defaultMessage: 'Relationships',
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
      {renderStateHistory(detail.history)}
    </>
  );
}

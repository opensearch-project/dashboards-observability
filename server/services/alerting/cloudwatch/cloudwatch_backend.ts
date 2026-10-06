/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CloudWatch alerting backend.
 *
 * Parallels `DirectQueryPrometheusBackend`, but instead of routing through the
 * OSD scoped cluster client it delegates to a `CloudWatchAlarmSource` (the SDK
 * seam). All CloudWatch-specific logic that isn't a raw API call lives here and
 * is pure over the source — the composite relationships tree, the metric-preview
 * band computation, and graceful partial-permission handling — so it is
 * unit-testable without AWS and unaffected when the source is swapped.
 */
import type {
  CloudWatchAlarm,
  CloudWatchAlarmDetail,
  CloudWatchAlarmHistoryItem,
  CloudWatchMetricPreview,
  CloudWatchRelationshipGraph,
  CloudWatchRelationshipNode,
  Datasource,
  Logger,
} from '../../../../common/types/alerting';
import { CloudWatchAlarmSource, CloudWatchCredentialsError } from './types';
import { createInternalError } from '../errors';

/** Initial descendant depth rendered before the "load deeper" continuation. */
const DEFAULT_RELATIONSHIP_DEPTH = 2;
/** Hard cap so a pathological rule graph can't expand unbounded. */
const MAX_RELATIONSHIP_DEPTH = 8;

/** Recognize AWS "access denied" so history/metric sections degrade to partial. */
function isAccessDenied(err: unknown): boolean {
  const name = (err as { name?: string })?.name || '';
  const msg = (err as { message?: string })?.message || '';
  return (
    name === 'AccessDenied' ||
    name === 'AccessDeniedException' ||
    /access ?denied|not authorized|authorization/i.test(msg)
  );
}

/**
 * Extract the alarm names referenced by a composite alarm's `AlarmRule`.
 * Handles `ALARM("name")`, `OK(name)`, `INSUFFICIENT_DATA(arn:...:alarm:name)`.
 * ARNs are reduced to the bare alarm name (segment after `:alarm:`).
 */
export function parseAlarmRuleReferences(rule?: string): string[] {
  if (!rule) return [];
  const refs: string[] = [];
  const re = /(?:ALARM|OK|INSUFFICIENT_DATA)\s*\(\s*("?)([^")]+)\1\s*\)/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(rule)) !== null) {
    let ref = match[2].trim();
    const arnIdx = ref.indexOf(':alarm:');
    if (arnIdx >= 0) ref = ref.slice(arnIdx + ':alarm:'.length);
    if (ref) refs.push(ref);
  }
  return refs;
}

export class CloudWatchBackend {
  readonly type = 'cloudwatch' as const;

  constructor(
    private readonly logger: Logger,
    private readonly source: CloudWatchAlarmSource
  ) {}

  /** Wrap a source call, mapping credential/other failures to typed errors. */
  private async guarded<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (err) {
      if (err instanceof CloudWatchCredentialsError) {
        // Rethrow as-is: the fan-out records it as a per-datasource warning.
        throw err;
      }
      this.logger.warn(`CloudWatch source call failed: ${(err as Error)?.message ?? err}`);
      throw err;
    }
  }

  /** List all alarms for a CloudWatch datasource, account-id enriched. */
  async describeAlarms(ds: Datasource): Promise<CloudWatchAlarm[]> {
    const [alarms, identity] = await Promise.all([
      this.guarded(() => this.source.describeAlarms({ region: ds.region })),
      this.getIdentitySafe(ds),
    ]);
    return alarms.map((a) => ({
      ...a,
      accountId: a.accountId || identity?.accountId,
      region: a.region || identity?.region || ds.region,
    }));
  }

  /** List alarms currently in ALARM state (for the Alerts tab). */
  async describeAlarmingAlarms(ds: Datasource): Promise<CloudWatchAlarm[]> {
    const [alarms, identity] = await Promise.all([
      this.guarded(() => this.source.describeAlarms({ region: ds.region, stateValue: 'ALARM' })),
      this.getIdentitySafe(ds),
    ]);
    return alarms.map((a) => ({
      ...a,
      accountId: a.accountId || identity?.accountId,
      region: a.region || identity?.region || ds.region,
    }));
  }

  private async getIdentitySafe(
    ds: Datasource
  ): Promise<{ accountId: string; region: string } | undefined> {
    try {
      return await this.source.getCallerIdentity(ds.region);
    } catch (err) {
      // Identity is best-effort labeling; a failure here shouldn't blank rows.
      this.logger.debug(`CloudWatch getCallerIdentity failed: ${(err as Error)?.message ?? err}`);
      return undefined;
    }
  }

  /**
   * Assemble the full alarm-detail payload for the flyout. Each section loads
   * independently and degrades gracefully: a history AccessDenied sets
   * `historyAccessDenied` (and marks the alarm `partialAccess`) rather than
   * failing the whole flyout; a missing metric preview is simply absent.
   */
  async getAlarmDetail(
    ds: Datasource,
    alarmName: string,
    opts: { startTimeMs?: number; endTimeMs?: number } = {}
  ): Promise<CloudWatchAlarmDetail | null> {
    const alarm = await this.guarded(() => this.source.describeAlarm(alarmName, ds.region));
    if (!alarm) return null;
    const identity = await this.getIdentitySafe(ds);
    alarm.accountId = alarm.accountId || identity?.accountId;
    alarm.region = alarm.region || identity?.region || ds.region;

    const endTimeMs = opts.endTimeMs ?? Date.now();
    const startTimeMs = opts.startTimeMs ?? endTimeMs - 3 * 60 * 60 * 1000; // 3h default

    // History (partial-permission aware).
    let history: CloudWatchAlarmHistoryItem[] | undefined;
    let historyAccessDenied = false;
    try {
      history = await this.source.describeAlarmHistory(alarmName, ds.region);
    } catch (err) {
      if (isAccessDenied(err)) {
        historyAccessDenied = true;
        alarm.partialAccess = true;
      } else {
        this.logger.debug(
          `CloudWatch alarm history failed for ${alarmName}: ${(err as Error)?.message ?? err}`
        );
      }
    }

    // Metric preview (metric alarms only).
    let metricPreview: CloudWatchMetricPreview | undefined;
    if (alarm.alarmType === 'metric' && alarm.namespace && alarm.metricName) {
      try {
        const query = {
          region: ds.region,
          namespace: alarm.namespace,
          metricName: alarm.metricName,
          dimensions: alarm.dimensions,
          statistic: alarm.statistic,
          extendedStatistic: alarm.extendedStatistic,
          period: alarm.period || 60,
          startTimeMs,
          endTimeMs,
        };
        let points = await this.source.getMetricData(query);
        // If the primary window has no samples (e.g. the metric only reported
        // earlier), widen to the last 24h so the preview still shows the
        // series rather than rendering an empty chart.
        if (points.length === 0) {
          points = await this.source.getMetricData({
            ...query,
            startTimeMs: endTimeMs - 24 * 60 * 60 * 1000,
          });
        }
        const stat = alarm.statistic || alarm.extendedStatistic || 'Average';
        const periodLabel = alarm.period ? `, ${alarm.period}s` : '';
        // ALARM band: shade where the series actually breaches the threshold so
        // the band aligns with the visible breach (matches the proposal). Fall
        // back to reconstructing it from state history when there's no numeric
        // threshold (e.g. anomaly-detection alarms).
        const alarmBands =
          computeThresholdBreachBands(points, alarm.threshold, alarm.comparisonOperator) ||
          computeAlarmBands(history, startTimeMs, endTimeMs);
        metricPreview = {
          label: `${alarm.metricName} (${stat}${periodLabel})`,
          points,
          threshold: alarm.threshold,
          comparisonOperator: alarm.comparisonOperator,
          alarmBands,
        };
      } catch (err) {
        if (isAccessDenied(err)) alarm.partialAccess = true;
        this.logger.debug(
          `CloudWatch metric preview failed for ${alarmName}: ${(err as Error)?.message ?? err}`
        );
      }
    }

    // Relationships (composite alarms; metric alarms may still have parents).
    let relationships: CloudWatchRelationshipGraph | undefined;
    try {
      relationships = await this.buildRelationships(ds, alarm, DEFAULT_RELATIONSHIP_DEPTH);
    } catch (err) {
      this.logger.debug(
        `CloudWatch relationships failed for ${alarmName}: ${(err as Error)?.message ?? err}`
      );
    }

    return {
      alarm,
      summary: buildSummary(alarm, history),
      history,
      historyAccessDenied,
      metricPreview,
      relationships,
    };
  }

  /** Alarm history for one alarm (used by the lazy history route). */
  async getAlarmHistory(
    ds: Datasource,
    alarmName: string
  ): Promise<{ items: CloudWatchAlarmHistoryItem[]; accessDenied: boolean }> {
    try {
      const items = await this.source.describeAlarmHistory(alarmName, ds.region);
      return { items, accessDenied: false };
    } catch (err) {
      if (isAccessDenied(err)) return { items: [], accessDenied: true };
      throw createInternalError(
        `Failed to read CloudWatch alarm history: ${(err as Error)?.message ?? err}`
      );
    }
  }

  /**
   * Build the parents + descendant tree for an alarm. Fetches the full alarm
   * list once and traverses purely in memory so the graph walk is cycle-safe
   * and doesn't issue a request per node.
   *
   * - Cycle: a name already on the current path terminates with `cycle: true`.
   * - Tombstone: a referenced name not present in the map → `deleted: true`.
   * - Depth: beyond `depth`, a composite with children is marked `truncated`.
   */
  async buildRelationships(
    ds: Datasource,
    alarm: CloudWatchAlarm,
    depth: number = DEFAULT_RELATIONSHIP_DEPTH
  ): Promise<CloudWatchRelationshipGraph> {
    const cappedDepth = Math.min(Math.max(depth, 1), MAX_RELATIONSHIP_DEPTH);
    const all = await this.guarded(() => this.source.describeAlarms({ region: ds.region }));
    const byName = new Map<string, CloudWatchAlarm>();
    for (const a of all) byName.set(a.alarmName, a);
    // Ensure the focal alarm is present even if the list was filtered/capped.
    if (!byName.has(alarm.alarmName)) byName.set(alarm.alarmName, alarm);

    let maxDepthReached = false;

    const makeNode = (
      name: string,
      role: CloudWatchRelationshipNode['role'],
      remainingDepth: number,
      path: Set<string>
    ): CloudWatchRelationshipNode => {
      const found = byName.get(name);
      if (!found) {
        return { alarmName: name, role, deleted: true };
      }
      const childRefs =
        found.alarmType === 'composite' ? parseAlarmRuleReferences(found.alarmRule) : [];
      const node: CloudWatchRelationshipNode = {
        alarmName: found.alarmName,
        alarmType: found.alarmType,
        stateValue: found.stateValue,
        role,
        childCount: childRefs.length || undefined,
      };
      if (childRefs.length === 0) return node;
      if (path.has(name)) {
        node.cycle = true;
        return node;
      }
      if (remainingDepth <= 0) {
        node.truncated = true;
        maxDepthReached = true;
        return node;
      }
      const nextPath = new Set(path);
      nextPath.add(name);
      node.children = childRefs.map((childName) =>
        makeNode(childName, 'child', remainingDepth - 1, nextPath)
      );
      return node;
    };

    const tree = makeNode(alarm.alarmName, 'self', cappedDepth, new Set());

    // Parents: composite alarms whose rule references this alarm.
    const parents: CloudWatchRelationshipNode[] = [];
    for (const candidate of all) {
      if (candidate.alarmType !== 'composite') continue;
      if (candidate.alarmName === alarm.alarmName) continue;
      const refs = parseAlarmRuleReferences(candidate.alarmRule);
      if (refs.includes(alarm.alarmName)) {
        parents.push({
          alarmName: candidate.alarmName,
          alarmType: 'composite',
          stateValue: candidate.stateValue,
          role: 'parent',
        });
      }
    }

    return { parents, tree, maxDepthReached };
  }
}

/**
 * Derive the [startMs, endMs] windows the alarm was in ALARM state from its
 * history, clamped to the preview window. Used to render the shaded ALARM band
 * on the metric-preview chart. Returns undefined when history is unavailable.
 */
export function computeAlarmBands(
  history: CloudWatchAlarmHistoryItem[] | undefined,
  windowStartMs: number,
  windowEndMs: number
): Array<[number, number]> | undefined {
  if (!history || history.length === 0) return undefined;
  // History arrives newest-first; walk oldest-first to reconstruct intervals.
  const stateUpdates = history
    .filter((h) => h.historyItemType === 'StateUpdate' && h.newState)
    .map((h) => ({ ts: new Date(h.timestamp).getTime(), state: h.newState! }))
    .filter((h) => Number.isFinite(h.ts))
    .sort((a, b) => a.ts - b.ts);
  if (stateUpdates.length === 0) return undefined;

  const bands: Array<[number, number]> = [];
  let alarmStart: number | null = null;
  for (const u of stateUpdates) {
    if (u.state === 'ALARM' && alarmStart === null) {
      alarmStart = u.ts;
    } else if (u.state !== 'ALARM' && alarmStart !== null) {
      bands.push([alarmStart, u.ts]);
      alarmStart = null;
    }
  }
  if (alarmStart !== null) bands.push([alarmStart, windowEndMs]);

  // Clamp to the preview window; drop bands fully outside it.
  const clamped: Array<[number, number]> = [];
  for (const [s, e] of bands) {
    const cs = Math.max(s, windowStartMs);
    const ce = Math.min(e, windowEndMs);
    if (ce > cs) clamped.push([cs, ce]);
  }
  return clamped.length > 0 ? clamped : undefined;
}

/**
 * Fallback ALARM band: contiguous windows where the series breaches the
 * threshold per the comparison operator. Used when state history yields no
 * bands, so the shaded region is always present when the metric is breaching.
 */
export function computeThresholdBreachBands(
  points: Array<{ timestamp: number; value: number }>,
  threshold?: number,
  comparisonOperator?: string
): Array<[number, number]> | undefined {
  if (threshold == null || !points || points.length === 0) return undefined;
  const breaches = (v: number): boolean => {
    switch (comparisonOperator) {
      case 'GreaterThanOrEqualToThreshold':
        return v >= threshold;
      case 'LessThanThreshold':
        return v < threshold;
      case 'LessThanOrEqualToThreshold':
        return v <= threshold;
      case 'GreaterThanThreshold':
      default:
        return v > threshold;
    }
  };
  const bands: Array<[number, number]> = [];
  let start: number | null = null;
  let prevTs = points[0].timestamp;
  for (const p of points) {
    if (breaches(p.value)) {
      if (start === null) start = p.timestamp;
    } else if (start !== null) {
      bands.push([start, prevTs]);
      start = null;
    }
    prevTs = p.timestamp;
  }
  if (start !== null) bands.push([start, points[points.length - 1].timestamp]);
  return bands.length > 0 ? bands : undefined;
}

/** One-line natural-language summary shown at the top of the flyout. */
function buildSummary(alarm: CloudWatchAlarm, history?: CloudWatchAlarmHistoryItem[]): string {
  const lastUpdate = alarm.stateUpdatedTimestamp
    ? new Date(alarm.stateUpdatedTimestamp).toISOString()
    : undefined;
  const reason = alarm.stateReason || history?.find((h) => h.summary)?.summary;
  const state =
    alarm.stateValue === 'ALARM'
      ? 'is in ALARM'
      : alarm.stateValue === 'INSUFFICIENT_DATA'
        ? 'has insufficient data'
        : 'is OK';
  const when = lastUpdate ? ` Last state change ${lastUpdate}.` : '';
  const because = reason ? ` ${reason}` : '';
  return `${alarm.alarmName} ${state}.${when}${because}`.trim();
}

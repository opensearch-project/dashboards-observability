/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CloudWatch alerting backend.
 *
 * Parallels `DirectQueryPrometheusBackend`, but instead of routing through the
 * OSD scoped cluster client it delegates to a `CloudWatchAlarmSource` (the deployment-provided
 * seam). All CloudWatch-specific logic that isn't a raw API call lives here and
 * is pure over the source — the composite relationships tree, the metric-preview
 * band computation, and graceful partial-permission handling — so it is
 * unit-testable without AWS and unaffected when the source is swapped.
 */
import type {
  CloudWatchAlarm,
  CloudWatchAlarmDetail,
  CloudWatchAlarmHistoryItem,
  CloudWatchAlarmList,
  CloudWatchAlarmState,
  CloudWatchCallOptions,
  CloudWatchMetricPreview,
  CloudWatchRelationshipGraph,
  CloudWatchRelationshipNode,
  CloudWatchStatesAt,
  Datasource,
  Logger,
} from '../../../../common/types/alerting';
import { CLOUDWATCH_HISTORY_RETENTION_MS } from '../../../../common/types/alerting';
import { CLOUDWATCH_ACCESS_DENIED_ERROR_NAMES } from '../../../../common/error';
import { CloudWatchAlarmSource, CloudWatchCredentialsError } from './types';

/** Initial descendant depth rendered before the "load deeper" continuation. */
const DEFAULT_RELATIONSHIP_DEPTH = 2;
/** Hard cap so a pathological rule graph can't expand unbounded. */
const MAX_RELATIONSHIP_DEPTH = 8;

/** Most alarm names `DescribeAlarms` accepts in one call. */
const ALARM_NAMES_PER_CALL = 100;

/**
 * Recognize an AWS "access denied" so history/metric sections degrade to partial. By error name
 * only (the classifier's set): message text is too loose, e.g. any mention of "authorization".
 */
function isAccessDenied(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  return typeof name === 'string' && CLOUDWATCH_ACCESS_DENIED_ERROR_NAMES.has(name);
}

/**
 * What a failure may say in a log line: the error name and HTTP status, never the message.
 * Provider messages can carry principal identifiers and account numbers.
 */
export function describeSourceError(err: unknown): string {
  const e = err as {
    name?: unknown;
    statusCode?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  const name = typeof e?.name === 'string' && e.name ? e.name : 'Error';
  const status = e?.$metadata?.httpStatusCode ?? e?.statusCode;
  return typeof status === 'number' ? `${name} (HTTP ${status})` : name;
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

const ALARM_ARN = /arn:aws[a-z-]*:cloudwatch:[^:\s]*:\d*:alarm:([^\s,;"']+)/;

/** The alarm name in an alarm ARN, or the input when it isn't one. */
const alarmNameFromArn = (ref: string): string => {
  const idx = ref.indexOf(':alarm:');
  return idx >= 0 ? ref.slice(idx + ':alarm:'.length) : ref;
};

/**
 * The child alarm that caused a composite alarm's current state: the first triggering alarm in
 * `StateReasonData`, else the alarm ARN in `StateReason`. Undefined for metric alarms and for
 * composites CloudWatch reports no cause for. State and type come from the relationships tree
 * when the child is in it.
 */
export function findCausingAlarm(
  alarm: CloudWatchAlarm,
  relationships?: CloudWatchRelationshipGraph
): CloudWatchAlarmDetail['causedBy'] {
  if (alarm.alarmType !== 'composite') return undefined;
  let name: string | undefined;
  if (alarm.stateReasonData) {
    try {
      const data = JSON.parse(alarm.stateReasonData);
      const arn = data?.triggeringAlarms?.[0]?.arn;
      if (typeof arn === 'string' && arn) name = alarmNameFromArn(arn);
    } catch {
      // Not JSON; fall back to the reason text.
    }
  }
  if (!name) name = alarm.stateReason ? ALARM_ARN.exec(alarm.stateReason)?.[1] : undefined;
  if (!name || name === alarm.alarmName) return undefined;
  const child = relationships?.tree.children?.find((node) => node.alarmName === name);
  return { alarmName: name, alarmType: child?.alarmType, stateValue: child?.stateValue };
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
      this.logger.warn(`CloudWatch source call failed: ${describeSourceError(err)}`);
      throw err;
    }
  }

  /**
   * List all alarms for a CloudWatch datasource, account-id enriched. `truncated` when the source
   * capped the list (the fan-out reports it on the datasource's status).
   */
  async describeAlarms(ds: Datasource, call?: CloudWatchCallOptions): Promise<CloudWatchAlarmList> {
    return this.listAlarms(ds, {}, call);
  }

  /** List alarms currently in ALARM state (for the Alerts tab). */
  async describeAlarmingAlarms(
    ds: Datasource,
    call?: CloudWatchCallOptions
  ): Promise<CloudWatchAlarmList> {
    return this.listAlarms(ds, { stateValue: 'ALARM' }, call);
  }

  private async listAlarms(
    ds: Datasource,
    options: { stateValue?: CloudWatchAlarmState },
    call?: CloudWatchCallOptions
  ): Promise<CloudWatchAlarmList> {
    const [list, identity] = await Promise.all([
      this.guarded(() => this.source.describeAlarms({ region: ds.region, ...options }, call)),
      this.getIdentitySafe(ds, call),
    ]);
    return {
      alarms: list.alarms.map((a) => ({
        ...a,
        accountId: a.accountId || identity?.accountId,
        region: a.region || identity?.region || ds.region,
      })),
      truncated: list.truncated,
    };
  }

  /**
   * Each alarm's state at `atMs`, from the changes since then: an alarm's first change after
   * `atMs` started from the state it was in at `atMs` (its `oldState`). Alarms that haven't
   * changed since are left out; they are still in their current state.
   */
  async getStatesAt(
    ds: Datasource,
    atMs: number,
    nowMs = Date.now(),
    call?: CloudWatchCallOptions
  ): Promise<CloudWatchStatesAt> {
    if (atMs >= nowMs) return { atMs, states: {}, complete: true };
    // Older than the history CloudWatch keeps: the first change we could read would be from the
    // retention edge, not right after `atMs`, so its prior state would be wrong. Say unknown.
    if (atMs < nowMs - CLOUDWATCH_HISTORY_RETENTION_MS) {
      return { atMs, states: {}, complete: true, beyondRetention: true };
    }
    const { changes, complete } = await this.guarded(() =>
      this.source.describeStateChanges(
        { region: ds.region, startTimeMs: atMs, endTimeMs: nowMs },
        call
      )
    );
    const states: Record<string, CloudWatchAlarmState> = {};
    const seen = new Set<string>();
    // Oldest first, so the first change seen per alarm is the one right after `atMs`.
    for (const c of [...changes].sort((a, b) => a.timestamp - b.timestamp)) {
      if (c.timestamp <= atMs || seen.has(c.alarmName)) continue;
      seen.add(c.alarmName);
      if (c.oldState) states[c.alarmName] = c.oldState;
    }
    return { atMs, states, complete };
  }

  private async getIdentitySafe(
    ds: Datasource,
    call?: CloudWatchCallOptions
  ): Promise<{ accountId: string; region: string } | undefined> {
    try {
      return await this.source.getCallerIdentity(ds.region, call);
    } catch (err) {
      // Identity is best-effort labeling; a failure here shouldn't blank rows.
      this.logger.debug(`CloudWatch getCallerIdentity failed: ${describeSourceError(err)}`);
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
    opts: { startTimeMs?: number; endTimeMs?: number; signal?: AbortSignal } = {}
  ): Promise<CloudWatchAlarmDetail | null> {
    const call: CloudWatchCallOptions = { signal: opts.signal };
    const alarm = await this.guarded(() => this.source.describeAlarm(alarmName, ds.region, call));
    if (!alarm) return null;
    const identity = await this.getIdentitySafe(ds, call);
    alarm.accountId = alarm.accountId || identity?.accountId;
    alarm.region = alarm.region || identity?.region || ds.region;

    const endTimeMs = opts.endTimeMs ?? Date.now();
    const startTimeMs = opts.startTimeMs ?? endTimeMs - 3 * 60 * 60 * 1000; // 3h default

    // History (partial-permission aware).
    let history: CloudWatchAlarmHistoryItem[] | undefined;
    let historyAccessDenied = false;
    try {
      history = await this.source.describeAlarmHistory(alarmName, ds.region, call);
    } catch (err) {
      if (isAccessDenied(err)) {
        historyAccessDenied = true;
        alarm.partialAccess = true;
      } else {
        this.logger.debug(`CloudWatch alarm history failed: ${describeSourceError(err)}`);
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
        let points = await this.source.getMetricData(query, call);
        // If the default window has no samples (e.g. the metric only reported
        // earlier), widen to the last 24h so the preview still shows the
        // series rather than rendering an empty chart. A caller-picked window
        // is respected as-is: the flyout says "No metric data in {window}".
        if (points.length === 0 && opts.startTimeMs === undefined) {
          points = await this.source.getMetricData(
            { ...query, startTimeMs: endTimeMs - 24 * 60 * 60 * 1000 },
            call
          );
        }
        const stat = alarm.statistic || alarm.extendedStatistic || 'Average';
        const periodLabel = alarm.period ? `, ${alarm.period}s` : '';
        // ALARM band: shade where the series breaches the threshold, so the band lines up with
        // the visible breach. Without a numeric threshold (e.g. anomaly-detection alarms), fall
        // back to reconstructing it from state history.
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
        this.logger.debug(`CloudWatch metric preview failed: ${describeSourceError(err)}`);
      }
    }

    // Relationships (composite alarms; metric alarms may still have parents).
    let relationships: CloudWatchRelationshipGraph | undefined;
    try {
      relationships = await this.buildRelationships(ds, alarm, DEFAULT_RELATIONSHIP_DEPTH, call);
    } catch (err) {
      this.logger.debug(`CloudWatch relationships failed: ${describeSourceError(err)}`);
    }

    const causedBy = findCausingAlarm(alarm, relationships);
    return {
      alarm,
      // With a known cause, the summary leaves out CloudWatch's reason text (which names the
      // child by ARN); the flyout shows "Caused by: <child>" instead.
      summary: buildSummary(alarm, history, !causedBy),
      causedBy,
      history,
      historyAccessDenied,
      metricPreview,
      relationships,
    };
  }

  /** Alarm history for one alarm (used by the lazy history route). */
  async getAlarmHistory(
    ds: Datasource,
    alarmName: string,
    call?: CloudWatchCallOptions
  ): Promise<{ items: CloudWatchAlarmHistoryItem[]; accessDenied: boolean }> {
    try {
      const items = await this.source.describeAlarmHistory(alarmName, ds.region, call);
      return { items, accessDenied: false };
    } catch (err) {
      if (isAccessDenied(err)) return { items: [], accessDenied: true };
      // Rethrown as-is: the route classifies it by error name and returns the redacted form.
      throw err;
    }
  }

  /**
   * The relationships graph for one alarm, for the "load deeper" route: only the alarm itself
   * is read first, not its full detail. Null when the alarm doesn't exist.
   */
  async getRelationships(
    ds: Datasource,
    alarmName: string,
    depth?: number,
    call?: CloudWatchCallOptions
  ): Promise<CloudWatchRelationshipGraph | null> {
    const alarm = await this.guarded(() => this.source.describeAlarm(alarmName, ds.region, call));
    return alarm ? this.buildRelationships(ds, alarm, depth, call) : null;
  }

  /**
   * Build the parents + descendant tree for an alarm, resolving alarms by name rather than from a
   * full listing (which can be capped, and would then wrongly mark real alarms as deleted).
   *
   * - Children: each level's referenced names are read in one batched call per 100 names.
   * - Parents: the composites whose rule references this alarm, asked of the source directly.
   * - Cycle: a name already on the current path terminates with `cycle: true`.
   * - Tombstone: a referenced name the source has no alarm for → `deleted: true`.
   * - Depth: beyond `depth`, a composite with children is marked `truncated`.
   */
  async buildRelationships(
    ds: Datasource,
    alarm: CloudWatchAlarm,
    depth: number = DEFAULT_RELATIONSHIP_DEPTH,
    call?: CloudWatchCallOptions
  ): Promise<CloudWatchRelationshipGraph> {
    const cappedDepth = Math.min(Math.max(depth, 1), MAX_RELATIONSHIP_DEPTH);
    const byName = new Map<string, CloudWatchAlarm>([[alarm.alarmName, alarm]]);
    const missing = new Set<string>();
    const childRefsOf = (a: CloudWatchAlarm) =>
      a.alarmType === 'composite' ? parseAlarmRuleReferences(a.alarmRule) : [];

    // Breadth-first: read each level's unseen children, down to the depth the tree shows.
    let frontier: CloudWatchAlarm[] = [alarm];
    for (let level = 0; level < cappedDepth && frontier.length > 0; level++) {
      const unseen = Array.from(
        new Set(frontier.flatMap(childRefsOf).filter((n) => !byName.has(n) && !missing.has(n)))
      );
      const found: CloudWatchAlarm[] = [];
      for (let k = 0; k < unseen.length; k += ALARM_NAMES_PER_CALL) {
        const batch = unseen.slice(k, k + ALARM_NAMES_PER_CALL);
        const alarms = await this.guarded(() =>
          this.source.describeAlarmsByName(batch, ds.region, call)
        );
        found.push(...alarms);
      }
      for (const a of found) byName.set(a.alarmName, a);
      for (const n of unseen) if (!byName.has(n)) missing.add(n);
      frontier = found;
    }

    let maxDepthReached = false;

    const makeNode = (
      name: string,
      role: CloudWatchRelationshipNode['role'],
      remainingDepth: number,
      path: Set<string>
    ): CloudWatchRelationshipNode => {
      const found = byName.get(name);
      if (!found) {
        // Only a name the source was asked for and had no alarm for is a tombstone.
        return missing.has(name)
          ? { alarmName: name, role, deleted: true }
          : { alarmName: name, role };
      }
      const childRefs = childRefsOf(found);
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
    const parentAlarms = await this.guarded(() =>
      this.source.describeParentAlarms(alarm.alarmName, ds.region, call)
    );
    const parents: CloudWatchRelationshipNode[] = parentAlarms
      .filter((p) => p.alarmName !== alarm.alarmName)
      .map((p) => ({
        alarmName: p.alarmName,
        alarmType: 'composite',
        stateValue: p.stateValue,
        role: 'parent',
      }));

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
function buildSummary(
  alarm: CloudWatchAlarm,
  history?: CloudWatchAlarmHistoryItem[],
  includeReason = true
): string {
  // No timestamp here: the flyout renders the last state change itself, in the user's zone,
  // so one flyout doesn't mix ISO and local formats.
  const reason = alarm.stateReason || history?.find((h) => h.summary)?.summary;
  const state =
    alarm.stateValue === 'ALARM'
      ? 'is in ALARM'
      : alarm.stateValue === 'INSUFFICIENT_DATA'
        ? 'has insufficient data'
        : 'is OK';
  const because = includeReason && reason ? ` ${reason}` : '';
  return `${alarm.alarmName} ${state}.${because}`.trim();
}

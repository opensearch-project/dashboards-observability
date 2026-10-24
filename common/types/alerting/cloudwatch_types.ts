/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AWS CloudWatch alarm domain types.
 *
 * These are the neutral, wire-agnostic shapes the alerting layer works with —
 * they are NOT the raw CloudWatch API (`DescribeAlarms` etc.) output. The
 * `CloudWatchAlarmSource` the deployment provides (server side) translates the
 * CloudWatch responses into these shapes, so this plugin (mappers, routes, UI)
 * never depends on the AWS SDK.
 *
 * Mirrors the structure of `prometheus_types.ts` (raw + domain shapes for one
 * backend) so the two integrations read the same way.
 */

/** Unified CloudWatch alarm state (`StateValue` in the CloudWatch API). */
export type CloudWatchAlarmState = 'ALARM' | 'OK' | 'INSUFFICIENT_DATA';

/** Metric alarms watch a single metric; composite alarms combine other alarms. */
export type CloudWatchAlarmType = 'metric' | 'composite';

export interface CloudWatchDimension {
  name: string;
  value: string;
}

/**
 * Neutral CloudWatch alarm. Metric-only fields (namespace, metric, statistic…)
 * and composite-only fields (`alarmRule`) are both optional; `alarmType`
 * discriminates which set is populated.
 */
export interface CloudWatchAlarm {
  alarmName: string;
  alarmArn?: string;
  alarmType: CloudWatchAlarmType;
  description?: string;
  stateValue: CloudWatchAlarmState;
  stateReason?: string;
  /** CloudWatch's machine-readable `StateReasonData` (JSON), when present. */
  stateReasonData?: string;
  stateUpdatedTimestamp?: string;
  actionsEnabled?: boolean;

  // Metric-alarm fields
  namespace?: string;
  metricName?: string;
  dimensions?: CloudWatchDimension[];
  statistic?: string;
  extendedStatistic?: string;
  period?: number;
  unit?: string;
  comparisonOperator?: string;
  threshold?: number;
  evaluationPeriods?: number;
  datapointsToAlarm?: number;
  treatMissingData?: string;

  // Composite-alarm fields
  alarmRule?: string;

  // Notification action ARNs (surfaced read-only in the flyout)
  alarmActions?: string[];
  okActions?: string[];
  insufficientDataActions?: string[];

  // Account/region the alarm was read from (attached by the source layer).
  accountId?: string;
  region?: string;

  /**
   * True when the alarm's row loaded but some detail (e.g. history) could not
   * be read with the current IAM role. Sections degrade gracefully rather than
   * failing the whole flyout.
   */
  partialAccess?: boolean;
}

/** One entry in `DescribeAlarmHistory`. */
export interface CloudWatchAlarmHistoryItem {
  timestamp: string;
  historyItemType?: 'StateUpdate' | 'ConfigurationUpdate' | 'Action' | string;
  summary?: string;
  oldState?: CloudWatchAlarmState;
  newState?: CloudWatchAlarmState;
}

export interface CloudWatchMetricDataPoint {
  timestamp: number;
  value: number;
}

/**
 * Data for the metric-preview chart: the watched series, the horizontal
 * threshold reference line, and the intervals during which the alarm was in
 * ALARM (rendered as a shaded band).
 */
export interface CloudWatchMetricPreview {
  label?: string;
  points: CloudWatchMetricDataPoint[];
  threshold?: number;
  comparisonOperator?: string;
  /** [startMs, endMs] windows the alarm was breaching, for the shaded band. */
  alarmBands?: Array<[number, number]>;
}

export type CloudWatchRelationshipRole = 'parent' | 'self' | 'child';

/**
 * A node in the composite-alarm relationships tree. Cycle-safe and
 * tombstone-aware: repeated alarms are terminated (`cycle`), missing targets
 * render as tombstones (`deleted`), and depth beyond the initial cap is
 * signalled with `truncated`.
 */
export interface CloudWatchRelationshipNode {
  alarmName: string;
  alarmType?: CloudWatchAlarmType;
  stateValue?: CloudWatchAlarmState;
  role: CloudWatchRelationshipRole;
  children?: CloudWatchRelationshipNode[];
  /** Repeated alarm — "already shown — cycle stopped". */
  cycle?: boolean;
  /** Referenced alarm no longer exists — "deleted in CloudWatch". */
  deleted?: boolean;
  /** More descendants exist beyond the loaded depth — "Load N deeper levels…". */
  truncated?: boolean;
  /** Direct child count (for the "N children" hint on collapsed composites). */
  childCount?: number;
}

/**
 * The relationships view for a composite alarm: the direct parents (composites
 * that reference this alarm) plus the descendant tree rooted at this alarm.
 */
export interface CloudWatchRelationshipGraph {
  parents: CloudWatchRelationshipNode[];
  tree: CloudWatchRelationshipNode;
  /** True when descendants were bounded by the initial depth cap. */
  maxDepthReached?: boolean;
}

/** Full detail payload the alarm flyout consumes (loaded on demand). */
/**
 * Alarm states at a past moment (the end of the Rules tab's window). `states` only holds alarms
 * that changed since `atMs`; any other alarm is still in its current state. `complete` is false
 * when the history read stopped short, so alarms not listed may also have changed.
 */
export interface CloudWatchStatesAt {
  atMs: number;
  states: Record<string, CloudWatchAlarmState>;
  complete: boolean;
  /** `atMs` is older than CloudWatch keeps alarm history, so no state is known for it. */
  beyondRetention?: boolean;
}

/** CloudWatch keeps alarm history for 30 days; nothing older can be read back. */
export const CLOUDWATCH_HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface CloudWatchAlarmDetail {
  alarm: CloudWatchAlarm;
  summary?: string;
  history?: CloudWatchAlarmHistoryItem[];
  /** History could not be read with the current role (partial permission). */
  historyAccessDenied?: boolean;
  metricPreview?: CloudWatchMetricPreview;
  relationships?: CloudWatchRelationshipGraph;
  /**
   * For a composite alarm, the child alarm whose change caused its current state, when
   * CloudWatch reports one. Shown as "Caused by: <name>" in place of the raw ARN.
   */
  causedBy?: {
    alarmName: string;
    alarmType?: CloudWatchAlarmType;
    stateValue?: CloudWatchAlarmState;
  };
}

/** Options for listing alarms. */
export interface DescribeAlarmsOptions {
  region?: string;
  /** When set, only alarms currently in these states are returned. */
  stateValue?: CloudWatchAlarmState;
  maxItems?: number;
}

// ============================================================================
// The CloudWatch source contract
// ============================================================================
// What the alerting plugin needs from CloudWatch. This plugin ships no implementation and no AWS
// SDK; a deployment that can reach CloudWatch (with the caller's own credentials) provides one,
// per request, through `setupRoutes({ cloudWatchAlarmSourceFactory })`. Implementations translate
// CloudWatch's responses into the shapes above, and report failures as errors whose `name` is
// the AWS error name (e.g. `AccessDeniedException`) so permission handling and classification
// work. A request whose sign-in method carries no AWS credentials at all (so retrying can't
// help) should fail with `CLOUDWATCH_SIGN_IN_UNSUPPORTED_ERROR_NAME`.

/** Error `name` for "this sign-in method can't reach CloudWatch" (no AWS credentials exist). */
export const CLOUDWATCH_SIGN_IN_UNSUPPORTED_ERROR_NAME = 'CloudWatchSignInUnsupported';

/** A page of `describeAlarms`. `truncated` when more alarms exist than were returned. */
export interface CloudWatchAlarmList {
  alarms: CloudWatchAlarm[];
  truncated: boolean;
}

export interface CloudWatchCallerIdentity {
  accountId: string;
  region: string;
}

export interface CloudWatchMetricDataQuery {
  region?: string;
  namespace: string;
  metricName: string;
  dimensions?: Array<{ name: string; value: string }>;
  statistic?: string;
  extendedStatistic?: string;
  period: number;
  startTimeMs: number;
  endTimeMs: number;
}

/** One alarm state change, from the account-wide alarm history. */
export interface CloudWatchStateChange {
  alarmName: string;
  timestamp: number;
  oldState?: CloudWatchAlarmState;
  newState?: CloudWatchAlarmState;
}
export interface CloudWatchStateChangesQuery {
  region?: string;
  startTimeMs: number;
  endTimeMs: number;
  /** Page cap; the result says whether it stopped short. */
  maxPages?: number;
}

/**
 * Per-call options. `signal` aborts when nobody is waiting for the result any more (the route
 * timed out, or the client disconnected); a source should stop its remaining calls and paging
 * and reject. Optional: a source may ignore it.
 */
export interface CloudWatchCallOptions {
  signal?: AbortSignal;
}

export interface CloudWatchAlarmSource {
  /**
   * The account + region the request's credentials reach. Every `region` parameter below is
   * optional: without one, the source uses its own default region. Every method takes optional
   * `CloudWatchCallOptions` last.
   */
  getCallerIdentity(
    region?: string,
    options?: CloudWatchCallOptions
  ): Promise<CloudWatchCallerIdentity>;

  /**
   * List metric + composite alarms (optionally filtered by state), up to `maxItems`; `truncated`
   * says more exist.
   */
  describeAlarms(
    options?: DescribeAlarmsOptions,
    callOptions?: CloudWatchCallOptions
  ): Promise<CloudWatchAlarmList>;

  /** Fetch a single alarm by exact name (metric or composite). Null if absent. */
  describeAlarm(
    alarmName: string,
    region?: string,
    options?: CloudWatchCallOptions
  ): Promise<CloudWatchAlarm | null>;

  /**
   * The named alarms that exist (metric or composite), in any order; a name with no alarm is
   * left out. Used to resolve a composite's children without listing every alarm.
   */
  describeAlarmsByName(
    alarmNames: string[],
    region?: string,
    options?: CloudWatchCallOptions
  ): Promise<CloudWatchAlarm[]>;

  /** The composite alarms whose rule references `alarmName` (its parents). */
  describeParentAlarms(
    alarmName: string,
    region?: string,
    options?: CloudWatchCallOptions
  ): Promise<CloudWatchAlarm[]>;

  /** State/config history for one alarm, newest first. */
  describeAlarmHistory(
    alarmName: string,
    region?: string,
    options?: CloudWatchCallOptions
  ): Promise<CloudWatchAlarmHistoryItem[]>;

  /**
   * State changes across every alarm in the region within a window, oldest first. One
   * account-wide history call instead of one per alarm; `complete` is false when the page cap
   * stopped it short.
   */
  describeStateChanges(
    query: CloudWatchStateChangesQuery,
    options?: CloudWatchCallOptions
  ): Promise<{ changes: CloudWatchStateChange[]; complete: boolean }>;
  /** Metric samples for the alarm's watched series (for the preview chart). */
  getMetricData(
    query: CloudWatchMetricDataQuery,
    options?: CloudWatchCallOptions
  ): Promise<CloudWatchMetricDataPoint[]>;
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AWS CloudWatch alarm domain types.
 *
 * These are the neutral, wire-agnostic shapes the alerting layer works with —
 * they are NOT the raw `@aws-sdk/client-cloudwatch` command output. The
 * `CloudWatchAlarmSource` implementation (server side) is responsible for
 * translating the SDK response into these shapes, so that the rest of the
 * plugin (mappers, routes, UI) never imports the AWS SDK. This keeps the SDK
 * dependency isolated to a single seam that can later be swapped for a backend
 * that hits different API routes.
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
export interface CloudWatchAlarmDetail {
  alarm: CloudWatchAlarm;
  summary?: string;
  history?: CloudWatchAlarmHistoryItem[];
  /** History could not be read with the current role (partial permission). */
  historyAccessDenied?: boolean;
  metricPreview?: CloudWatchMetricPreview;
  relationships?: CloudWatchRelationshipGraph;
}

/** Options for listing alarms. */
export interface DescribeAlarmsOptions {
  region?: string;
  /** When set, only alarms currently in these states are returned. */
  stateValue?: CloudWatchAlarmState;
  maxItems?: number;
}

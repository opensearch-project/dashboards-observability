/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The single seam between the alerting plugin and AWS CloudWatch.
 *
 * `CloudWatchAlarmSource` is the ONLY interface the rest of the plugin depends on for
 * CloudWatch data. This plugin ships no implementation and no AWS SDK: a deployment that can
 * reach CloudWatch (with the caller's own credentials) passes a `CloudWatchAlarmSourceFactory`
 * to `setupRoutes`, the same way it can pass a Prometheus backend. Without one, the CloudWatch
 * backend, routes and UI stay off even when `observability.cloudwatch.enabled` is set.
 */
import type {
  CloudWatchAlarm,
  CloudWatchAlarmHistoryItem,
  CloudWatchAlarmState,
  CloudWatchMetricDataPoint,
  DescribeAlarmsOptions,
} from '../../../../common/types/alerting';
import type { OpenSearchDashboardsRequest } from '../../../../../../src/core/server';

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
 * A specific error type the source throws when the request has no usable AWS
 * credentials. Callers translate this into a per-datasource fetch error so a
 * mis-configured environment surfaces as a warning row rather than crashing the
 * whole fan-out.
 */
export class CloudWatchCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudWatchCredentialsError';
  }
}

/**
 * Builds a source for one request, so calls carry that caller's credentials and account.
 * Supplied by the deployment; see the file comment.
 */
export type CloudWatchAlarmSourceFactory = (
  request: OpenSearchDashboardsRequest
) => CloudWatchAlarmSource;

export interface CloudWatchAlarmSource {
  /** The account + region the request's credentials reach. */
  getCallerIdentity(region?: string): Promise<CloudWatchCallerIdentity>;

  /** List metric + composite alarms (optionally filtered by state). */
  describeAlarms(options?: DescribeAlarmsOptions): Promise<CloudWatchAlarm[]>;

  /** Fetch a single alarm by exact name (metric or composite). Null if absent. */
  describeAlarm(alarmName: string, region?: string): Promise<CloudWatchAlarm | null>;

  /** State/config history for one alarm, newest first. */
  describeAlarmHistory(alarmName: string, region?: string): Promise<CloudWatchAlarmHistoryItem[]>;

  /**
   * State changes across every alarm in the region within a window, oldest first. One
   * account-wide history call instead of one per alarm; `complete` is false when the page cap
   * stopped it short.
   */
  describeStateChanges(
    query: CloudWatchStateChangesQuery
  ): Promise<{ changes: CloudWatchStateChange[]; complete: boolean }>;
  /** Metric samples for the alarm's watched series (for the preview chart). */
  getMetricData(query: CloudWatchMetricDataQuery): Promise<CloudWatchMetricDataPoint[]>;
}

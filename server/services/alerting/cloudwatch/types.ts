/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The single seam between the alerting plugin and AWS CloudWatch.
 *
 * `CloudWatchAlarmSource` is the ONLY interface the rest of the plugin depends
 * on for CloudWatch data. Today it is implemented by `SdkCloudWatchAlarmSource`
 * (which imports `@aws-sdk/client-cloudwatch`), but it is deliberately shaped so
 * that a future implementation hitting a different backend / API route can be
 * dropped in without touching the backend, mappers, routes, or UI.
 *
 * Keep the AWS SDK import confined to the impl file — nothing else in the plugin
 * should import `@aws-sdk/*` for alarms.
 */
import type {
  CloudWatchAlarm,
  CloudWatchAlarmHistoryItem,
  CloudWatchMetricDataPoint,
  DescribeAlarmsOptions,
} from '../../../../common/types/alerting';

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

/**
 * A specific error type the source throws when the ambient credential chain
 * yields nothing. Callers translate this into a per-datasource fetch error so a
 * mis-configured environment surfaces as a warning row rather than crashing the
 * whole fan-out.
 */
export class CloudWatchCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudWatchCredentialsError';
  }
}

export interface CloudWatchAlarmSource {
  /** Resolve the account + region the ambient credentials authenticate to. */
  getCallerIdentity(region?: string): Promise<CloudWatchCallerIdentity>;

  /** List metric + composite alarms (optionally filtered by state). */
  describeAlarms(options?: DescribeAlarmsOptions): Promise<CloudWatchAlarm[]>;

  /** Fetch a single alarm by exact name (metric or composite). Null if absent. */
  describeAlarm(alarmName: string, region?: string): Promise<CloudWatchAlarm | null>;

  /** State/config history for one alarm, newest first. */
  describeAlarmHistory(alarmName: string, region?: string): Promise<CloudWatchAlarmHistoryItem[]>;

  /** Metric samples for the alarm's watched series (for the preview chart). */
  getMetricData(query: CloudWatchMetricDataQuery): Promise<CloudWatchMetricDataPoint[]>;
}

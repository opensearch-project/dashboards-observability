/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AWS SDK v3 implementation of `CloudWatchAlarmSource`.
 *
 * THIS IS THE ONLY FILE IN THE PLUGIN THAT IMPORTS `@aws-sdk/*` FOR ALARMS.
 * Everything else depends on the `CloudWatchAlarmSource` interface, so this file
 * can be replaced wholesale by a route-hitting implementation later without
 * touching the backend, mappers, routes, or UI.
 *
 * Credentials come from the AWS SDK default provider chain
 * (`@aws-sdk/credential-provider-node`) — env vars
 * (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_SESSION_TOKEN`), shared
 * config, IRSA/instance role, etc. Mirrors the credential model in
 * `lezzago/OpenSearch-Dashboards@cloudwatch-logs-explore-poc`'s
 * `cloudwatch_logs_client.ts`. The account is auto-detected via STS
 * `GetCallerIdentity`; nothing is configured by the operator.
 */
import {
  CloudWatchClient,
  DescribeAlarmsCommand,
  DescribeAlarmHistoryCommand,
  GetMetricDataCommand,
  MetricAlarm,
  CompositeAlarm,
} from '@aws-sdk/client-cloudwatch';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import type {
  CloudWatchAlarm,
  CloudWatchAlarmHistoryItem,
  CloudWatchAlarmState,
  CloudWatchMetricDataPoint,
  DescribeAlarmsOptions,
  Logger,
} from '../../../../common/types/alerting';
import {
  CloudWatchAlarmSource,
  CloudWatchCallerIdentity,
  CloudWatchCredentialsError,
  CloudWatchMetricDataQuery,
} from './types';

const DEFAULT_FALLBACK_REGION = 'us-east-1';
const DESCRIBE_ALARMS_PAGE_SIZE = 100;
const DESCRIBE_ALARMS_MAX = 500;

/**
 * Resolve credentials, preferring explicit `AWS_*` env vars when present and
 * only falling back to the default provider chain otherwise. This mirrors the
 * reference branch's `getCredentialsFromEnv` and — crucially — avoids the
 * default chain preferring an ambient `AWS_PROFILE` over the static env
 * credentials the server was launched with (the SDK's default chain does the
 * latter, which silently breaks the "launch with AWS_* env vars" workflow).
 */
function resolveCredentials() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;
  if (accessKeyId && secretAccessKey) {
    return { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) };
  }
  return defaultProvider();
}

/** Evaluated once per process — env creds are stable for the process lifetime. */
const credentials = resolveCredentials();

function normalizeState(value?: string): CloudWatchAlarmState {
  if (value === 'ALARM' || value === 'INSUFFICIENT_DATA') return value;
  return 'OK';
}

function toIso(value?: Date): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

/**
 * Detect the SDK's "no credentials found" failure so callers can surface a
 * clean per-datasource warning instead of a raw stack. The v3 chain throws a
 * `CredentialsProviderError`; we also match the common message shapes.
 */
function isCredentialsError(err: unknown): boolean {
  const name = (err as { name?: string })?.name || '';
  const msg = (err as { message?: string })?.message || '';
  return name === 'CredentialsProviderError' || /could not load credentials|credential/i.test(msg);
}

export class SdkCloudWatchAlarmSource implements CloudWatchAlarmSource {
  private readonly clientsByRegion = new Map<string, CloudWatchClient>();
  private stsClient?: STSClient;
  private cachedIdentity?: CloudWatchCallerIdentity;

  constructor(
    private readonly logger: Logger,
    private readonly defaultRegion: string = DEFAULT_FALLBACK_REGION
  ) {}

  private resolveRegion(region?: string): string {
    return (
      region ||
      process.env.AWS_REGION ||
      process.env.AWS_DEFAULT_REGION ||
      this.defaultRegion ||
      DEFAULT_FALLBACK_REGION
    );
  }

  private getClient(region?: string): CloudWatchClient {
    const effectiveRegion = this.resolveRegion(region);
    const existing = this.clientsByRegion.get(effectiveRegion);
    if (existing) return existing;
    const client = new CloudWatchClient({ region: effectiveRegion, credentials });
    this.clientsByRegion.set(effectiveRegion, client);
    return client;
  }

  /** Run an SDK call, translating credential failures to a typed error. */
  private async send<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (err) {
      if (isCredentialsError(err)) {
        throw new CloudWatchCredentialsError(
          'CloudWatch credentials not found. Launch the server with AWS credentials ' +
            '(AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN) or an IAM role.'
        );
      }
      throw err;
    }
  }

  async getCallerIdentity(region?: string): Promise<CloudWatchCallerIdentity> {
    if (this.cachedIdentity) return this.cachedIdentity;
    const effectiveRegion = this.resolveRegion(region);
    if (!this.stsClient) {
      this.stsClient = new STSClient({ region: effectiveRegion, credentials });
    }
    const resp = await this.send(() => this.stsClient!.send(new GetCallerIdentityCommand({})));
    this.cachedIdentity = {
      accountId: resp.Account || 'unknown',
      region: effectiveRegion,
    };
    return this.cachedIdentity;
  }

  async describeAlarms(options?: DescribeAlarmsOptions): Promise<CloudWatchAlarm[]> {
    const region = this.resolveRegion(options?.region);
    const client = this.getClient(region);
    const maxItems = options?.maxItems ?? DESCRIBE_ALARMS_MAX;
    const alarms: CloudWatchAlarm[] = [];
    let nextToken: string | undefined;

    do {
      const resp = await this.send(() =>
        client.send(
          new DescribeAlarmsCommand({
            AlarmTypes: ['MetricAlarm', 'CompositeAlarm'],
            StateValue: options?.stateValue,
            MaxRecords: DESCRIBE_ALARMS_PAGE_SIZE,
            NextToken: nextToken,
          })
        )
      );
      for (const m of resp.MetricAlarms || []) {
        alarms.push(this.mapMetricAlarm(m, region));
      }
      for (const c of resp.CompositeAlarms || []) {
        alarms.push(this.mapCompositeAlarm(c, region));
      }
      nextToken = resp.NextToken;
    } while (nextToken && alarms.length < maxItems);

    return alarms.slice(0, maxItems);
  }

  async describeAlarm(alarmName: string, region?: string): Promise<CloudWatchAlarm | null> {
    const effectiveRegion = this.resolveRegion(region);
    const client = this.getClient(effectiveRegion);
    // `AlarmTypes` MUST be set explicitly: DescribeAlarms defaults to
    // returning only MetricAlarms, so a composite alarm looked up by name
    // would otherwise come back empty (→ a spurious 404 in the flyout).
    const resp = await this.send(() =>
      client.send(
        new DescribeAlarmsCommand({
          AlarmNames: [alarmName],
          AlarmTypes: ['MetricAlarm', 'CompositeAlarm'],
        })
      )
    );
    const metric = (resp.MetricAlarms || [])[0];
    if (metric) return this.mapMetricAlarm(metric, effectiveRegion);
    const composite = (resp.CompositeAlarms || [])[0];
    if (composite) return this.mapCompositeAlarm(composite, effectiveRegion);
    return null;
  }

  async describeAlarmHistory(
    alarmName: string,
    region?: string
  ): Promise<CloudWatchAlarmHistoryItem[]> {
    const client = this.getClient(region);
    const resp = await this.send(() =>
      client.send(
        new DescribeAlarmHistoryCommand({
          AlarmName: alarmName,
          // Like DescribeAlarms, DescribeAlarmHistory defaults to MetricAlarm
          // only — without this a composite alarm's history is always empty.
          AlarmTypes: ['MetricAlarm', 'CompositeAlarm'],
          MaxRecords: 50,
          ScanBy: 'TimestampDescending',
        })
      )
    );
    return (resp.AlarmHistoryItems || []).map((h) => {
      // HistoryData is a JSON string carrying oldState/newState for StateUpdate.
      let oldState: CloudWatchAlarmState | undefined;
      let newState: CloudWatchAlarmState | undefined;
      try {
        const data = h.HistoryData ? JSON.parse(h.HistoryData) : undefined;
        oldState = data?.oldState?.stateValue
          ? normalizeState(data.oldState.stateValue)
          : undefined;
        newState = data?.newState?.stateValue
          ? normalizeState(data.newState.stateValue)
          : undefined;
      } catch {
        // HistoryData is best-effort context; ignore parse failures.
      }
      return {
        timestamp: toIso(h.Timestamp) || new Date(0).toISOString(),
        historyItemType: h.HistoryItemType,
        summary: h.HistorySummary,
        oldState,
        newState,
      };
    });
  }

  async getMetricData(query: CloudWatchMetricDataQuery): Promise<CloudWatchMetricDataPoint[]> {
    const client = this.getClient(query.region);
    const resp = await this.send(() =>
      client.send(
        new GetMetricDataCommand({
          StartTime: new Date(query.startTimeMs),
          EndTime: new Date(query.endTimeMs),
          ScanBy: 'TimestampAscending',
          MetricDataQueries: [
            {
              Id: 'm1',
              MetricStat: {
                Metric: {
                  Namespace: query.namespace,
                  MetricName: query.metricName,
                  Dimensions: (query.dimensions || []).map((d) => ({
                    Name: d.name,
                    Value: d.value,
                  })),
                },
                Period: query.period,
                Stat: query.extendedStatistic || query.statistic || 'Average',
              },
              ReturnData: true,
            },
          ],
        })
      )
    );
    const result = (resp.MetricDataResults || [])[0];
    const timestamps = result?.Timestamps || [];
    const values = result?.Values || [];
    const points: CloudWatchMetricDataPoint[] = [];
    for (let i = 0; i < timestamps.length && i < values.length; i++) {
      points.push({ timestamp: new Date(timestamps[i]).getTime(), value: values[i] });
    }
    // GetMetricData with ScanBy ascending is already ordered, but guard anyway.
    points.sort((a, b) => a.timestamp - b.timestamp);
    return points;
  }

  private mapMetricAlarm(m: MetricAlarm, region: string): CloudWatchAlarm {
    return {
      alarmName: m.AlarmName || '',
      alarmArn: m.AlarmArn,
      alarmType: 'metric',
      description: m.AlarmDescription,
      stateValue: normalizeState(m.StateValue),
      stateReason: m.StateReason,
      stateUpdatedTimestamp: toIso(m.StateUpdatedTimestamp),
      actionsEnabled: m.ActionsEnabled,
      namespace: m.Namespace,
      metricName: m.MetricName,
      dimensions: (m.Dimensions || []).map((d) => ({
        name: d.Name || '',
        value: d.Value || '',
      })),
      statistic: m.Statistic,
      extendedStatistic: m.ExtendedStatistic,
      period: m.Period,
      unit: m.Unit,
      comparisonOperator: m.ComparisonOperator,
      threshold: m.Threshold,
      evaluationPeriods: m.EvaluationPeriods,
      datapointsToAlarm: m.DatapointsToAlarm,
      treatMissingData: m.TreatMissingData,
      alarmActions: m.AlarmActions,
      okActions: m.OKActions,
      insufficientDataActions: m.InsufficientDataActions,
      accountId: undefined,
      region,
    };
  }

  private mapCompositeAlarm(c: CompositeAlarm, region: string): CloudWatchAlarm {
    return {
      alarmName: c.AlarmName || '',
      alarmArn: c.AlarmArn,
      alarmType: 'composite',
      description: c.AlarmDescription,
      stateValue: normalizeState(c.StateValue),
      stateReason: c.StateReason,
      stateUpdatedTimestamp: toIso(c.StateUpdatedTimestamp),
      actionsEnabled: c.ActionsEnabled,
      alarmRule: c.AlarmRule,
      alarmActions: c.AlarmActions,
      okActions: c.OKActions,
      insufficientDataActions: c.InsufficientDataActions,
      accountId: undefined,
      region,
    };
  }
}

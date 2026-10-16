/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for `CloudWatchBackend` against a fake `CloudWatchAlarmSource`:
 * alarm-rule reference parsing, relationship graph (cycles, tombstones,
 * depth truncation, parents), alarm-detail assembly with partial-permission
 * degradation, credential-error propagation, and the band computations.
 */

import type {
  CloudWatchAlarm,
  CloudWatchAlarmHistoryItem,
  CloudWatchMetricDataPoint,
  Datasource,
  DescribeAlarmsOptions,
} from '../../../../../common/types/alerting';
import {
  CloudWatchBackend,
  computeAlarmBands,
  computeThresholdBreachBands,
  parseAlarmRuleReferences,
} from '../cloudwatch_backend';
import {
  CloudWatchAlarmSource,
  CloudWatchCallerIdentity,
  CloudWatchCredentialsError,
  CloudWatchMetricDataQuery,
} from '../types';

const noopLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

const ds: Datasource = {
  id: 'cloudwatch',
  name: 'CloudWatch',
  type: 'cloudwatch',
  region: 'us-east-1',
} as Datasource;

function alarm(overrides: Partial<CloudWatchAlarm> = {}): CloudWatchAlarm {
  return {
    alarmName: 'cpu-high',
    alarmType: 'metric',
    stateValue: 'ALARM',
    namespace: 'AWS/EC2',
    metricName: 'CPUUtilization',
    statistic: 'Average',
    period: 60,
    comparisonOperator: 'GreaterThanThreshold',
    threshold: 80,
    region: 'us-east-1',
    ...overrides,
  };
}

class FakeSource implements CloudWatchAlarmSource {
  alarms: CloudWatchAlarm[] = [];
  history: CloudWatchAlarmHistoryItem[] = [];
  metricPoints: CloudWatchMetricDataPoint[] = [];
  identity: CloudWatchCallerIdentity = { accountId: '123456789012', region: 'us-east-1' };
  failWith: { [K in keyof CloudWatchAlarmSource]?: Error } = {};

  async getCallerIdentity(): Promise<CloudWatchCallerIdentity> {
    if (this.failWith.getCallerIdentity) throw this.failWith.getCallerIdentity;
    return this.identity;
  }
  async describeAlarms(options?: DescribeAlarmsOptions): Promise<CloudWatchAlarm[]> {
    if (this.failWith.describeAlarms) throw this.failWith.describeAlarms;
    if (options?.stateValue) return this.alarms.filter((a) => a.stateValue === options.stateValue);
    return this.alarms;
  }
  async describeAlarm(alarmName: string): Promise<CloudWatchAlarm | null> {
    if (this.failWith.describeAlarm) throw this.failWith.describeAlarm;
    return this.alarms.find((a) => a.alarmName === alarmName) || null;
  }
  async describeAlarmHistory(): Promise<CloudWatchAlarmHistoryItem[]> {
    if (this.failWith.describeAlarmHistory) throw this.failWith.describeAlarmHistory;
    return this.history;
  }
  async getMetricData(_query: CloudWatchMetricDataQuery): Promise<CloudWatchMetricDataPoint[]> {
    if (this.failWith.getMetricData) throw this.failWith.getMetricData;
    return this.metricPoints;
  }
}

describe('parseAlarmRuleReferences', () => {
  it('parses quoted names, bare names, and ARNs across operators', () => {
    expect(
      parseAlarmRuleReferences(
        'ALARM("cpu-high") OR OK(mem-low) AND INSUFFICIENT_DATA(arn:aws:cloudwatch:us-east-1:123:alarm:disk-full)'
      )
    ).toEqual(['cpu-high', 'mem-low', 'disk-full']);
  });
  it('returns [] for undefined/empty/unparseable rules', () => {
    expect(parseAlarmRuleReferences(undefined)).toEqual([]);
    expect(parseAlarmRuleReferences('')).toEqual([]);
    expect(parseAlarmRuleReferences('TRUE')).toEqual([]);
  });
});

describe('CloudWatchBackend.describeAlarms', () => {
  it('enriches rows with the caller identity account/region', async () => {
    const source = new FakeSource();
    source.alarms = [alarm({ accountId: undefined, region: undefined })];
    const backend = new CloudWatchBackend(noopLogger, source);
    const out = await backend.describeAlarms(ds);
    expect(out[0].accountId).toBe('123456789012');
    expect(out[0].region).toBe('us-east-1');
  });

  it('still returns rows when identity lookup fails (best-effort labeling)', async () => {
    const source = new FakeSource();
    source.alarms = [alarm({ accountId: undefined, region: undefined })];
    source.failWith.getCallerIdentity = new Error('sts down');
    const backend = new CloudWatchBackend(noopLogger, source);
    const out = await backend.describeAlarms(ds);
    expect(out).toHaveLength(1);
    expect(out[0].accountId).toBeUndefined();
    expect(out[0].region).toBe('us-east-1'); // falls back to ds.region
  });

  it('propagates CloudWatchCredentialsError untouched for the fan-out warning', async () => {
    const source = new FakeSource();
    source.failWith.describeAlarms = new CloudWatchCredentialsError('no creds');
    const backend = new CloudWatchBackend(noopLogger, source);
    await expect(backend.describeAlarms(ds)).rejects.toBeInstanceOf(CloudWatchCredentialsError);
  });
});

describe('CloudWatchBackend.getAlarmDetail', () => {
  it('returns null for an unknown alarm', async () => {
    const source = new FakeSource();
    const backend = new CloudWatchBackend(noopLogger, source);
    expect(await backend.getAlarmDetail(ds, 'nope')).toBeNull();
  });

  it('assembles summary + history + metric preview for a metric alarm', async () => {
    const source = new FakeSource();
    source.alarms = [alarm({ stateReason: 'Threshold Crossed' })];
    source.history = [
      {
        timestamp: '2026-09-08T10:00:00.000Z',
        historyItemType: 'StateUpdate',
        summary: 'OK to ALARM',
        oldState: 'OK',
        newState: 'ALARM',
      },
    ];
    source.metricPoints = [
      { timestamp: 1, value: 50 },
      { timestamp: 2, value: 90 },
    ];
    const backend = new CloudWatchBackend(noopLogger, source);
    const detail = await backend.getAlarmDetail(ds, 'cpu-high');
    expect(detail).not.toBeNull();
    expect(detail!.summary).toContain('cpu-high is in ALARM');
    expect(detail!.summary).toContain('Threshold Crossed');
    expect(detail!.history).toHaveLength(1);
    expect(detail!.historyAccessDenied).toBe(false);
    expect(detail!.metricPreview?.points).toHaveLength(2);
    // 90 > threshold 80 → breach band present.
    expect(detail!.metricPreview?.alarmBands).toEqual([[2, 2]]);
  });

  it('degrades history to historyAccessDenied + partialAccess on AccessDenied', async () => {
    const source = new FakeSource();
    source.alarms = [alarm()];
    const denied = new Error('User is not authorized to perform cloudwatch:DescribeAlarmHistory');
    denied.name = 'AccessDeniedException';
    source.failWith.describeAlarmHistory = denied;
    const backend = new CloudWatchBackend(noopLogger, source);
    const detail = await backend.getAlarmDetail(ds, 'cpu-high');
    expect(detail!.historyAccessDenied).toBe(true);
    expect(detail!.alarm.partialAccess).toBe(true);
    // The rest of the payload still assembled.
    expect(detail!.summary).toContain('cpu-high');
  });

  it('omits the metric preview (without failing) when GetMetricData is denied', async () => {
    const source = new FakeSource();
    source.alarms = [alarm()];
    const denied = new Error('not authorized');
    denied.name = 'AccessDeniedException';
    source.failWith.getMetricData = denied;
    const backend = new CloudWatchBackend(noopLogger, source);
    const detail = await backend.getAlarmDetail(ds, 'cpu-high');
    expect(detail!.metricPreview).toBeUndefined();
    expect(detail!.alarm.partialAccess).toBe(true);
  });
});

describe('CloudWatchBackend.buildRelationships', () => {
  function compositeFixture(): FakeSource {
    const source = new FakeSource();
    source.alarms = [
      alarm({
        alarmName: 'root',
        alarmType: 'composite',
        alarmRule: 'ALARM("mid") OR ALARM("gone")',
      }),
      alarm({ alarmName: 'mid', alarmType: 'composite', alarmRule: 'ALARM("leaf")' }),
      alarm({ alarmName: 'leaf' }),
      alarm({ alarmName: 'parent-of-root', alarmType: 'composite', alarmRule: 'ALARM("root")' }),
    ];
    return source;
  }

  it('builds descendants with tombstones for deleted refs and finds parents', async () => {
    const backend = new CloudWatchBackend(noopLogger, compositeFixture());
    const focal = compositeFixture().alarms[0];
    const graph = await backend.buildRelationships(ds, focal, 3);
    expect(graph.tree.children?.map((c) => c.alarmName)).toEqual(['mid', 'gone']);
    expect(graph.tree.children?.find((c) => c.alarmName === 'gone')?.deleted).toBe(true);
    expect(graph.tree.children?.find((c) => c.alarmName === 'mid')?.children?.[0].alarmName).toBe(
      'leaf'
    );
    expect(graph.parents.map((p) => p.alarmName)).toEqual(['parent-of-root']);
    expect(graph.maxDepthReached).toBe(false);
  });

  it('truncates beyond the requested depth and reports maxDepthReached', async () => {
    const source = compositeFixture();
    const backend = new CloudWatchBackend(noopLogger, source);
    const graph = await backend.buildRelationships(ds, source.alarms[0], 1);
    const mid = graph.tree.children?.find((c) => c.alarmName === 'mid');
    expect(mid?.truncated).toBe(true);
    expect(mid?.children).toBeUndefined();
    expect(graph.maxDepthReached).toBe(true);
  });

  it('terminates cycles instead of recursing forever', async () => {
    const source = new FakeSource();
    source.alarms = [
      alarm({ alarmName: 'a', alarmType: 'composite', alarmRule: 'ALARM("b")' }),
      alarm({ alarmName: 'b', alarmType: 'composite', alarmRule: 'ALARM("a")' }),
    ];
    const backend = new CloudWatchBackend(noopLogger, source);
    const graph = await backend.buildRelationships(ds, source.alarms[0], 8);
    const b = graph.tree.children?.[0];
    const aAgain = b?.children?.[0];
    expect(aAgain?.alarmName).toBe('a');
    expect(aAgain?.cycle).toBe(true);
  });
});

describe('computeAlarmBands', () => {
  it('reconstructs [ALARM start, recovery] windows clamped to the preview window', () => {
    const history: CloudWatchAlarmHistoryItem[] = [
      // Newest-first, as the API returns.
      { timestamp: new Date(3000).toISOString(), historyItemType: 'StateUpdate', newState: 'OK' },
      {
        timestamp: new Date(1000).toISOString(),
        historyItemType: 'StateUpdate',
        newState: 'ALARM',
      },
    ];
    expect(computeAlarmBands(history, 0, 10_000)).toEqual([[1000, 3000]]);
  });

  it('extends a still-firing band to the window end', () => {
    const history: CloudWatchAlarmHistoryItem[] = [
      {
        timestamp: new Date(1000).toISOString(),
        historyItemType: 'StateUpdate',
        newState: 'ALARM',
      },
    ];
    expect(computeAlarmBands(history, 0, 5000)).toEqual([[1000, 5000]]);
  });

  it('returns undefined for missing/empty history', () => {
    expect(computeAlarmBands(undefined, 0, 1)).toBeUndefined();
    expect(computeAlarmBands([], 0, 1)).toBeUndefined();
  });
});

describe('computeThresholdBreachBands', () => {
  const points = [
    { timestamp: 1, value: 10 },
    { timestamp: 2, value: 95 },
    { timestamp: 3, value: 96 },
    { timestamp: 4, value: 20 },
    { timestamp: 5, value: 99 },
  ];

  it('finds contiguous breach windows for GreaterThanThreshold', () => {
    expect(computeThresholdBreachBands(points, 80, 'GreaterThanThreshold')).toEqual([
      [2, 3],
      [5, 5],
    ]);
  });

  it('honors LessThanThreshold direction', () => {
    expect(computeThresholdBreachBands(points, 15, 'LessThanThreshold')).toEqual([[1, 1]]);
  });

  it('returns undefined without a numeric threshold or points', () => {
    expect(computeThresholdBreachBands(points, undefined, 'GreaterThanThreshold')).toBeUndefined();
    expect(computeThresholdBreachBands([], 80, 'GreaterThanThreshold')).toBeUndefined();
  });
});

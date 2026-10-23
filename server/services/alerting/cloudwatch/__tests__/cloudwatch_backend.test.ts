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
  CloudWatchAlarmList,
  CloudWatchMetricDataPoint,
  Datasource,
  DescribeAlarmsOptions,
} from '../../../../../common/types/alerting';
import {
  CloudWatchBackend,
  computeAlarmBands,
  computeThresholdBreachBands,
  findCausingAlarm,
  parseAlarmRuleReferences,
} from '../cloudwatch_backend';
import {
  CloudWatchAlarmSource,
  CloudWatchCallerIdentity,
  CloudWatchCredentialsError,
  CloudWatchMetricDataQuery,
  CloudWatchStateChange,
  CloudWatchStateChangesQuery,
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
  stateChanges: CloudWatchStateChange[] = [];
  stateChangesComplete = true;
  identity: CloudWatchCallerIdentity = { accountId: '123456789012', region: 'us-east-1' };
  failWith: { [K in keyof CloudWatchAlarmSource]?: Error } = {};

  async getCallerIdentity(): Promise<CloudWatchCallerIdentity> {
    if (this.failWith.getCallerIdentity) throw this.failWith.getCallerIdentity;
    return this.identity;
  }
  truncated = false;
  async describeAlarms(options?: DescribeAlarmsOptions): Promise<CloudWatchAlarmList> {
    if (this.failWith.describeAlarms) throw this.failWith.describeAlarms;
    const alarms = options?.stateValue
      ? this.alarms.filter((a) => a.stateValue === options.stateValue)
      : this.alarms;
    return { alarms, truncated: this.truncated };
  }
  async describeAlarmsByName(alarmNames: string[]): Promise<CloudWatchAlarm[]> {
    if (this.failWith.describeAlarmsByName) throw this.failWith.describeAlarmsByName;
    return this.alarms.filter((a) => alarmNames.includes(a.alarmName));
  }
  async describeParentAlarms(alarmName: string): Promise<CloudWatchAlarm[]> {
    if (this.failWith.describeParentAlarms) throw this.failWith.describeParentAlarms;
    return this.alarms.filter(
      (a) =>
        a.alarmType === 'composite' && parseAlarmRuleReferences(a.alarmRule).includes(alarmName)
    );
  }
  async describeAlarm(alarmName: string): Promise<CloudWatchAlarm | null> {
    if (this.failWith.describeAlarm) throw this.failWith.describeAlarm;
    return this.alarms.find((a) => a.alarmName === alarmName) || null;
  }
  async describeAlarmHistory(): Promise<CloudWatchAlarmHistoryItem[]> {
    if (this.failWith.describeAlarmHistory) throw this.failWith.describeAlarmHistory;
    return this.history;
  }
  async describeStateChanges(
    _query: CloudWatchStateChangesQuery
  ): Promise<{ changes: CloudWatchStateChange[]; complete: boolean }> {
    if (this.failWith.describeStateChanges) throw this.failWith.describeStateChanges;
    return { changes: this.stateChanges, complete: this.stateChangesComplete };
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

describe('findCausingAlarm', () => {
  const composite = {
    alarmName: 'checkout-composite',
    alarmType: 'composite' as const,
    stateValue: 'ALARM' as const,
  };
  const arn = 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:checkout-service-degraded';
  const relationships = {
    parents: [],
    tree: {
      alarmName: 'checkout-composite',
      role: 'self' as const,
      children: [
        {
          alarmName: 'checkout-service-degraded',
          role: 'child' as const,
          alarmType: 'metric' as const,
          stateValue: 'ALARM' as const,
        },
      ],
    },
  };

  it('reads the triggering alarm from StateReasonData, with its state from the tree', () => {
    expect(
      findCausingAlarm(
        { ...composite, stateReasonData: JSON.stringify({ triggeringAlarms: [{ arn }] }) },
        relationships
      )
    ).toEqual({ alarmName: 'checkout-service-degraded', alarmType: 'metric', stateValue: 'ALARM' });
  });

  it('falls back to the alarm ARN in StateReason', () => {
    expect(
      findCausingAlarm({ ...composite, stateReason: `${arn} transitioned to ALARM at Wednesday` })
    ).toEqual({
      alarmName: 'checkout-service-degraded',
      alarmType: undefined,
      stateValue: undefined,
    });
  });

  it('reports no cause for metric alarms or composites without one', () => {
    expect(
      findCausingAlarm({ ...composite, alarmType: 'metric', stateReason: arn })
    ).toBeUndefined();
    expect(
      findCausingAlarm({ ...composite, stateReason: 'Rule evaluated to TRUE' })
    ).toBeUndefined();
    expect(findCausingAlarm({ ...composite, stateReasonData: 'not json' })).toBeUndefined();
  });
});

describe('CloudWatchBackend.describeAlarms', () => {
  it('enriches rows with the caller identity account/region', async () => {
    const source = new FakeSource();
    source.alarms = [alarm({ accountId: undefined, region: undefined })];
    const backend = new CloudWatchBackend(noopLogger, source);
    const { alarms: out, truncated } = await backend.describeAlarms(ds);
    expect(out[0].accountId).toBe('123456789012');
    expect(out[0].region).toBe('us-east-1');
    expect(truncated).toBe(false);
  });

  it("passes on the source's truncated flag", async () => {
    const source = new FakeSource();
    source.alarms = [alarm()];
    source.truncated = true;
    const backend = new CloudWatchBackend(noopLogger, source);
    expect((await backend.describeAlarms(ds)).truncated).toBe(true);
    expect((await backend.describeAlarmingAlarms(ds)).truncated).toBe(true);
  });

  it('logs only the error name and status, never provider text', async () => {
    const source = new FakeSource();
    const denied = Object.assign(
      new Error('User: arn:aws:sts::123456789012:assumed-role/Admin/me is not authorized'),
      { name: 'AccessDeniedException', $metadata: { httpStatusCode: 403 } }
    );
    source.failWith.describeAlarms = denied;
    const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
    const backend = new CloudWatchBackend(logger, source);
    await expect(backend.describeAlarms(ds)).rejects.toBe(denied);
    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).toContain('AccessDeniedException (HTTP 403)');
    expect(logged).not.toContain('123456789012');
  });

  it('still returns rows when identity lookup fails (best-effort labeling)', async () => {
    const source = new FakeSource();
    source.alarms = [alarm({ accountId: undefined, region: undefined })];
    source.failWith.getCallerIdentity = new Error('sts down');
    const backend = new CloudWatchBackend(noopLogger, source);
    const { alarms: out } = await backend.describeAlarms(ds);
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

  it('widens an empty default window to 24h, but respects a caller-picked window', async () => {
    const source = new FakeSource();
    source.alarms = [alarm()];
    const spy = jest.spyOn(source, 'getMetricData');
    const backend = new CloudWatchBackend(noopLogger, source);

    await backend.getAlarmDetail(ds, 'cpu-high');
    expect(spy).toHaveBeenCalledTimes(2);
    const widened = spy.mock.calls[1][0];
    expect(widened.endTimeMs - widened.startTimeMs).toBe(24 * 60 * 60 * 1000);

    spy.mockClear();
    const detail = await backend.getAlarmDetail(ds, 'cpu-high', {
      startTimeMs: 1_000,
      endTimeMs: 2_000,
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({ startTimeMs: 1_000, endTimeMs: 2_000 });
    expect(detail!.metricPreview?.points).toEqual([]);
  });
});

describe('CloudWatchBackend.getStatesAt', () => {
  const at = 1_000_000;
  const now = 2_000_000;

  it("takes each alarm's state from its first change after the moment", async () => {
    const source = new FakeSource();
    // Unsorted on purpose: the backend orders them itself.
    source.stateChanges = [
      { alarmName: 'cpu-high', timestamp: at + 500, oldState: 'ALARM', newState: 'OK' },
      { alarmName: 'cpu-high', timestamp: at + 100, oldState: 'OK', newState: 'ALARM' },
      {
        alarmName: 'disk-full',
        timestamp: at + 200,
        oldState: 'INSUFFICIENT_DATA',
        newState: 'OK',
      },
    ];
    const spy = jest.spyOn(source, 'describeStateChanges');
    const backend = new CloudWatchBackend(noopLogger, source);
    expect(await backend.getStatesAt(ds, at, now)).toEqual({
      atMs: at,
      states: { 'cpu-high': 'OK', 'disk-full': 'INSUFFICIENT_DATA' },
      complete: true,
    });
    expect(spy).toHaveBeenCalledWith({ region: 'us-east-1', startTimeMs: at, endTimeMs: now });
  });

  it("leaves out an alarm whose first change doesn't say where it started", async () => {
    const source = new FakeSource();
    source.stateChanges = [
      { alarmName: 'cpu-high', timestamp: at + 100, newState: 'ALARM' },
      { alarmName: 'cpu-high', timestamp: at + 200, oldState: 'ALARM', newState: 'OK' },
    ];
    const backend = new CloudWatchBackend(noopLogger, source);
    expect((await backend.getStatesAt(ds, at, now)).states).toEqual({});
  });

  it("reports a moment older than CloudWatch's 30-day history as unknown, without a call", async () => {
    const source = new FakeSource();
    const spy = jest.spyOn(source, 'describeStateChanges');
    const backend = new CloudWatchBackend(noopLogger, source);
    const longAgo = now - 31 * 24 * 60 * 60 * 1000;
    expect(await backend.getStatesAt(ds, longAgo, now)).toEqual({
      atMs: longAgo,
      states: {},
      complete: true,
      beyondRetention: true,
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('passes on an incomplete read and skips the call for a moment not in the past', async () => {
    const source = new FakeSource();
    source.stateChangesComplete = false;
    const spy = jest.spyOn(source, 'describeStateChanges');
    const backend = new CloudWatchBackend(noopLogger, source);
    expect((await backend.getStatesAt(ds, at, now)).complete).toBe(false);
    spy.mockClear();
    expect(await backend.getStatesAt(ds, now, now)).toEqual({
      atMs: now,
      states: {},
      complete: true,
    });
    expect(spy).not.toHaveBeenCalled();
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

  it('resolves alarms by name, not from a (possibly capped) listing', async () => {
    const source = compositeFixture();
    // A capped listing would leave these out; by-name lookups still find them.
    source.truncated = true;
    const listSpy = jest.spyOn(source, 'describeAlarms');
    const byNameSpy = jest.spyOn(source, 'describeAlarmsByName');
    const backend = new CloudWatchBackend(noopLogger, source);
    const graph = await backend.buildRelationships(ds, source.alarms[0], 3);
    expect(listSpy).not.toHaveBeenCalled();
    expect(byNameSpy).toHaveBeenNthCalledWith(1, ['mid', 'gone'], ds.region);
    expect(byNameSpy).toHaveBeenNthCalledWith(2, ['leaf'], ds.region);
    expect(graph.tree.children?.find((c) => c.alarmName === 'mid')?.deleted).toBeUndefined();
    expect(graph.tree.children?.find((c) => c.alarmName === 'gone')?.deleted).toBe(true);
  });

  it('reads at most 100 names per call', async () => {
    const source = new FakeSource();
    const names = Array.from({ length: 150 }, (_, i) => `child-${i}`);
    source.alarms = [
      alarm({
        alarmName: 'big',
        alarmType: 'composite',
        alarmRule: names.map((n) => `ALARM("${n}")`).join(' OR '),
      }),
      ...names.map((n) => alarm({ alarmName: n })),
    ];
    const byNameSpy = jest.spyOn(source, 'describeAlarmsByName');
    const backend = new CloudWatchBackend(noopLogger, source);
    const graph = await backend.buildRelationships(ds, source.alarms[0], 1);
    expect(byNameSpy.mock.calls.map(([batch]) => batch.length)).toEqual([100, 50]);
    expect(graph.tree.children).toHaveLength(150);
  });
});

describe('CloudWatchBackend.getRelationships', () => {
  it('reads only the alarm, not its history or metric data', async () => {
    const source = new FakeSource();
    source.alarms = [alarm({ alarmName: 'root', alarmType: 'composite', alarmRule: '' })];
    const history = jest.spyOn(source, 'describeAlarmHistory');
    const metric = jest.spyOn(source, 'getMetricData');
    const backend = new CloudWatchBackend(noopLogger, source);
    expect((await backend.getRelationships(ds, 'root'))?.tree.alarmName).toBe('root');
    expect(await backend.getRelationships(ds, 'nope')).toBeNull();
    expect(history).not.toHaveBeenCalled();
    expect(metric).not.toHaveBeenCalled();
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

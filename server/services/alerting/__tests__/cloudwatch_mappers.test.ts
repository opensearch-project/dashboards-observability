/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for the CloudWatch → unified mappers in `alert_utils.ts`: state →
 * status/alert-state (including the distinct `insufficient_data` unified
 * status), health, derived severity, and the full row mappers for the Rules
 * and Alerts tabs.
 */

import type { CloudWatchAlarm } from '../../../../common/types/alerting';
import {
  cloudWatchAlarmToUnifiedAlertSummary,
  cloudWatchAlarmToUnifiedRuleSummary,
  cloudWatchHealthStatus,
  cloudWatchSeverity,
  cloudWatchStateToAlertState,
  cloudWatchStateToMonitorStatus,
} from '../alert_utils';

function metricAlarm(overrides: Partial<CloudWatchAlarm> = {}): CloudWatchAlarm {
  return {
    alarmName: 'checkout-errors-high',
    alarmArn: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:checkout-errors-high',
    alarmType: 'metric',
    description: 'Checkout 5xx rate',
    stateValue: 'ALARM',
    stateReason: 'Threshold Crossed: 3 datapoints were greater than the threshold',
    stateUpdatedTimestamp: '2026-09-08T10:00:00.000Z',
    actionsEnabled: true,
    namespace: 'AWS/ApplicationELB',
    metricName: 'HTTPCode_Target_5XX_Count',
    dimensions: [{ name: 'LoadBalancer', value: 'app/checkout/abc' }],
    statistic: 'Sum',
    period: 60,
    comparisonOperator: 'GreaterThanThreshold',
    threshold: 10,
    evaluationPeriods: 5,
    datapointsToAlarm: 3,
    alarmActions: ['arn:aws:sns:us-east-1:123456789012:page-oncall'],
    region: 'us-east-1',
    accountId: '123456789012',
    ...overrides,
  };
}

describe('cloudWatchStateToMonitorStatus', () => {
  it('maps ALARM → active', () => {
    expect(cloudWatchStateToMonitorStatus('ALARM')).toBe('active');
  });
  it('maps INSUFFICIENT_DATA → insufficient_data (distinct from pending)', () => {
    expect(cloudWatchStateToMonitorStatus('INSUFFICIENT_DATA')).toBe('insufficient_data');
  });
  it('maps OK → muted', () => {
    expect(cloudWatchStateToMonitorStatus('OK')).toBe('muted');
  });
});

describe('cloudWatchStateToAlertState', () => {
  it('maps ALARM → active', () => {
    expect(cloudWatchStateToAlertState('ALARM')).toBe('active');
  });
  it('maps INSUFFICIENT_DATA → insufficient_data (distinct from pending)', () => {
    expect(cloudWatchStateToAlertState('INSUFFICIENT_DATA')).toBe('insufficient_data');
  });
  it('maps OK → resolved', () => {
    expect(cloudWatchStateToAlertState('OK')).toBe('resolved');
  });
});

describe('cloudWatchHealthStatus', () => {
  it('INSUFFICIENT_DATA reads as no_data', () => {
    expect(cloudWatchHealthStatus(metricAlarm({ stateValue: 'INSUFFICIENT_DATA' }))).toBe(
      'no_data'
    );
  });
  it('ALARM and OK read as healthy (the alarm itself is functioning)', () => {
    expect(cloudWatchHealthStatus(metricAlarm({ stateValue: 'ALARM' }))).toBe('healthy');
    expect(cloudWatchHealthStatus(metricAlarm({ stateValue: 'OK' }))).toBe('healthy');
  });
});

describe('cloudWatchSeverity', () => {
  it('critical-named alarms → critical regardless of state', () => {
    expect(
      cloudWatchSeverity(metricAlarm({ alarmName: 'db-critical-cpu', stateValue: 'OK' }))
    ).toBe('critical');
  });
  it('firing composite → critical', () => {
    expect(cloudWatchSeverity(metricAlarm({ alarmType: 'composite', stateValue: 'ALARM' }))).toBe(
      'critical'
    );
  });
  it('firing metric alarm without hints → medium', () => {
    expect(cloudWatchSeverity(metricAlarm({ stateValue: 'ALARM' }))).toBe('medium');
  });
  it('non-firing warn-named alarm → medium; plain non-firing → info', () => {
    expect(
      cloudWatchSeverity(
        metricAlarm({ alarmName: 'disk-warning', description: undefined, stateValue: 'OK' })
      )
    ).toBe('medium');
    expect(cloudWatchSeverity(metricAlarm({ stateValue: 'OK' }))).toBe('info');
  });
});

describe('cloudWatchAlarmToUnifiedRuleSummary', () => {
  it('maps a firing metric alarm to a complete rule row', () => {
    const row = cloudWatchAlarmToUnifiedRuleSummary(metricAlarm(), 'cloudwatch');
    expect(row).toMatchObject({
      id: 'checkout-errors-high',
      datasourceId: 'cloudwatch',
      datasourceType: 'cloudwatch',
      definitionType: 'cloudwatch_alarm',
      enabled: true,
      severity: 'medium',
      monitorType: 'metric',
      status: 'active',
      healthStatus: 'healthy',
      createdBy: 'cloudwatch',
      lastTriggered: '2026-09-08T10:00:00.000Z',
      evaluationInterval: '60s',
      pendingPeriod: '180s', // datapointsToAlarm(3) * period(60)
    });
    expect(row.query).toBe('AWS/ApplicationELB / HTTPCode_Target_5XX_Count');
    expect(row.condition).toBe('GreaterThanThreshold 10 for 3/5 datapoints');
    expect(row.threshold).toEqual({ operator: 'GreaterThanThreshold', value: 10 });
    expect(row.labels).toEqual({
      namespace: 'AWS/ApplicationELB',
      metric: 'HTTPCode_Target_5XX_Count',
      account: '123456789012',
      region: 'us-east-1',
    });
    expect(row.cloudWatch).toMatchObject({ state: 'ALARM', alarmType: 'metric' });
  });

  it('INSUFFICIENT_DATA alarm carries the distinct unified status and no lastTriggered', () => {
    const row = cloudWatchAlarmToUnifiedRuleSummary(
      metricAlarm({ stateValue: 'INSUFFICIENT_DATA' }),
      'cloudwatch'
    );
    expect(row.status).toBe('insufficient_data');
    expect(row.healthStatus).toBe('no_data');
    expect(row.lastTriggered).toBeUndefined();
  });

  it('composite alarm uses the alarm rule as query/condition', () => {
    const row = cloudWatchAlarmToUnifiedRuleSummary(
      metricAlarm({
        alarmType: 'composite',
        alarmRule: 'ALARM("a") OR ALARM("b")',
        namespace: undefined,
        metricName: undefined,
      }),
      'cloudwatch'
    );
    expect(row.query).toBe('ALARM("a") OR ALARM("b")');
    expect(row.condition).toBe('ALARM("a") OR ALARM("b")');
    expect(row.monitorType).toBe('composite');
  });

  it('actionsEnabled=false maps to a disabled row', () => {
    const row = cloudWatchAlarmToUnifiedRuleSummary(
      metricAlarm({ actionsEnabled: false }),
      'cloudwatch'
    );
    expect(row.enabled).toBe(false);
  });
});

describe('cloudWatchAlarmToUnifiedAlertSummary', () => {
  it('maps a firing alarm to an alert row with the state reason as message', () => {
    const alert = cloudWatchAlarmToUnifiedAlertSummary(metricAlarm(), 'cloudwatch');
    expect(alert).toMatchObject({
      id: 'checkout-errors-high',
      datasourceType: 'cloudwatch',
      alertKind: 'alert',
      state: 'active',
      severity: 'medium',
      message: 'Threshold Crossed: 3 datapoints were greater than the threshold',
      startTime: '2026-09-08T10:00:00.000Z',
      monitorId: 'checkout-errors-high',
    });
    expect(alert.cloudWatch).toMatchObject({ state: 'ALARM' });
  });

  it('INSUFFICIENT_DATA alarm surfaces the distinct alert state', () => {
    const alert = cloudWatchAlarmToUnifiedAlertSummary(
      metricAlarm({ stateValue: 'INSUFFICIENT_DATA' }),
      'cloudwatch'
    );
    expect(alert.state).toBe('insufficient_data');
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EMPTY_VALUE,
  SEVERITY_LABELS,
  STATE_LABELS,
  getCloudWatchStateLabel,
  getMonitorStateLabel,
  getSeverityLabel,
  getStateLabel,
  getNativeAlertStateLabel,
  getNativeRuleStatusLabel,
  isBreachStatus,
} from '../enum_labels';
import type {
  MonitorHealthStatus,
  UnifiedAlertSeverity,
  UnifiedAlertState,
} from '../../../../common/types/alerting';

const ALL_SEVERITIES: UnifiedAlertSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
const ALL_STATES: UnifiedAlertState[] = [
  'active',
  'pending',
  'acknowledged',
  'silenced',
  'resolved',
  'error',
  'deleted',
];

describe('enum_labels', () => {
  it('covers every severity in the union with a non-empty, non-raw label', () => {
    ALL_SEVERITIES.forEach((severity) => {
      const label = SEVERITY_LABELS[severity];
      expect(label).toBeTruthy();
      // The whole point is not to render the raw lowercase machine value.
      expect(label).not.toBe(severity);
    });
  });

  it('covers every state in the union with a non-empty, non-raw label', () => {
    ALL_STATES.forEach((state) => {
      const label = STATE_LABELS[state];
      expect(label).toBeTruthy();
      expect(label).not.toBe(state);
    });
  });

  it('returns the empty placeholder for missing values', () => {
    expect(getSeverityLabel(undefined)).toBe(EMPTY_VALUE);
    expect(getSeverityLabel(null)).toBe(EMPTY_VALUE);
    expect(getSeverityLabel('')).toBe(EMPTY_VALUE);
    expect(getStateLabel(undefined)).toBe(EMPTY_VALUE);
    expect(getStateLabel('')).toBe(EMPTY_VALUE);
  });

  it('humanizes values the UI does not know about instead of dropping them', () => {
    expect(getStateLabel('awaiting_data')).toBe('Awaiting data');
    expect(getSeverityLabel('sev-one')).toBe('Sev one');
  });

  it('sentence-cases machine-style tokens instead of shouting them', () => {
    // A separated or all-caps unknown token must read as prose, not SHOUT:
    // `AT_RISK` → "At risk", not "AT RISK".
    expect(getStateLabel('AT_RISK')).toBe('At risk');
    expect(getSeverityLabel('CRITICAL_OVERRIDE')).toBe('Critical override');
    expect(getMonitorStateLabel('RUNNING')).toBe('Running');
  });

  it('preserves intentional internal casing on unknown non-separated tokens', () => {
    // A single mixed-case token with no separators is only first-letter-capped,
    // so camelCase-ish statuses are not flattened.
    expect(getMonitorStateLabel('inProgress')).toBe('InProgress');
  });

  it('falls back to the placeholder when an unknown value is only separators', () => {
    expect(getStateLabel('__')).toBe(EMPTY_VALUE);
  });

  it('maps known values through the label tables', () => {
    expect(getSeverityLabel('critical')).toBe(SEVERITY_LABELS.critical);
    expect(getStateLabel('acknowledged')).toBe(STATE_LABELS.acknowledged);
  });

  describe('getMonitorStateLabel', () => {
    it('title-cases the lowercase rule-status tokens', () => {
      expect(getMonitorStateLabel('active')).toBe('Active');
      expect(getMonitorStateLabel('pending')).toBe('Pending');
      expect(getMonitorStateLabel('muted')).toBe('Muted');
      expect(getMonitorStateLabel('disabled')).toBe('Disabled');
    });

    it('covers every health status with a non-raw label', () => {
      const ALL_HEALTH: MonitorHealthStatus[] = ['healthy', 'failing', 'no_data'];
      ALL_HEALTH.forEach((health) => {
        const label = getMonitorStateLabel(health);
        expect(label).toBeTruthy();
        expect(label).not.toBe(health);
      });
      // `no_data` in particular must not leak the underscore into the UI.
      expect(getMonitorStateLabel('no_data')).toBe('No data');
    });

    it('passes through the AD/forecaster statuses, which already read as prose', () => {
      // These arrive from the anomaly-detection plugin already display-ready;
      // re-casing them would corrupt wording like "Awaiting data to init".
      expect(getMonitorStateLabel('Running')).toBe('Running');
      expect(getMonitorStateLabel('Awaiting data to init')).toBe('Awaiting data to init');
      expect(getMonitorStateLabel('Initialization failure')).toBe('Initialization failure');
    });

    it('returns the empty placeholder for missing values', () => {
      expect(getMonitorStateLabel(undefined)).toBe(EMPTY_VALUE);
      expect(getMonitorStateLabel(null)).toBe(EMPTY_VALUE);
      expect(getMonitorStateLabel('')).toBe(EMPTY_VALUE);
    });
  });

  describe('getCloudWatchStateLabel', () => {
    it('words CloudWatch states the way the CloudWatch console does', () => {
      expect(getCloudWatchStateLabel('ALARM')).toBe('In alarm');
      expect(getCloudWatchStateLabel('OK')).toBe('OK');
      expect(getCloudWatchStateLabel('INSUFFICIENT_DATA')).toBe('Insufficient data');
    });

    it('humanizes an unknown state and returns the placeholder when absent', () => {
      expect(getCloudWatchStateLabel('NEW_STATE')).toBe('New state');
      expect(getCloudWatchStateLabel(undefined)).toBe(EMPTY_VALUE);
    });
  });

  it('labels a deleted-rule alert so it does not read as a deleted alert', () => {
    expect(getStateLabel('deleted')).toBe('Rule deleted');
  });
});
describe('native status words', () => {
  it.each([
    ['opensearch', 'active', 'Active'],
    ['opensearch', 'acknowledged', 'Acknowledged'],
    ['opensearch', 'resolved', 'Completed'],
    ['prometheus', 'active', 'Firing'],
    ['prometheus', 'pending', 'Pending'],
    ['prometheus', 'resolved', 'Inactive'],
    ['cloudwatch', 'active', 'In alarm'],
    ['cloudwatch', 'resolved', 'OK'],
    ['cloudwatch', 'insufficient_data', 'Insufficient data'],
  ])('labels a %s alert in state %s "%s"', (ds, state, label) => {
    expect(getNativeAlertStateLabel(ds, state)).toBe(label);
  });
  it('keeps the unified word for unmapped states: anomaly, error, deleted', () => {
    expect(getNativeAlertStateLabel('opensearch', 'anomaly')).toBe('Anomaly');
    expect(getNativeAlertStateLabel('opensearch', 'error')).toBe(getStateLabel('error'));
    expect(getNativeAlertStateLabel('opensearch', 'deleted')).toBe(getStateLabel('deleted'));
    expect(getNativeAlertStateLabel(undefined, 'active')).toBe('Active');
    expect(getNativeAlertStateLabel('cloudwatch', undefined)).toBe(EMPTY_VALUE);
  });
  it.each([
    ['opensearch', 'active', undefined, 'Enabled'],
    ['opensearch', 'disabled', undefined, 'Disabled'],
    ['prometheus', 'active', undefined, 'Firing'],
    ['prometheus', 'pending', undefined, 'Pending'],
    ['prometheus', 'muted', undefined, 'Inactive'],
    ['cloudwatch', 'active', 'ALARM', 'In alarm'],
    ['cloudwatch', 'ok', 'OK', 'OK'],
    ['cloudwatch', 'insufficient_data', 'INSUFFICIENT_DATA', 'Insufficient data'],
  ])('labels a %s rule with status %s "%s"', (ds, status, cwState, label) => {
    const rule = {
      datasourceType: ds,
      status,
      cloudWatch: cwState ? { state: cwState } : undefined,
    };
    expect(getNativeRuleStatusLabel(rule)).toBe(label);
  });
  it('reads a CloudWatch rule by the window-end state when one is given', () => {
    const rule = { datasourceType: 'cloudwatch', status: 'active', cloudWatch: { state: 'ALARM' } };
    expect(getNativeRuleStatusLabel(rule, 'OK')).toBe('OK');
    expect(getNativeRuleStatusLabel({ datasourceType: 'cloudwatch', status: 'ok' })).toBe('OK');
  });
  it('never reads "Active" for an OpenSearch rule (one word, one meaning)', () => {
    expect(getNativeRuleStatusLabel({ datasourceType: 'opensearch', status: 'active' })).not.toBe(
      'Active'
    );
  });
  it('marks only breached statuses for the red tag', () => {
    for (const ds of ['opensearch', 'prometheus', 'cloudwatch']) {
      expect(isBreachStatus('alert', ds, 'active')).toBe(true);
      for (const s of ['pending', 'insufficient_data', 'acknowledged', 'resolved', 'error']) {
        expect(isBreachStatus('alert', ds, s)).toBe(false);
      }
    }
    expect(isBreachStatus('alert', 'opensearch', 'anomaly')).toBe(false);
    expect(isBreachStatus('alert', 'opensearch', 'deleted')).toBe(false);
    expect(isBreachStatus('rule', 'prometheus', 'active')).toBe(true);
    expect(isBreachStatus('rule', 'cloudwatch', 'active')).toBe(true);
    expect(isBreachStatus('rule', 'opensearch', 'active')).toBe(false);
    expect(isBreachStatus('rule', undefined, 'active')).toBe(false);
    expect(isBreachStatus('rule', 'cloudwatch', 'ok')).toBe(false);
    expect(isBreachStatus('rule', 'prometheus', 'pending')).toBe(false);
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EMPTY_VALUE,
  SEVERITY_LABELS,
  STATE_LABELS,
  getMonitorStateLabel,
  getSeverityLabel,
  getStateLabel,
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
});

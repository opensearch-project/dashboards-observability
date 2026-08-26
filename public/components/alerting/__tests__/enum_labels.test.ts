/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EMPTY_VALUE,
  SEVERITY_LABELS,
  STATE_LABELS,
  getSeverityLabel,
  getStateLabel,
} from '../enum_labels';
import type { UnifiedAlertSeverity, UnifiedAlertState } from '../../../../common/types/alerting';

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

  it('falls back to the placeholder when an unknown value is only separators', () => {
    expect(getStateLabel('__')).toBe(EMPTY_VALUE);
  });

  it('maps known values through the label tables', () => {
    expect(getSeverityLabel('critical')).toBe(SEVERITY_LABELS.critical);
    expect(getStateLabel('acknowledged')).toBe(STATE_LABELS.acknowledged);
  });
});

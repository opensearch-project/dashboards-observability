/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ALERT_KIND_HEX,
  SEVERITY_HEX,
  STATE_HEX,
  UNKNOWN_HEX,
  getSeverityHex,
  getStateHex,
} from '../alert_colors';
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

describe('alert_colors', () => {
  it('resolves every severity to a real theme color', () => {
    ALL_SEVERITIES.forEach((severity) => {
      // A typo in a euiThemeVars key yields `undefined`, which silently renders
      // as "no color" — assert we got an actual CSS color back.
      expect(SEVERITY_HEX[severity]).toMatch(/^#[0-9a-f]{3,8}$/i);
    });
  });

  it('resolves every state to a real theme color', () => {
    ALL_STATES.forEach((state) => {
      expect(STATE_HEX[state]).toMatch(/^#[0-9a-f]{3,8}$/i);
    });
  });

  it('resolves both row kinds and keeps anomaly distinct from a high-severity alert', () => {
    expect(ALERT_KIND_HEX.alert).toMatch(/^#[0-9a-f]{3,8}$/i);
    expect(ALERT_KIND_HEX.anomaly).toMatch(/^#[0-9a-f]{3,8}$/i);
    expect(ALERT_KIND_HEX.anomaly).not.toBe(SEVERITY_HEX.high);
  });

  it('gives critical and active the danger tone', () => {
    expect(getSeverityHex('critical')).toBe(SEVERITY_HEX.critical);
    expect(getStateHex('active')).toBe(STATE_HEX.active);
    expect(getStateHex('error')).toBe(STATE_HEX.active);
  });

  it('resolves the anomaly row kind through the state getter', () => {
    expect(getStateHex('anomaly')).toBe(ALERT_KIND_HEX.anomaly);
  });

  it('falls back to a subdued tone for missing or unknown values', () => {
    expect(getSeverityHex(undefined)).toBe(UNKNOWN_HEX);
    expect(getSeverityHex('sev0')).toBe(UNKNOWN_HEX);
    expect(getStateHex(null)).toBe(UNKNOWN_HEX);
    expect(getStateHex('quiesced')).toBe(UNKNOWN_HEX);
  });
});

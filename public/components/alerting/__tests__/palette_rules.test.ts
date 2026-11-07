/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { SEVERITY_HEX, STATE_HEX } from '../alert_colors';
import {
  SEVERITY_COLORS,
  STATE_COLORS,
  STATUS_COLORS,
  getCloudWatchStateBadgeColor,
  getCloudWatchStateHealthColor,
  getStatusBadgeColor,
} from '../shared_constants';

// Palette rules for the Alerts and Rules tabs: one severity palette from the
// OUI vis colors; status colors never paint "active" red or "no data" yellow.
describe('alerting palette rules', () => {
  it('badges use the same severity palette as swatches and the timeline', () => {
    expect(SEVERITY_COLORS).toEqual(SEVERITY_HEX);
  });

  it('severity colors come from the OUI vis palette, not status colors or the UI primary', () => {
    const vis = Array.from(
      { length: 10 },
      (_, i) => (euiThemeVars as Record<string, string>)[`euiColorVis${i}`]
    );
    Object.values(SEVERITY_HEX).forEach((hex) => {
      expect(vis).toContain(hex);
      expect(hex).not.toBe(euiThemeVars.euiColorPrimary);
    });
  });

  it('red never means "Active", whatever source the row comes from', () => {
    expect(STATUS_COLORS.active).toBe('primary');
    expect(getStatusBadgeColor('active')).toBe('primary');
  });

  it('status badges only get named EuiBadge colors', () => {
    const badgeColors = ['default', 'hollow', 'primary', 'success', 'accent', 'warning', 'danger'];
    Object.keys(STATUS_COLORS).forEach((status) => {
      expect(badgeColors).toContain(getStatusBadgeColor(status));
    });
    expect(getStatusBadgeColor('insufficient_data')).toBe('default');
    expect(getStatusBadgeColor('unknown-status')).toBe('default');
  });

  it('severity slots stay apart: Critical is not the High hue', () => {
    expect(SEVERITY_HEX.critical).not.toBe(SEVERITY_HEX.high);
    expect(new Set(Object.values(SEVERITY_HEX)).size).toBe(5);
  });

  it('absence of data is never warning yellow', () => {
    expect(STATUS_COLORS.insufficient_data).not.toBe('warning');
    expect(STATUS_COLORS['Awaiting data to init']).not.toBe('warning');
    expect(STATUS_COLORS['Awaiting data to restart']).not.toBe('warning');
    expect(STATE_COLORS.insufficient_data).not.toBe('warning');
    expect(STATE_HEX.insufficient_data).not.toBe(euiThemeVars.euiColorWarning);
  });

  it('CloudWatch states take the palette slot of the unified state they map to', () => {
    expect(getCloudWatchStateHealthColor('ALARM')).toBe(STATE_COLORS.active);
    expect(getCloudWatchStateHealthColor('OK')).toBe(STATE_COLORS.resolved);
    expect(getCloudWatchStateHealthColor('INSUFFICIENT_DATA')).toBe(STATE_COLORS.insufficient_data);
    // No yellow for missing data, and badges only get named badge colors.
    expect(getCloudWatchStateBadgeColor('INSUFFICIENT_DATA')).toBe('default');
    expect(getCloudWatchStateBadgeColor(undefined)).toBe('default');
  });
});

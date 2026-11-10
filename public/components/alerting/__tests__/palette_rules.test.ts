/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { euiPaletteGray } from '@elastic/eui';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { SEVERITY_HEX, STATE_HEX, UNKNOWN_HEX } from '../alert_colors';
import {
  SEVERITY_COLORS,
  STATE_COLORS,
  STATUS_COLORS,
  getCloudWatchStateBadgeColor,
  getCloudWatchStateHealthColor,
  getRuleStatusColor,
  getStatusBadgeColor,
} from '../shared_constants';

// Palette rules for the Alerts and Rules tabs: one severity palette, kept apart
// from the status colors; status colors never paint "active" red or "no data" yellow.
describe('alerting palette rules', () => {
  it('badges use the same severity palette as swatches and the timeline', () => {
    expect(SEVERITY_COLORS).toEqual(SEVERITY_HEX);
  });

  it('severity colors are never the status colors or the UI primary', () => {
    const reserved = [
      euiThemeVars.euiColorPrimary,
      euiThemeVars.euiColorDanger,
      euiThemeVars.euiColorWarning,
      euiThemeVars.euiColorSuccess,
    ].map((c) => c.toLowerCase());
    Object.values(SEVERITY_HEX).forEach((hex) => {
      expect(reserved).not.toContain(hex.toLowerCase());
    });
  });

  it('severity reads warm to cool from OUI tokens: Vis8, Vis7, Vis5, Vis1, then gray', () => {
    expect(SEVERITY_HEX).toEqual({
      critical: euiThemeVars.euiColorVis8,
      high: euiThemeVars.euiColorVis7,
      medium: euiThemeVars.euiColorVis5,
      low: euiThemeVars.euiColorVis1,
      info: euiPaletteGray(5)[2],
    });
  });

  it('every severity stays clearly apart from the neutral gray (unknown / silenced / no data)', () => {
    // CIE76 distance in CIELAB; 10 is well past a just-noticeable difference.
    const lab = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const v = parseInt(hex.substr(i, 2), 16) / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
      const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
      const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
      const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
      return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
    };
    const distance = (a: string, b: string) => {
      const [p, q] = [lab(a), lab(b)];
      return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    };
    const neutrals = [UNKNOWN_HEX, STATE_HEX.silenced, STATE_HEX.insufficient_data];
    Object.entries(SEVERITY_HEX).forEach(([, hex]) => {
      neutrals.forEach((neutral) => {
        expect(distance(hex, neutral)).toBeGreaterThan(10);
      });
    });
  });

  it('red never means healthy or enabled: an enabled OpenSearch monitor is not red', () => {
    expect(STATUS_COLORS.active).toBe('primary');
    expect(getRuleStatusColor('active', 'opensearch')).toBe('primary');
    expect(getStatusBadgeColor('active', 'opensearch')).toBe('primary');
  });

  it('an alarm condition is red: a firing Prometheus rule or a CloudWatch alarm in ALARM', () => {
    expect(getRuleStatusColor('active', 'prometheus')).toBe('danger');
    expect(getRuleStatusColor('active', 'cloudwatch')).toBe('danger');
    expect(getStatusBadgeColor('active', 'prometheus')).toBe('danger');
    expect(getRuleStatusColor('pending', 'prometheus')).toBe('warning');
  });

  it('alert states: firing red, acknowledged blue, resolved green, silenced not red', () => {
    expect(STATE_COLORS.active).toBe('danger');
    expect(STATE_COLORS.acknowledged).toBe('primary');
    expect(STATE_COLORS.resolved).toBe('success');
    expect(STATE_COLORS.silenced).not.toBe('danger');
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

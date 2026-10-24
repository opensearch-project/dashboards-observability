/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  AlarmTimeWindow,
  defaultAlarmTimeWindow,
  describeTimeRange,
  isInWindow,
  noChangesInWindowMessage,
  stateHistoryUnavailableMessage,
} from '../alarm_time_window';

const timeWindow: AlarmTimeWindow = {
  startMs: Date.parse('2026-10-01T12:00:00.000Z'),
  endMs: Date.parse('2026-10-02T12:00:00.000Z'),
  label: 'last 24h',
};

describe('describeTimeRange', () => {
  it('names a relative range ending now', () => {
    expect(describeTimeRange('now-24h', 'now')).toBe('last 24h');
    expect(describeTimeRange('now-7d', 'now')).toBe('last 7d');
    expect(describeTimeRange('now-3M', 'now')).toBe('last 3mo');
  });

  it('falls back to "the selected range" otherwise', () => {
    expect(describeTimeRange('now-7d', 'now-1d')).toBe('the selected range');
    expect(describeTimeRange('2026-10-01T00:00:00Z', 'now')).toBe('the selected range');
    expect(describeTimeRange(undefined, undefined)).toBe('the selected range');
  });
});

describe('defaultAlarmTimeWindow', () => {
  it('is the last 24h', () => {
    const now = Date.parse('2026-10-02T12:00:00.000Z');
    expect(defaultAlarmTimeWindow(now)).toEqual({
      startMs: now - 24 * 60 * 60 * 1000,
      endMs: now,
      label: 'last 24h',
    });
  });
});

describe('isInWindow', () => {
  it('includes both edges and rejects missing or bad timestamps', () => {
    expect(isInWindow('2026-10-01T12:00:00.000Z', timeWindow)).toBe(true);
    expect(isInWindow('2026-10-02T12:00:00.000Z', timeWindow)).toBe(true);
    expect(isInWindow('2026-10-01T11:59:59.999Z', timeWindow)).toBe(false);
    expect(isInWindow(undefined, timeWindow)).toBe(false);
    expect(isInWindow('not a date', timeWindow)).toBe(false);
  });
});

describe('noChangesInWindowMessage', () => {
  const now = timeWindow.endMs;
  it('names the last change when it was before the window', () => {
    expect(noChangesInWindowMessage(timeWindow, '2026-09-24T12:00:00.000Z', now)).toBe(
      'No changes in last 24h, last change 9/24'
    );
  });

  it('leaves out the last change when it is unknown or not before the window', () => {
    expect(noChangesInWindowMessage(timeWindow, undefined, now)).toBe('No changes in last 24h.');
    expect(noChangesInWindowMessage(timeWindow, '2026-10-02T06:00:00.000Z', now)).toBe(
      'No changes in last 24h.'
    );
  });

  it("says a window older than CloudWatch's 30-day history isn't available", () => {
    const old = { ...timeWindow, label: 'the selected range' };
    expect(noChangesInWindowMessage(old, undefined, timeWindow.endMs + 31 * 86_400_000)).toBe(
      "CloudWatch keeps 30 days of alarm history, so the selected range isn't available."
    );
  });
});

describe('stateHistoryUnavailableMessage', () => {
  it('names the datasource', () => {
    expect(stateHistoryUnavailableMessage('opensearch')).toBe(
      "State history isn't available for OpenSearch rules."
    );
    expect(stateHistoryUnavailableMessage('prometheus')).toBe(
      "State history isn't available for Prometheus rules."
    );
  });
});

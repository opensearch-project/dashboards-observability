/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '@testing-library/react';

// Mock echarts at the module level so the EchartsRender children render
// without needing a real canvas. We capture the last setOption payload to
// assert on chart specs.
const mockSetOption = jest.fn();
jest.mock('echarts', () => ({
  init: jest.fn(() => ({
    setOption: mockSetOption,
    resize: jest.fn(),
    dispose: jest.fn(),
  })),
}));

global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
}));

import { AlertTimeline } from '../alerts_charts';
import type { UnifiedAlertSummary } from '../../../../common/types/alerting';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const makeAlert = (overrides: Partial<UnifiedAlertSummary>): UnifiedAlertSummary => ({
  id: 'alert-1',
  datasourceId: 'ds-1',
  datasourceType: 'prometheus',
  name: 'HighCpuUsage',
  state: 'active',
  severity: 'critical',
  startTime: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  labels: {},
  annotations: {},
  ...overrides,
});

// Pinned end time for deterministic label formatting across time zones.
// (We read labels off the spec; they're derived from `Date(ts).getHours()`
// which is TZ-sensitive. Tests compare format shape, not exact hour/date.)
const END = new Date('2026-05-08T12:00:00Z').getTime();

describe('alerts_charts', () => {
  beforeEach(() => {
    mockSetOption.mockClear();
  });

  it('AlertTimeline renders one stacked bar series per severity', () => {
    const alerts = [
      makeAlert({
        id: '1',
        severity: 'critical',
        startTime: new Date(END - 10 * 60 * 1000).toISOString(),
      }),
      makeAlert({
        id: '2',
        severity: 'high',
        startTime: new Date(END - 20 * 60 * 1000).toISOString(),
      }),
    ];
    render(<AlertTimeline alerts={alerts} startMs={END - HOUR_MS} endMs={END} />);

    const option = mockSetOption.mock.calls[0][0] as {
      series: Array<{ name: string; type: string; stack: string }>;
    };
    expect(option.series.map((s) => s.name)).toEqual(['critical', 'high', 'medium', 'low', 'info']);
    expect(option.series.every((s) => s.type === 'bar' && s.stack === 'severity')).toBe(true);
  });

  it('AlertTimeline shows an empty-state message when there are no alerts', () => {
    const { getByText } = render(<AlertTimeline alerts={[]} startMs={END - HOUR_MS} endMs={END} />);
    expect(getByText('No timeline data')).toBeInTheDocument();
    expect(mockSetOption).not.toHaveBeenCalled();
  });

  it('AlertTimeline: 1h range produces 12 buckets (5-minute target width)', () => {
    const alerts = [makeAlert({ startTime: new Date(END - 30 * 60 * 1000).toISOString() })];
    render(<AlertTimeline alerts={alerts} startMs={END - HOUR_MS} endMs={END} />);

    const option = mockSetOption.mock.calls[0][0] as {
      xAxis: { data: string[] };
      series: Array<{ data: number[] }>;
    };
    expect(option.xAxis.data).toHaveLength(12);
    // Every series shares the same bucket count.
    expect(option.series[0].data).toHaveLength(12);
  });

  it('AlertTimeline: label format is HH:mm for ranges ≤ 24h', () => {
    const alerts = [makeAlert({ startTime: new Date(END - 30 * 60 * 1000).toISOString() })];
    render(<AlertTimeline alerts={alerts} startMs={END - HOUR_MS} endMs={END} />);

    const option = mockSetOption.mock.calls[0][0] as { xAxis: { data: string[] } };
    // All labels match "HH:mm" — no date component.
    for (const label of option.xAxis.data) {
      expect(label).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it('AlertTimeline: label format switches to MM-DD HH:mm for 7d ranges', () => {
    const start = END - 7 * DAY_MS;
    const alerts = [makeAlert({ startTime: new Date(END - DAY_MS).toISOString() })];
    render(<AlertTimeline alerts={alerts} startMs={start} endMs={END} />);

    const option = mockSetOption.mock.calls[0][0] as { xAxis: { data: string[] } };
    for (const label of option.xAxis.data) {
      expect(label).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/);
    }
  });

  it('AlertTimeline: label format is MM-DD for ranges > 7d', () => {
    const start = END - 30 * DAY_MS;
    const alerts = [makeAlert({ startTime: new Date(END - 5 * DAY_MS).toISOString() })];
    render(<AlertTimeline alerts={alerts} startMs={start} endMs={END} />);

    const option = mockSetOption.mock.calls[0][0] as { xAxis: { data: string[] } };
    for (const label of option.xAxis.data) {
      expect(label).toMatch(/^\d{2}-\d{2}$/);
    }
  });

  it('AlertTimeline: bucket count stays clamped to [12, 24] for extreme ranges', () => {
    // 5-minute range — should clamp UP to the minimum of 12 buckets.
    const shortStart = END - 5 * 60 * 1000;
    const shortAlerts = [makeAlert({ startTime: new Date(END - 60 * 1000).toISOString() })];
    render(<AlertTimeline alerts={shortAlerts} startMs={shortStart} endMs={END} />);
    const shortOpt = mockSetOption.mock.calls[0][0] as { xAxis: { data: string[] } };
    expect(shortOpt.xAxis.data).toHaveLength(12);

    mockSetOption.mockClear();

    // 30-day range — should clamp DOWN to the maximum of 24 buckets.
    const longStart = END - 30 * DAY_MS;
    const longAlerts = [makeAlert({ startTime: new Date(END - 15 * DAY_MS).toISOString() })];
    render(<AlertTimeline alerts={longAlerts} startMs={longStart} endMs={END} />);
    const longOpt = mockSetOption.mock.calls[0][0] as { xAxis: { data: string[] } };
    expect(longOpt.xAxis.data).toHaveLength(24);
  });

  it('AlertTimeline: alerts falling outside the window are excluded from all buckets', () => {
    const start = END - HOUR_MS;
    const alerts = [
      // In-window — counted.
      makeAlert({
        id: '1',
        severity: 'critical',
        startTime: new Date(END - 30 * 60 * 1000).toISOString(),
      }),
      // Before window — dropped.
      makeAlert({
        id: '2',
        severity: 'critical',
        startTime: new Date(END - 2 * HOUR_MS).toISOString(),
      }),
      // After window — dropped (alert.startTime >= bucketEnd of the last bucket).
      makeAlert({
        id: '3',
        severity: 'critical',
        startTime: new Date(END + 60 * 1000).toISOString(),
      }),
    ];
    render(<AlertTimeline alerts={alerts} startMs={start} endMs={END} />);

    const option = mockSetOption.mock.calls[0][0] as {
      series: Array<{ name: string; data: number[] }>;
    };
    const critical = option.series.find((s) => s.name === 'critical');
    expect(critical).toBeDefined();
    const total = (critical!.data as number[]).reduce((a, b) => a + b, 0);
    expect(total).toBe(1);
  });
});

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

import { AlertsByGroup, AlertTimeline, SeverityDonut, StateBreakdown } from '../alerts_charts';
import type { UnifiedAlertSummary } from '../../../../common/types/alerting';

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

describe('alerts_charts', () => {
  beforeEach(() => {
    mockSetOption.mockClear();
  });

  it('SeverityDonut renders a pie series with one entry per present severity', () => {
    const alerts = [
      makeAlert({ id: '1', severity: 'critical' }),
      makeAlert({ id: '2', severity: 'critical' }),
      makeAlert({ id: '3', severity: 'high' }),
      makeAlert({ id: '4', severity: 'low' }),
    ];

    render(<SeverityDonut alerts={alerts} />);

    expect(mockSetOption).toHaveBeenCalled();
    const lastCall = mockSetOption.mock.calls[mockSetOption.mock.calls.length - 1];
    const option = lastCall[0] as {
      series: Array<{ type: string; data: Array<{ name: string; value: number }> }>;
    };
    expect(option.series[0].type).toBe('pie');
    // Entries are filtered to only severities with count > 0; order follows SEVERITY_ORDER.
    expect(option.series[0].data.map((d) => d.name)).toEqual(['critical', 'high', 'low']);
    expect(option.series[0].data.map((d) => d.value)).toEqual([2, 1, 1]);
  });

  it('SeverityDonut shows an empty-state message when there are no alerts', () => {
    const { getByText } = render(<SeverityDonut alerts={[]} />);
    expect(getByText('No alerts')).toBeInTheDocument();
    expect(mockSetOption).not.toHaveBeenCalled();
  });

  it('AlertTimeline renders one stacked bar series per severity', () => {
    const alerts = [
      makeAlert({ id: '1', severity: 'critical' }),
      makeAlert({ id: '2', severity: 'high' }),
    ];
    render(<AlertTimeline alerts={alerts} />);

    const option = mockSetOption.mock.calls[0][0] as {
      series: Array<{ name: string; type: string; stack: string }>;
    };
    expect(option.series.map((s) => s.name)).toEqual(['critical', 'high', 'medium', 'low', 'info']);
    expect(option.series.every((s) => s.type === 'bar' && s.stack === 'severity')).toBe(true);
  });

  it('StateBreakdown renders bars only for present states', () => {
    const alerts = [
      makeAlert({ id: '1', state: 'active' }),
      makeAlert({ id: '2', state: 'resolved' }),
      makeAlert({ id: '3', state: 'resolved' }),
    ];
    render(<StateBreakdown alerts={alerts} />);

    const option = mockSetOption.mock.calls[0][0] as {
      series: Array<{ name: string; data: number[] }>;
    };
    expect(option.series.map((s) => s.name)).toEqual(['active', 'resolved']);
    expect(option.series.map((s) => s.data[0])).toEqual([1, 2]);
  });

  it('AlertsByGroup renders grouped bars for a label key without going through ECharts', () => {
    const alerts = [
      makeAlert({ id: '1', labels: { team: 'infra' } }),
      makeAlert({ id: '2', labels: { team: 'infra' } }),
      makeAlert({ id: '3', labels: { team: 'storage' } }),
    ];
    const { getByTestId, getByText } = render(<AlertsByGroup alerts={alerts} groupKey="team" />);
    expect(getByTestId('alertsByGroup')).toBeInTheDocument();
    expect(getByText('infra')).toBeInTheDocument();
    expect(getByText('storage')).toBeInTheDocument();
    // ECharts is NOT used for AlertsByGroup — it renders plain divs.
    expect(mockSetOption).not.toHaveBeenCalled();
  });
});

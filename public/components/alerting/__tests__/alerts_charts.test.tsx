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

  it('AlertTimeline shows an empty-state message when there are no alerts', () => {
    const { getByText } = render(<AlertTimeline alerts={[]} />);
    expect(getByText('No timeline data')).toBeInTheDocument();
    expect(mockSetOption).not.toHaveBeenCalled();
  });
});

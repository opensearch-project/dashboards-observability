/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '@testing-library/react';

// Capture the props each chart receives instead of rendering ECharts.
const mockChartProps: Array<Record<string, unknown>> = [];
jest.mock('../../promql_line_chart', () => ({
  PromQLLineChart: (props: Record<string, unknown>) => {
    mockChartProps.push(props);
    return <div data-test-subj="stubPromQLLineChart" />;
  },
}));

jest.mock('@osd/apm-topology', () => ({
  HealthDonut: () => <div data-test-subj="stubHealthDonut" />,
  HEALTH_DONUT_COLORS: { ok2xx: '#0f0', error4xx: '#ff0', fault5xx: '#f00' },
}));

jest.mock('../../../hooks/use_chart_step_window', () => ({
  useChartStepWindow: () => ({ window: '1m' }),
}));

import { ServiceDetailsPanel, ServiceDetailsPanelProps } from '../service_details_panel';

const baseProps: ServiceDetailsPanelProps = {
  node: {
    nodeId: 'checkout::prod',
    serviceName: 'checkout',
    environment: 'prod',
    platformType: 'generic',
  },
  metrics: null,
  isLoading: false,
  timeRange: { from: 'now-15m', to: 'now' },
  prometheusConnectionId: 'prom-1',
  onClose: jest.fn(),
  onViewDetails: jest.fn(),
};

describe('ServiceDetailsPanel', () => {
  beforeEach(() => {
    mockChartProps.length = 0;
  });

  it('passes onTimeRangeChange to every metric chart so brushing zooms the map', () => {
    const onTimeRangeChange = jest.fn();
    render(<ServiceDetailsPanel {...baseProps} onTimeRangeChange={onTimeRangeChange} />);

    // Requests, Latency, Faults, Errors.
    expect(mockChartProps).toHaveLength(4);
    mockChartProps.forEach((p) => expect(p.onTimeRangeChange).toBe(onTimeRangeChange));
  });

  it('leaves brushing disabled when onTimeRangeChange is not provided', () => {
    render(<ServiceDetailsPanel {...baseProps} />);

    expect(mockChartProps).toHaveLength(4);
    mockChartProps.forEach((p) => expect(p.onTimeRangeChange).toBeUndefined());
  });
});

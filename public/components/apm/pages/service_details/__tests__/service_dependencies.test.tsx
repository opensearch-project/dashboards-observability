/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// Counts expanded-row chart mounts to detect a table remount on a percentile switch
// (the pre-#2626 bug). See service_operations.test.tsx for the full rationale.
const mockChartState = { mounts: 0 };

jest.mock('../../../shared/hooks/use_dependencies', () => ({ useDependencies: jest.fn() }));
jest.mock('../../../shared/hooks/use_dependency_metrics', () => ({
  useDependencyMetrics: jest.fn(),
}));
jest.mock('../../../shared/hooks/use_chart_step_window', () => ({
  useChartStepWindow: () => ({ window: '1m' }),
}));
jest.mock('../../../shared/hooks/use_debounced_value', () => ({
  useDebouncedValue: (value: unknown) => value,
}));
jest.mock('../../../shared/components/dependency_filter_sidebar', () => ({
  // Expose the latency slider callback so tests can activate the range filter. Narrowing to
  // [latencyMax, latencyMax] leaves only the single highest-latency row.
  DependencyFilterSidebar: (props: {
    latencyMax: number;
    onLatencyRangeChange: (range: [number, number]) => void;
  }) => (
    <div data-test-subj="dependencyFilterSidebar">
      <button
        type="button"
        data-test-subj="mockNarrowLatencyRange"
        onClick={() => props.onLatencyRangeChange([props.latencyMax, props.latencyMax])}
      />
    </div>
  ),
}));
jest.mock('../../../shared/components/promql_line_chart', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const react = require('react');
  return {
    PromQLLineChart: () => {
      react.useEffect(() => {
        mockChartState.mounts += 1;
      }, []);
      return <div data-test-subj="promqlChart" />;
    },
  };
});

import { useDependencies } from '../../../shared/hooks/use_dependencies';
import { useDependencyMetrics } from '../../../shared/hooks/use_dependency_metrics';
import { ServiceDependencies } from '../service_dependencies';

const ROW_COUNT = 15; // > DEFAULT_PAGE_SIZE (10), so page 2 exists

const svc = (i: number) => `dep-svc-${String(i).padStart(2, '0')}`;
const compositeKey = (i: number) => `${svc(i)}:GET /op`;

// Sorted by availability asc, so dep-svc-00 has the lowest availability and auto-expands on load.
const buildDependencies = () =>
  Array.from({ length: ROW_COUNT }, (_, i) => ({
    serviceName: svc(i),
    environment: 'prod',
    remoteOperation: 'GET /op',
    serviceOperations: ['GET /checkout'],
    callCount: 100 + i,
    requestCount: 100 + i,
    p50Duration: 10 + i,
    p90Duration: 20 + i,
    p99Duration: 30 + i,
    faultRate: 0,
    errorRate: 0,
    availability: i,
  }));

const buildMetricsMap = (deps: ReturnType<typeof buildDependencies>) =>
  new Map(
    deps.map((dep, i) => [
      compositeKey(i),
      {
        requestCount: dep.requestCount,
        p50Duration: dep.p50Duration,
        p90Duration: dep.p90Duration,
        p99Duration: dep.p99Duration,
        errorRate: dep.errorRate,
        availability: dep.availability,
      },
    ])
  );

const props = {
  serviceName: 'checkout',
  environment: 'prod',
  timeRange: { from: 'now-1h', to: 'now' },
  prometheusConnectionId: 'prom-1',
  serviceMapDataset: 'otel-v1-apm-span',
};

// EuiSuperSelect is not a native <select>: click the control to open the popover, then click
// the option. Targeting the stable data-test-subj avoids grabbing an unrelated EuiSuperSelect.
const switchPercentile = (label: 'P99' | 'P90' | 'P50') => {
  fireEvent.click(screen.getByTestId('dependencyLatencyPercentileSelector'));
  const listbox = screen.getByRole('listbox');
  fireEvent.click(within(listbox).getByText(label));
};

describe('ServiceDependencies - percentile switch does not remount the table (#2626)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChartState.mounts = 0;
    const dependencies = buildDependencies();
    (useDependencies as jest.Mock).mockReturnValue({
      data: dependencies,
      groupedData: dependencies,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    (useDependencyMetrics as jest.Mock).mockReturnValue({
      metrics: buildMetricsMap(dependencies),
      isLoading: false,
      error: null,
    });
  });

  it('should not reload the expanded-row charts when the latency percentile changes', async () => {
    render(<ServiceDependencies {...props} />);

    // dep-svc-00 auto-expands on load, mounting its 3 charts.
    await waitFor(() => expect(screen.getAllByTestId('promqlChart')).toHaveLength(3));

    const mountsBeforeSwitch = mockChartState.mounts;
    switchPercentile('P90');

    expect(mockChartState.mounts).toBe(mountsBeforeSwitch);
  });

  it('should keep the expanded row expanded across a percentile switch', async () => {
    render(<ServiceDependencies {...props} />);

    await waitFor(() => expect(screen.getAllByTestId('promqlChart')).toHaveLength(3));
    expect(screen.getByText(svc(0))).toBeInTheDocument();

    switchPercentile('P90');

    expect(screen.getAllByTestId('promqlChart')).toHaveLength(3);
    expect(screen.getByText(svc(0))).toBeInTheDocument();
  });

  // EuiInMemoryTable resets pageIndex to 0 when the `items` reference changes, and
  // filteredDependencies is a new array on every percentile change. Controlled pagination
  // (pageIndex/pageSize in state) keeps the user on the current page.
  it('should keep the user on the current pagination page across a percentile switch', async () => {
    render(<ServiceDependencies {...props} />);

    await waitFor(() => expect(screen.getByText(svc(0))).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('pagination-button-1')); // page 2
    expect(screen.getByText(svc(14))).toBeInTheDocument();
    expect(screen.queryByText(svc(0))).not.toBeInTheDocument();

    switchPercentile('P90');

    expect(screen.getByText(svc(14))).toBeInTheDocument();
    expect(screen.queryByText(svc(0))).not.toBeInTheDocument();
  });

  // Unlike a percentile switch, changing a filter produces a new result set, so the user should
  // land back on page 1 (the top of the filtered results) rather than a stale high page.
  it('should reset to page 1 when a filter changes', async () => {
    render(<ServiceDependencies {...props} />);

    await waitFor(() => expect(screen.getByText(svc(0))).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('pagination-button-1')); // page 2
    expect(screen.getByText(svc(14))).toBeInTheDocument();
    expect(screen.queryByText(svc(0))).not.toBeInTheDocument();

    // Typing a query that still matches all 15 rows keeps 2 pages, so the jump back to page 1
    // is a deliberate filter reset, not the row-count clamp.
    fireEvent.change(screen.getByPlaceholderText('Filter dependencies...'), {
      target: { value: 'dep' },
    });

    expect(screen.getByText(svc(0))).toBeInTheDocument();
    expect(screen.queryByText(svc(14))).not.toBeInTheDocument();
  });

  // A percentile switch resets the latency gate, so a range filter set under one percentile does
  // not carry over to the next; moving the slider again re-engages it. This locks the gate's
  // user-facing behavior and is not sensitive to the ref-vs-state implementation of the flag.
  it('should clear the latency filter on a percentile switch and re-engage it when the slider moves again', async () => {
    render(<ServiceDependencies {...props} />);

    await waitFor(() => expect(screen.getByText(svc(0))).toBeInTheDocument());

    // Move the slider to the top of the range: only the highest-latency row (dep-svc-14) survives.
    fireEvent.click(screen.getByTestId('mockNarrowLatencyRange'));
    expect(screen.getByText(svc(14))).toBeInTheDocument();
    expect(screen.queryByText(svc(0))).not.toBeInTheDocument();

    // Switching percentile clears the filter: every row returns.
    switchPercentile('P90');
    expect(screen.getByText(svc(0))).toBeInTheDocument();

    // Moving the slider again re-engages the filter under the new percentile.
    fireEvent.click(screen.getByTestId('mockNarrowLatencyRange'));
    expect(screen.getByText(svc(14))).toBeInTheDocument();
    expect(screen.queryByText(svc(0))).not.toBeInTheDocument();
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// Counts expanded-row chart mounts. The pre-#2626 bug keyed the table on latencyPercentile,
// so a percentile switch remounted every row's charts (which re-fetch on mount). The fix
// removes that key; this counter catches a regression.
const mockChartState = { mounts: 0 };

jest.mock('../../../shared/hooks/use_operations', () => ({ useOperations: jest.fn() }));
jest.mock('../../../shared/hooks/use_operation_metrics', () => ({
  useOperationMetrics: jest.fn(),
}));
jest.mock('../../../shared/hooks/use_chart_step_window', () => ({
  useChartStepWindow: () => ({ window: '1m' }),
}));
jest.mock('../../../shared/hooks/use_debounced_value', () => ({
  useDebouncedValue: (value: unknown) => value,
}));
jest.mock('../../../shared/components/operation_filter_sidebar', () => ({
  // Expose the latency slider callback so tests can activate the range filter. Narrowing to
  // [latencyMax, latencyMax] leaves only the single highest-latency row.
  OperationFilterSidebar: (props: {
    latencyMax: number;
    onLatencyRangeChange: (range: [number, number]) => void;
  }) => (
    <div data-test-subj="operationFilterSidebar">
      <button
        type="button"
        data-test-subj="mockNarrowLatencyRange"
        onClick={() => props.onLatencyRangeChange([props.latencyMax, props.latencyMax])}
      />
    </div>
  ),
}));
jest.mock('../../../shared/components/service_correlations_flyout', () => ({
  ServiceCorrelationsFlyout: () => <div data-test-subj="correlationsFlyout" />,
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

import { useOperations } from '../../../shared/hooks/use_operations';
import { useOperationMetrics } from '../../../shared/hooks/use_operation_metrics';
import { ServiceOperations } from '../service_operations';

const ROW_COUNT = 15; // > DEFAULT_PAGE_SIZE (10), so page 2 exists

const padded = (i: number) => `op-${String(i).padStart(2, '0')}`;

// Sorted by availability asc, so op-00 has the lowest availability and auto-expands on load.
const buildOperations = () =>
  Array.from({ length: ROW_COUNT }, (_, i) => ({
    operationName: padded(i),
    requestCount: 100 + i,
    errorRate: 0,
    faultRate: 0,
    avgDuration: 10 + i,
    p50Duration: 10 + i,
    p90Duration: 20 + i,
    p99Duration: 30 + i,
    availability: i,
    dependencyCount: 0,
  }));

const buildMetricsMap = (operations: ReturnType<typeof buildOperations>) =>
  new Map(
    operations.map((op) => [
      op.operationName,
      {
        requestCount: op.requestCount,
        p50Duration: op.p50Duration,
        p90Duration: op.p90Duration,
        p99Duration: op.p99Duration,
        errorRate: op.errorRate,
        availability: op.availability,
        dependencyCount: op.dependencyCount,
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

// EuiSuperSelect is not a native <select>: click to open the popover, then click the option.
const switchPercentile = (label: 'P99' | 'P90' | 'P50') => {
  fireEvent.click(screen.getByTestId('latencyPercentileSelector'));
  const listbox = screen.getByRole('listbox');
  fireEvent.click(within(listbox).getByText(label));
};

describe('ServiceOperations - percentile switch does not remount the table (#2626)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChartState.mounts = 0;
    const operations = buildOperations();
    (useOperations as jest.Mock).mockReturnValue({
      data: operations,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    (useOperationMetrics as jest.Mock).mockReturnValue({
      metrics: buildMetricsMap(operations),
      isLoading: false,
      error: null,
    });
  });

  it('should not reload the expanded-row charts when the latency percentile changes', async () => {
    render(<ServiceOperations {...props} />);

    // The lowest-availability row (op-00) auto-expands on load, mounting its 3 charts.
    await waitFor(() => expect(screen.getAllByTestId('promqlChart')).toHaveLength(3));

    const mountsBeforeSwitch = mockChartState.mounts;
    switchPercentile('P90');

    // No remount: charts stayed mounted, so the count is unchanged.
    expect(mockChartState.mounts).toBe(mountsBeforeSwitch);
  });

  it('should keep the expanded row expanded across a percentile switch', async () => {
    render(<ServiceOperations {...props} />);

    await waitFor(() => expect(screen.getAllByTestId('promqlChart')).toHaveLength(3));
    expect(screen.getByText(padded(0))).toBeInTheDocument();

    switchPercentile('P90');

    // Same row still expanded with its 3 charts after the switch.
    expect(screen.getAllByTestId('promqlChart')).toHaveLength(3);
    expect(screen.getByText(padded(0))).toBeInTheDocument();
  });

  // EuiInMemoryTable resets pageIndex to 0 when the `items` reference changes, and
  // filteredOperations is a new array on every percentile change. Controlled pagination
  // (pageIndex/pageSize in state) keeps the user on the current page.
  it('should keep the user on the current pagination page across a percentile switch', async () => {
    render(<ServiceOperations {...props} />);

    await waitFor(() => expect(screen.getByText(padded(0))).toBeInTheDocument());

    // Go to page 2 (EUI pagination buttons are 0-indexed).
    fireEvent.click(screen.getByTestId('pagination-button-1'));
    expect(screen.getByText(padded(14))).toBeInTheDocument();
    expect(screen.queryByText(padded(0))).not.toBeInTheDocument();

    switchPercentile('P90');

    expect(screen.getByText(padded(14))).toBeInTheDocument();
    expect(screen.queryByText(padded(0))).not.toBeInTheDocument();
  });

  // Unlike a percentile switch, changing a filter produces a new result set, so the user should
  // land back on page 1 (the top of the filtered results) rather than a stale high page.
  it('should reset to page 1 when a filter changes', async () => {
    render(<ServiceOperations {...props} />);

    await waitFor(() => expect(screen.getByText(padded(0))).toBeInTheDocument());

    // Go to page 2.
    fireEvent.click(screen.getByTestId('pagination-button-1'));
    expect(screen.getByText(padded(14))).toBeInTheDocument();
    expect(screen.queryByText(padded(0))).not.toBeInTheDocument();

    // Typing a query that still matches all 15 rows keeps 2 pages, so the jump back to page 1
    // is a deliberate filter reset, not the row-count clamp.
    fireEvent.change(screen.getByTestId('operationsSearchBar'), { target: { value: 'op' } });

    expect(screen.getByText(padded(0))).toBeInTheDocument();
    expect(screen.queryByText(padded(14))).not.toBeInTheDocument();
  });

  // A percentile switch resets the latency gate, so a range filter set under one percentile does
  // not carry over to the next; moving the slider again re-engages it. This locks the gate's
  // user-facing behavior and is not sensitive to the ref-vs-state implementation of the flag.
  it('should clear the latency filter on a percentile switch and re-engage it when the slider moves again', async () => {
    render(<ServiceOperations {...props} />);

    await waitFor(() => expect(screen.getByText(padded(0))).toBeInTheDocument());

    // Move the slider to the top of the range: only the highest-latency row (op-14) survives.
    fireEvent.click(screen.getByTestId('mockNarrowLatencyRange'));
    expect(screen.getByText(padded(14))).toBeInTheDocument();
    expect(screen.queryByText(padded(0))).not.toBeInTheDocument();

    // Switching percentile clears the filter: every row returns.
    switchPercentile('P90');
    expect(screen.getByText(padded(0))).toBeInTheDocument();

    // Moving the slider again re-engages the filter under the new percentile.
    fireEvent.click(screen.getByTestId('mockNarrowLatencyRange'));
    expect(screen.getByText(padded(14))).toBeInTheDocument();
    expect(screen.queryByText(padded(0))).not.toBeInTheDocument();
  });
});

describe('ServiceOperations - requests filter does not blank the table on load', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const operations = buildOperations();
    (useOperations as jest.Mock).mockReturnValue({
      data: operations,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    (useOperationMetrics as jest.Mock).mockReturnValue({
      metrics: buildMetricsMap(operations),
      isLoading: false,
      error: null,
    });
  });

  // requestsRange starts at [0,0] while requestsBounds derives from the data, so an ungated filter
  // reads active and blanks the table for the one commit before the bounds effect resets the range.
  // The profiler is needed because render() flushes that effect before returning, hiding the transient.
  it('should show rows on every commit while bounds and range settle', () => {
    const rowVisiblePerCommit: boolean[] = [];
    render(
      <React.Profiler
        id="operations"
        onRender={() => {
          rowVisiblePerCommit.push(document.body.textContent?.includes(padded(0)) ?? false);
        }}
      >
        <ServiceOperations {...props} />
      </React.Profiler>
    );

    expect(rowVisiblePerCommit.length).toBeGreaterThan(0);
    expect(rowVisiblePerCommit.every(Boolean)).toBe(true);
  });
});

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
  OperationFilterSidebar: () => <div data-test-subj="operationFilterSidebar" />,
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
});

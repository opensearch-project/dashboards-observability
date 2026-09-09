/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useServicesRedMetrics, serviceNodeKey } from '../use_services_red_metrics';

// Mock the PromQLSearchService
const mockExecuteMetricRequest = jest.fn();
const mockExecuteInstantQuery = jest.fn();
jest.mock('../../../query_services/promql_search_service', () => ({
  PromQLSearchService: jest.fn().mockImplementation(() => ({
    executeMetricRequest: mockExecuteMetricRequest,
    executeInstantQuery: mockExecuteInstantQuery,
  })),
}));

// Mock the APM config context
const mockConfig = {
  prometheusDataSource: {
    id: 'prometheus-ds-123',
    name: 'prometheus-ds-123', // ConnectionId for PromQL queries
  },
};

jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: jest.fn(() => ({ config: mockConfig })),
}));

import { useApmConfig } from '../../../config/apm_config_context';

// Build a query-enhancements data_frame carrying one (environment, service) series.
const dataFrame = (seriesLabel: string, value: number) => ({
  type: 'data_frame',
  fields: [
    { name: 'Time', values: [1704067200000] },
    { name: 'Series', values: [seriesLabel] },
    { name: 'Value', values: [value] },
  ],
});

describe('useServicesRedMetrics', () => {
  const defaultParams = {
    services: [
      { serviceName: 'api-gateway', environment: 'prod' },
      { serviceName: 'user-service', environment: 'prod' },
    ],
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-01T01:00:00Z'), // 3600s window
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useApmConfig as jest.Mock).mockReturnValue({ config: mockConfig });
    // Default: queries return an empty data frame. The hook still records a
    // (zeroed) entry for every service, so metricsMap is populated regardless.
    mockExecuteInstantQuery.mockResolvedValue({ type: 'data_frame', fields: [] });
    mockExecuteMetricRequest.mockResolvedValue({ type: 'data_frame', fields: [] });
  });

  describe('initial state', () => {
    it('should return empty map when no services provided', () => {
      const { result } = renderHook(() =>
        useServicesRedMetrics({
          ...defaultParams,
          services: [],
        })
      );

      expect(result.current.metricsMap.size).toBe(0);
      expect(result.current.isLoading).toBe(false);
    });

    it('should return empty map when no prometheus connection', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: null });

      const { result } = renderHook(() => useServicesRedMetrics(defaultParams));

      expect(result.current.metricsMap.size).toBe(0);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('catalog (instant) metrics for all services', () => {
    it('fetches instant metrics for every service and no range queries without a visible page', async () => {
      const { result } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Three instant queries drive the numbers/sort/filters for all services:
      // throughput total, failure-ratio total, and latency P99.
      expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(3);
      // Per-step range (sparkline) queries only run for a supplied visible page.
      expect(mockExecuteMetricRequest).not.toHaveBeenCalled();
    });

    it('keys metricsMap by service and environment (serviceNodeKey)', async () => {
      const { result } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.metricsMap.has(serviceNodeKey('api-gateway', 'prod'))).toBe(true);
      expect(result.current.metricsMap.has(serviceNodeKey('user-service', 'prod'))).toBe(true);
    });

    it('does not embed a service=~ list filter in the catalog queries', async () => {
      const { result } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const queries = mockExecuteInstantQuery.mock.calls.map((c) => c[0].query as string);
      expect(queries.length).toBeGreaterThan(0);
      queries.forEach((q) => expect(q).not.toContain('service=~'));
    });

    it('parses instant responses into per-(service, environment) values', async () => {
      mockExecuteInstantQuery.mockResolvedValue(
        dataFrame('{environment="prod", service="api-gateway"}', 5)
      );

      const { result } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const metrics = result.current.metricsMap.get(serviceNodeKey('api-gateway', 'prod'));
      expect(metrics).toBeDefined();
      // Latency P99 and failure ratio come straight from the instant value.
      expect(metrics!.avgLatency).toBe(5);
      expect(metrics!.avgFailureRatio).toBe(5);
      // Throughput is the summed total divided by the range (req/s).
      expect(metrics!.avgThroughput).toBeCloseTo(5 / 3600, 5);
      // A service with no matching series stays zeroed, not undefined.
      const other = result.current.metricsMap.get(serviceNodeKey('user-service', 'prod'));
      expect(other!.avgLatency).toBe(0);
    });
  });

  describe('visible-page sparklines', () => {
    it('fetches range queries only for the visible page via a bounded service=~ filter', async () => {
      const { result } = renderHook(() =>
        useServicesRedMetrics({
          ...defaultParams,
          sparklineServices: [{ serviceName: 'api-gateway', environment: 'prod' }],
        })
      );

      // Debounced (~250ms) then three range queries: throughput, failure, latency.
      await waitFor(() => expect(mockExecuteMetricRequest).toHaveBeenCalledTimes(3), {
        timeout: 2000,
      });

      const rangeQuery = mockExecuteMetricRequest.mock.calls[0][0].query as string;
      expect(rangeQuery).toContain('service=~"api-gateway"');
      // Bounded to the visible page - off-page services are not fetched.
      expect(rangeQuery).not.toContain('user-service');
      expect(result.current).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('surfaces an error but still returns zeroed entries on total failure', async () => {
      const mockError = new Error('Prometheus query failed');
      mockExecuteInstantQuery.mockRejectedValue(mockError);

      const { result } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toEqual(mockError);
      // Promise.allSettled keeps sibling metrics flowing: every service still has
      // a (zeroed) entry rather than the whole map going empty.
      expect(result.current.metricsMap.size).toBe(2);
      expect(result.current.metricsMap.get(serviceNodeKey('api-gateway', 'prod'))!.avgLatency).toBe(
        0
      );
    });
  });

  describe('refetch', () => {
    it('refetches the catalog instant metrics when refetch is called', async () => {
      const { result } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCallCount = mockExecuteInstantQuery.mock.calls.length;

      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(mockExecuteInstantQuery.mock.calls.length).toBeGreaterThan(initialCallCount);
      });
    });
  });

  describe('time range handling', () => {
    it('passes the range end as seconds to the instant queries', async () => {
      const { result } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const callArgs = mockExecuteInstantQuery.mock.calls[0][0];
      expect(callArgs.time).toBe(Math.floor(defaultParams.endTime.getTime() / 1000));
    });
  });
});

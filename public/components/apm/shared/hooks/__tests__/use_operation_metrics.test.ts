/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useOperationMetrics } from '../use_operation_metrics';

// Mock the PromQLSearchService
const mockExecuteInstantQuery = jest.fn();
jest.mock('../../../query_services/promql_search_service', () => ({
  PromQLSearchService: jest.fn().mockImplementation(() => ({
    executeInstantQuery: mockExecuteInstantQuery,
  })),
}));

// Mock the promql_queries functions
jest.mock('../../../query_services/query_requests/promql_queries', () => ({
  getQueryAllOperationsLatencyPercentiles: jest.fn(() => 'mock_latency_percentiles_query'),
  getQueryAllOperationsFaultRate: jest.fn(() => 'mock_fault_rate_query'),
  getQueryAllOperationsErrorRateAvg: jest.fn(() => 'mock_error_rate_avg_query'),
  getQueryAllOperationsAvailabilityAvg: jest.fn(() => 'mock_availability_avg_query'),
  getQueryAllOperationsRequestCountTotal: jest.fn(() => 'mock_request_count_total_query'),
}));

describe('useOperationMetrics', () => {
  const defaultParams = {
    operations: [{ operationName: 'GET /api/users' }, { operationName: 'POST /api/orders' }],
    serviceName: 'frontend',
    environment: 'production',
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-01T01:00:00Z'),
    prometheusConnectionId: 'prometheus-1',
  };

  // Create mock PromQL response (data frame format)
  const createMockResponse = (
    rows: Array<{ operation: string; Value: string; percentile?: string }>
  ) => ({
    meta: {
      instantData: {
        rows: rows.map((row) => ({ Time: Date.now(), ...row })),
      },
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('should return empty metrics when no prometheusConnectionId', async () => {
      const { result } = renderHook(() =>
        useOperationMetrics({
          ...defaultParams,
          prometheusConnectionId: '',
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.metrics.size).toBe(0);
      expect(result.current.error).toBeNull();
    });

    it('should return empty metrics when no operations', () => {
      const { result } = renderHook(() =>
        useOperationMetrics({
          ...defaultParams,
          operations: [],
        })
      );

      expect(result.current.metrics.size).toBe(0);
    });
  });

  describe('successful fetch', () => {
    it('should fetch and populate metrics for operations (data frame format)', async () => {
      // Mock 5 parallel responses (latency percentiles combined into 1)
      // Note: PromQL queries now include unit conversions (* 1000 for latency, * 100 for rates)
      // so mock values represent the already-converted values
      mockExecuteInstantQuery
        .mockResolvedValueOnce(
          createMockResponse([
            { operation: 'GET /api/users', Value: '100', percentile: 'p50' },
            { operation: 'GET /api/users', Value: '200', percentile: 'p90' },
            { operation: 'GET /api/users', Value: '500', percentile: 'p99' },
          ])
        ) // latency percentiles
        .mockResolvedValueOnce(createMockResponse([{ operation: 'GET /api/users', Value: '5' }])) // faultRate (percentage)
        .mockResolvedValueOnce(createMockResponse([{ operation: 'GET /api/users', Value: '2' }])) // errorRate (percentage)
        .mockResolvedValueOnce(createMockResponse([{ operation: 'GET /api/users', Value: '99' }])) // availability (percentage)
        .mockResolvedValueOnce(
          createMockResponse([{ operation: 'GET /api/users', Value: '1000' }])
        ); // requestCount

      const { result } = renderHook(() => useOperationMetrics(defaultParams));

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isLoading).toBe(false);
      expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(5);

      const metrics = result.current.metrics.get('GET /api/users');
      expect(metrics).toBeDefined();
      expect(metrics?.p50Duration).toBe(100); // 100ms (no JS conversion)
      expect(metrics?.p90Duration).toBe(200);
      expect(metrics?.p99Duration).toBe(500);
      expect(metrics?.faultRate).toBe(5);
      expect(metrics?.errorRate).toBe(2);
      expect(metrics?.availability).toBe(99); // 99% (no JS conversion)
      expect(metrics?.requestCount).toBe(1000);
    });

    it('should handle traditional Prometheus response format', async () => {
      // Combined latency percentiles response with percentile labels
      mockExecuteInstantQuery
        .mockResolvedValueOnce({
          data: {
            result: [
              {
                metric: { operation: 'GET /api/users', percentile: 'p50' },
                values: [[Date.now() / 1000, '150']],
              },
              {
                metric: { operation: 'GET /api/users', percentile: 'p90' },
                values: [[Date.now() / 1000, '300']],
              },
              {
                metric: { operation: 'GET /api/users', percentile: 'p99' },
                values: [[Date.now() / 1000, '600']],
              },
            ],
          },
        })
        .mockResolvedValue({ data: { result: [] } }); // Rest return empty

      const { result } = renderHook(() => useOperationMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const metrics = result.current.metrics.get('GET /api/users');
      expect(metrics?.p50Duration).toBe(150);
      expect(metrics?.p90Duration).toBe(300);
      expect(metrics?.p99Duration).toBe(600);
    });

    it('should initialize metrics to default values when no data returned', async () => {
      mockExecuteInstantQuery.mockResolvedValue({ data: { result: [] } });

      const { result } = renderHook(() => useOperationMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // All operations should have default metrics
      expect(result.current.metrics.size).toBe(2);
      const metrics = result.current.metrics.get('GET /api/users');
      expect(metrics?.p50Duration).toBe(0);
      expect(metrics?.p90Duration).toBe(0);
      expect(metrics?.p99Duration).toBe(0);
      expect(metrics?.faultRate).toBe(0);
      expect(metrics?.errorRate).toBe(0);
      expect(metrics?.availability).toBe(0);
      expect(metrics?.requestCount).toBe(0);
    });

    it('should handle NaN values gracefully', async () => {
      mockExecuteInstantQuery.mockResolvedValue(
        createMockResponse([{ operation: 'GET /api/users', Value: 'NaN' }])
      );

      const { result } = renderHook(() => useOperationMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const metrics = result.current.metrics.get('GET /api/users');
      expect(metrics?.p50Duration).toBe(0); // NaN converted to 0
    });

    it('should handle multiple operations', async () => {
      mockExecuteInstantQuery.mockResolvedValue(
        createMockResponse([
          { operation: 'GET /api/users', Value: '0.1' },
          { operation: 'POST /api/orders', Value: '0.2' },
        ])
      );

      const { result } = renderHook(() => useOperationMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.metrics.size).toBe(2);
      expect(result.current.metrics.has('GET /api/users')).toBe(true);
      expect(result.current.metrics.has('POST /api/orders')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should set error state on fetch failure', async () => {
      const mockError = new Error('PromQL query failed');
      mockExecuteInstantQuery.mockRejectedValue(mockError);

      const { result } = renderHook(() => useOperationMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.isLoading).toBe(false);
    });

    it('should wrap non-Error throws', async () => {
      mockExecuteInstantQuery.mockRejectedValue('string error');

      const { result } = renderHook(() => useOperationMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Unknown error');
    });
  });

  describe('parameter changes', () => {
    it('should refetch when operations change', async () => {
      mockExecuteInstantQuery.mockResolvedValue({ data: { result: [] } });

      const { result, rerender } = renderHook(({ params }) => useOperationMetrics(params), {
        initialProps: { params: defaultParams },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCallCount = mockExecuteInstantQuery.mock.calls.length;

      rerender({
        params: {
          ...defaultParams,
          operations: [{ operationName: 'NEW /api/endpoint' }],
        },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockExecuteInstantQuery.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    it('should refetch when refreshTrigger changes', async () => {
      mockExecuteInstantQuery.mockResolvedValue({ data: { result: [] } });

      const { result, rerender } = renderHook(({ params }) => useOperationMetrics(params), {
        initialProps: { params: { ...defaultParams, refreshTrigger: 0 } },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCallCount = mockExecuteInstantQuery.mock.calls.length;

      rerender({
        params: { ...defaultParams, refreshTrigger: 1 },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockExecuteInstantQuery.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  describe('query parameters', () => {
    it('should use actual time range from params', async () => {
      mockExecuteInstantQuery.mockResolvedValue({ data: { result: [] } });

      const { result } = renderHook(() => useOperationMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Check that queries use the end time from params (instant queries use time, not startTime/endTime)
      const call = mockExecuteInstantQuery.mock.calls[0][0];
      const expectedEndTime = Math.floor(defaultParams.endTime.getTime() / 1000);
      expect(call.time).toBe(expectedEndTime);
    });
  });
});

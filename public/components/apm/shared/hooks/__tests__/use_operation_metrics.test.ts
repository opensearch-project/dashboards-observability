/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '@testing-library/react-hooks';
import { useOperationMetrics } from '../use_operation_metrics';

// Mock the PromQLSearchService
const mockExecuteMetricRequest = jest.fn();
jest.mock('../../../query_services/promql_search_service', () => ({
  PromQLSearchService: jest.fn().mockImplementation(() => ({
    executeMetricRequest: mockExecuteMetricRequest,
  })),
}));

// Mock the promql_queries functions
jest.mock('../../../query_services/query_requests/promql_queries', () => ({
  getQueryAllOperationsLatencyP50: jest.fn(() => 'mock_p50_query'),
  getQueryAllOperationsLatencyP90: jest.fn(() => 'mock_p90_query'),
  getQueryAllOperationsLatencyP99: jest.fn(() => 'mock_p99_query'),
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
  const createMockResponse = (rows: Array<{ operation: string; Value: string }>) => ({
    meta: {
      instantData: {
        rows: rows.map((row) => ({ Time: Date.now(), ...row })),
      },
    },
  });

  // Create mock traditional Prometheus response
  const createTraditionalMockResponse = (results: Array<{ operation: string; value: string }>) => ({
    data: {
      result: results.map((r) => ({
        metric: { operation: r.operation },
        values: [[Date.now() / 1000, r.value]],
      })),
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('should return empty metrics when no prometheusConnectionId', () => {
      const { result } = renderHook(() =>
        useOperationMetrics({
          ...defaultParams,
          prometheusConnectionId: '',
        })
      );

      expect(result.current.metrics.size).toBe(0);
      expect(result.current.isLoading).toBe(false);
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
      // Mock 7 parallel responses (one per metric type)
      // Note: PromQL queries now include unit conversions (* 1000 for latency, * 100 for rates)
      // so mock values represent the already-converted values
      mockExecuteMetricRequest
        .mockResolvedValueOnce(
          createMockResponse([
            { operation: 'GET /api/users', Value: '100' }, // 100ms (already converted in PromQL)
          ])
        ) // p50
        .mockResolvedValueOnce(createMockResponse([{ operation: 'GET /api/users', Value: '200' }])) // p90
        .mockResolvedValueOnce(createMockResponse([{ operation: 'GET /api/users', Value: '500' }])) // p99
        .mockResolvedValueOnce(createMockResponse([{ operation: 'GET /api/users', Value: '5' }])) // faultRate (percentage)
        .mockResolvedValueOnce(createMockResponse([{ operation: 'GET /api/users', Value: '2' }])) // errorRate (percentage)
        .mockResolvedValueOnce(createMockResponse([{ operation: 'GET /api/users', Value: '99' }])) // availability (percentage)
        .mockResolvedValueOnce(
          createMockResponse([{ operation: 'GET /api/users', Value: '1000' }])
        ); // requestCount

      const { result, waitForNextUpdate } = renderHook(() => useOperationMetrics(defaultParams));

      expect(result.current.isLoading).toBe(true);

      await waitForNextUpdate();

      expect(result.current.isLoading).toBe(false);
      expect(mockExecuteMetricRequest).toHaveBeenCalledTimes(7);

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
      mockExecuteMetricRequest
        .mockResolvedValueOnce(
          createTraditionalMockResponse([{ operation: 'GET /api/users', value: '150' }])
        ) // p50 in ms (already converted)
        .mockResolvedValue({ data: { result: [] } }); // Rest return empty

      const { result, waitForNextUpdate } = renderHook(() => useOperationMetrics(defaultParams));

      await waitForNextUpdate();

      const metrics = result.current.metrics.get('GET /api/users');
      expect(metrics?.p50Duration).toBe(150); // 150ms (no JS conversion)
    });

    it('should initialize metrics to default values when no data returned', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { result, waitForNextUpdate } = renderHook(() => useOperationMetrics(defaultParams));

      await waitForNextUpdate();

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
      mockExecuteMetricRequest.mockResolvedValue(
        createMockResponse([{ operation: 'GET /api/users', Value: 'NaN' }])
      );

      const { result, waitForNextUpdate } = renderHook(() => useOperationMetrics(defaultParams));

      await waitForNextUpdate();

      const metrics = result.current.metrics.get('GET /api/users');
      expect(metrics?.p50Duration).toBe(0); // NaN converted to 0
    });

    it('should handle multiple operations', async () => {
      mockExecuteMetricRequest.mockResolvedValue(
        createMockResponse([
          { operation: 'GET /api/users', Value: '0.1' },
          { operation: 'POST /api/orders', Value: '0.2' },
        ])
      );

      const { result, waitForNextUpdate } = renderHook(() => useOperationMetrics(defaultParams));

      await waitForNextUpdate();

      expect(result.current.metrics.size).toBe(2);
      expect(result.current.metrics.has('GET /api/users')).toBe(true);
      expect(result.current.metrics.has('POST /api/orders')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should set error state on fetch failure', async () => {
      const mockError = new Error('PromQL query failed');
      mockExecuteMetricRequest.mockRejectedValue(mockError);

      const { result, waitForNextUpdate } = renderHook(() => useOperationMetrics(defaultParams));

      await waitForNextUpdate();

      expect(result.current.error).toEqual(mockError);
      expect(result.current.isLoading).toBe(false);
    });

    it('should wrap non-Error throws', async () => {
      mockExecuteMetricRequest.mockRejectedValue('string error');

      const { result, waitForNextUpdate } = renderHook(() => useOperationMetrics(defaultParams));

      await waitForNextUpdate();

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Unknown error');
    });
  });

  describe('parameter changes', () => {
    it('should refetch when operations change', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { waitForNextUpdate, rerender } = renderHook(
        ({ params }) => useOperationMetrics(params),
        {
          initialProps: { params: defaultParams },
        }
      );

      await waitForNextUpdate();

      const initialCallCount = mockExecuteMetricRequest.mock.calls.length;

      rerender({
        params: {
          ...defaultParams,
          operations: [{ operationName: 'NEW /api/endpoint' }],
        },
      });

      await waitForNextUpdate();

      expect(mockExecuteMetricRequest.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    it('should refetch when refreshTrigger changes', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { waitForNextUpdate, rerender } = renderHook(
        ({ params }) => useOperationMetrics(params),
        {
          initialProps: { params: { ...defaultParams, refreshTrigger: 0 } },
        }
      );

      await waitForNextUpdate();

      const initialCallCount = mockExecuteMetricRequest.mock.calls.length;

      rerender({
        params: { ...defaultParams, refreshTrigger: 1 },
      });

      await waitForNextUpdate();

      expect(mockExecuteMetricRequest.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  describe('query parameters', () => {
    it('should use actual time range from params', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { waitForNextUpdate } = renderHook(() => useOperationMetrics(defaultParams));

      await waitForNextUpdate();

      // Check that queries use the time range from params
      const call = mockExecuteMetricRequest.mock.calls[0][0];
      const expectedStartTime = Math.floor(defaultParams.startTime.getTime() / 1000);
      const expectedEndTime = Math.floor(defaultParams.endTime.getTime() / 1000);
      expect(call.startTime).toBe(expectedStartTime);
      expect(call.endTime).toBe(expectedEndTime);
    });
  });
});

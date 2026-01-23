/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '@testing-library/react-hooks';
import { useDependencyMetrics } from '../use_dependency_metrics';
import { GroupedDependency } from '../../../common/types/service_details_types';

// Mock the PromQLSearchService
const mockExecuteMetricRequest = jest.fn();
jest.mock('../../../query_services/promql_search_service', () => ({
  PromQLSearchService: jest.fn().mockImplementation(() => ({
    executeMetricRequest: mockExecuteMetricRequest,
  })),
}));

// Mock the promql_queries functions
jest.mock('../../../query_services/query_requests/promql_queries', () => ({
  getQueryAllDependenciesLatencyP50: jest.fn(() => 'mock_p50_query'),
  getQueryAllDependenciesLatencyP90: jest.fn(() => 'mock_p90_query'),
  getQueryAllDependenciesLatencyP99: jest.fn(() => 'mock_p99_query'),
  getQueryAllDependenciesFaultRate: jest.fn(() => 'mock_fault_rate_query'),
  getQueryAllDependenciesErrorRateAvg: jest.fn(() => 'mock_error_rate_avg_query'),
  getQueryAllDependenciesAvailabilityAvg: jest.fn(() => 'mock_availability_avg_query'),
  getQueryAllDependenciesRequestCountTotal: jest.fn(() => 'mock_request_count_total_query'),
}));

describe('useDependencyMetrics', () => {
  const createDependency = (serviceName: string, remoteOperation: string): GroupedDependency => ({
    serviceName,
    remoteOperation,
    environment: 'production',
    serviceOperations: ['checkout'],
    callCount: 100,
    p50Duration: undefined,
    p90Duration: undefined,
    p99Duration: undefined,
    faultRate: undefined,
    errorRate: undefined,
    availability: undefined,
  });

  const defaultParams = {
    dependencies: [
      createDependency('cart', 'AddItem'),
      createDependency('payment', 'ProcessPayment'),
    ],
    serviceName: 'frontend',
    environment: 'production',
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-01T01:00:00Z'),
    prometheusConnectionId: 'prometheus-1',
  };

  // Create mock PromQL response (data frame format)
  const createMockResponse = (
    rows: Array<{ remoteService: string; remoteOperation: string; Value: string }>
  ) => ({
    meta: {
      instantData: {
        rows: rows.map((row) => ({ Time: Date.now(), ...row })),
      },
    },
  });

  // Create mock traditional Prometheus response
  const createTraditionalMockResponse = (
    results: Array<{ remoteService: string; remoteOperation: string; value: string }>
  ) => ({
    data: {
      result: results.map((r) => ({
        metric: { remoteService: r.remoteService, remoteOperation: r.remoteOperation },
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
        useDependencyMetrics({
          ...defaultParams,
          prometheusConnectionId: '',
        })
      );

      expect(result.current.metrics.size).toBe(0);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should return empty metrics when no dependencies', () => {
      const { result } = renderHook(() =>
        useDependencyMetrics({
          ...defaultParams,
          dependencies: [],
        })
      );

      expect(result.current.metrics.size).toBe(0);
    });
  });

  describe('successful fetch', () => {
    it('should fetch and populate metrics for dependencies (data frame format)', async () => {
      // Mock 7 parallel responses (one per metric type)
      // Note: PromQL queries now include unit conversions (* 1000 for latency, * 100 for rates)
      // so mock values represent the already-converted values
      mockExecuteMetricRequest
        .mockResolvedValueOnce(
          createMockResponse([{ remoteService: 'cart', remoteOperation: 'AddItem', Value: '100' }])
        ) // p50 in ms (already converted)
        .mockResolvedValueOnce(
          createMockResponse([{ remoteService: 'cart', remoteOperation: 'AddItem', Value: '200' }])
        ) // p90
        .mockResolvedValueOnce(
          createMockResponse([{ remoteService: 'cart', remoteOperation: 'AddItem', Value: '500' }])
        ) // p99
        .mockResolvedValueOnce(
          createMockResponse([{ remoteService: 'cart', remoteOperation: 'AddItem', Value: '5' }])
        ) // faultRate (percentage)
        .mockResolvedValueOnce(
          createMockResponse([{ remoteService: 'cart', remoteOperation: 'AddItem', Value: '2' }])
        ) // errorRate (percentage)
        .mockResolvedValueOnce(
          createMockResponse([{ remoteService: 'cart', remoteOperation: 'AddItem', Value: '99' }])
        ) // availability (percentage)
        .mockResolvedValueOnce(
          createMockResponse([{ remoteService: 'cart', remoteOperation: 'AddItem', Value: '1000' }])
        ); // requestCount

      const { result, waitForNextUpdate } = renderHook(() => useDependencyMetrics(defaultParams));

      expect(result.current.isLoading).toBe(true);

      await waitForNextUpdate();

      expect(result.current.isLoading).toBe(false);
      expect(mockExecuteMetricRequest).toHaveBeenCalledTimes(7);

      // Key is "serviceName:remoteOperation"
      const metrics = result.current.metrics.get('cart:AddItem');
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
          createTraditionalMockResponse([
            { remoteService: 'cart', remoteOperation: 'AddItem', value: '150' },
          ])
        ) // p50 in ms (already converted)
        .mockResolvedValue({ data: { result: [] } }); // Rest return empty

      const { result, waitForNextUpdate } = renderHook(() => useDependencyMetrics(defaultParams));

      await waitForNextUpdate();

      const metrics = result.current.metrics.get('cart:AddItem');
      expect(metrics?.p50Duration).toBe(150); // 150ms (no JS conversion)
    });

    it('should initialize metrics to default values when no data returned', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { result, waitForNextUpdate } = renderHook(() => useDependencyMetrics(defaultParams));

      await waitForNextUpdate();

      // All dependencies should have default metrics
      expect(result.current.metrics.size).toBe(2);
      const metrics = result.current.metrics.get('cart:AddItem');
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
        createMockResponse([{ remoteService: 'cart', remoteOperation: 'AddItem', Value: 'NaN' }])
      );

      const { result, waitForNextUpdate } = renderHook(() => useDependencyMetrics(defaultParams));

      await waitForNextUpdate();

      const metrics = result.current.metrics.get('cart:AddItem');
      expect(metrics?.p50Duration).toBe(0); // NaN converted to 0
    });

    it('should handle multiple dependencies', async () => {
      mockExecuteMetricRequest.mockResolvedValue(
        createMockResponse([
          { remoteService: 'cart', remoteOperation: 'AddItem', Value: '0.1' },
          { remoteService: 'payment', remoteOperation: 'ProcessPayment', Value: '0.2' },
        ])
      );

      const { result, waitForNextUpdate } = renderHook(() => useDependencyMetrics(defaultParams));

      await waitForNextUpdate();

      expect(result.current.metrics.size).toBe(2);
      expect(result.current.metrics.has('cart:AddItem')).toBe(true);
      expect(result.current.metrics.has('payment:ProcessPayment')).toBe(true);
    });

    it('should default remoteOperation to unknown when missing', async () => {
      mockExecuteMetricRequest.mockResolvedValue(
        createMockResponse([{ remoteService: 'cart', remoteOperation: '', Value: '0.1' }])
      );

      const paramsWithUnknownOp = {
        ...defaultParams,
        dependencies: [createDependency('cart', 'unknown')],
      };

      const { result, waitForNextUpdate } = renderHook(() =>
        useDependencyMetrics(paramsWithUnknownOp)
      );

      await waitForNextUpdate();

      // Response has empty remoteOperation which defaults to 'unknown'
      expect(result.current.metrics.has('cart:unknown')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should set error state on fetch failure', async () => {
      const mockError = new Error('PromQL query failed');
      mockExecuteMetricRequest.mockRejectedValue(mockError);

      const { result, waitForNextUpdate } = renderHook(() => useDependencyMetrics(defaultParams));

      await waitForNextUpdate();

      expect(result.current.error).toEqual(mockError);
      expect(result.current.isLoading).toBe(false);
    });

    it('should wrap non-Error throws', async () => {
      mockExecuteMetricRequest.mockRejectedValue('string error');

      const { result, waitForNextUpdate } = renderHook(() => useDependencyMetrics(defaultParams));

      await waitForNextUpdate();

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Unknown error');
    });
  });

  describe('parameter changes', () => {
    it('should refetch when dependencies change', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { waitForNextUpdate, rerender } = renderHook(
        ({ params }) => useDependencyMetrics(params),
        {
          initialProps: { params: defaultParams },
        }
      );

      await waitForNextUpdate();

      const initialCallCount = mockExecuteMetricRequest.mock.calls.length;

      rerender({
        params: {
          ...defaultParams,
          dependencies: [createDependency('new-service', 'NewOperation')],
        },
      });

      await waitForNextUpdate();

      expect(mockExecuteMetricRequest.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    it('should refetch when refreshTrigger changes', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { waitForNextUpdate, rerender } = renderHook(
        ({ params }) => useDependencyMetrics(params),
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

      const { waitForNextUpdate } = renderHook(() => useDependencyMetrics(defaultParams));

      await waitForNextUpdate();

      // Check that queries use the time range from params
      const call = mockExecuteMetricRequest.mock.calls[0][0];
      const expectedStartTime = Math.floor(defaultParams.startTime.getTime() / 1000);
      const expectedEndTime = Math.floor(defaultParams.endTime.getTime() / 1000);
      expect(call.startTime).toBe(expectedStartTime);
      expect(call.endTime).toBe(expectedEndTime);
    });
  });

  describe('key generation', () => {
    it('should generate correct key from serviceName and remoteOperation', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { result, waitForNextUpdate } = renderHook(() => useDependencyMetrics(defaultParams));

      await waitForNextUpdate();

      // Keys should be "serviceName:remoteOperation"
      expect(result.current.metrics.has('cart:AddItem')).toBe(true);
      expect(result.current.metrics.has('payment:ProcessPayment')).toBe(true);
    });
  });
});

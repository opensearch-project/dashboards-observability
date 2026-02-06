/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useServiceMapMetrics } from '../use_service_map_metrics';

// Mock the PromQLSearchService
const mockExecuteMetricRequest = jest.fn();
jest.mock('../../../query_services/promql_search_service', () => ({
  PromQLSearchService: jest.fn().mockImplementation(() => ({
    executeMetricRequest: mockExecuteMetricRequest,
  })),
}));

// Mock the APM config context
const mockConfig = {
  prometheusDataSource: {
    id: 'prometheus-ds-1',
    name: 'prometheus-ds-1', // ConnectionId for PromQL queries
  },
};

jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: jest.fn(() => ({ config: mockConfig })),
}));

import { useApmConfig } from '../../../config/apm_config_context';

describe('useServiceMapMetrics', () => {
  const defaultParams = {
    services: [
      { serviceName: 'api-gateway', environment: 'generic:default' },
      { serviceName: 'user-service', environment: 'eks:cluster' },
    ],
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-01T01:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useApmConfig as jest.Mock).mockReturnValue({ config: mockConfig });
  });

  describe('initial state', () => {
    it('should return empty metrics map when no services', () => {
      const { result } = renderHook(() =>
        useServiceMapMetrics({
          ...defaultParams,
          services: [],
        })
      );

      expect(result.current.metricsMap.size).toBe(0);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should return empty metrics map when no prometheus datasource configured', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: {} });

      const { result } = renderHook(() => useServiceMapMetrics(defaultParams));

      expect(result.current.metricsMap.size).toBe(0);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('successful fetch', () => {
    it('should fetch and return metrics for all services', async () => {
      // Mock responses for all 3 metric queries (throughput, faults, errors)
      const mockMetricResponse = (serviceName: string, value: number) => ({
        data: {
          result: [
            {
              metric: { service: serviceName },
              values: [
                [1704067200, String(value)],
                [1704067260, String(value + 1)],
              ],
            },
          ],
        },
      });

      mockExecuteMetricRequest
        // Throughput
        .mockResolvedValueOnce(mockMetricResponse('api-gateway', 100))
        // Faults
        .mockResolvedValueOnce(mockMetricResponse('api-gateway', 5))
        // Errors
        .mockResolvedValueOnce(mockMetricResponse('api-gateway', 10));

      const { result } = renderHook(() => useServiceMapMetrics(defaultParams));

      // Initial loading state
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.metricsMap.size).toBe(2);

      // Check metrics for api-gateway
      const gatewayMetrics = result.current.metricsMap.get('api-gateway::generic:default');
      expect(gatewayMetrics).toBeDefined();
      expect(gatewayMetrics?.throughput.length).toBeGreaterThan(0);
      // Latency should be empty (not fetched in this hook)
      expect(gatewayMetrics?.latency).toEqual([]);
      expect(gatewayMetrics?.avgLatency).toBe(0);
    });

    it('should handle services with no metrics data', async () => {
      // Reset mock to clear any previous setup
      mockExecuteMetricRequest.mockReset();
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { result } = renderHook(() => useServiceMapMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.metricsMap.size).toBe(2);

      // Services should have empty metric arrays
      const gatewayMetrics = result.current.metricsMap.get('api-gateway::generic:default');
      expect(gatewayMetrics?.throughput).toEqual([]);
      expect(gatewayMetrics?.avgThroughput).toBe(0);
      expect(gatewayMetrics?.totalRequests).toBe(0);
      expect(gatewayMetrics?.totalFaults).toBe(0);
      expect(gatewayMetrics?.totalErrors).toBe(0);
      expect(gatewayMetrics?.avgFailureRatio).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should set error state on fetch failure', async () => {
      mockExecuteMetricRequest.mockReset();
      const mockError = new Error('Prometheus connection failed');
      mockExecuteMetricRequest.mockRejectedValue(mockError);

      const { result } = renderHook(() => useServiceMapMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.metricsMap.size).toBe(0);
    });

    it('should wrap non-Error throws', async () => {
      mockExecuteMetricRequest.mockReset();
      mockExecuteMetricRequest.mockRejectedValue('string error');

      const { result } = renderHook(() => useServiceMapMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Unknown error');
    });
  });

  describe('refetch', () => {
    it('should refetch metrics when refetch is called', async () => {
      mockExecuteMetricRequest.mockReset();
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { result } = renderHook(() => useServiceMapMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCallCount = mockExecuteMetricRequest.mock.calls.length;

      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockExecuteMetricRequest.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  describe('data frame format handling', () => {
    it('should handle data frame response format', async () => {
      mockExecuteMetricRequest.mockReset();
      const dataFrameResponse = {
        type: 'data_frame',
        fields: [
          { name: 'Time', values: [1704067200000, 1704067260000] },
          { name: 'Series', values: ['{service="api-gateway"}', '{service="api-gateway"}'] },
          { name: 'Value', values: [100, 101] },
        ],
      };

      mockExecuteMetricRequest.mockResolvedValue(dataFrameResponse);

      const { result } = renderHook(() => useServiceMapMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const gatewayMetrics = result.current.metricsMap.get('api-gateway::generic:default');
      expect(gatewayMetrics?.throughput.length).toBeGreaterThan(0);
    });
  });
});

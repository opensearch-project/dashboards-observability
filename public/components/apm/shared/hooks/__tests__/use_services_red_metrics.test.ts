/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react-hooks';
import { useServicesRedMetrics } from '../use_services_red_metrics';

// Mock the PromQLSearchService
const mockExecuteMetricRequest = jest.fn();
jest.mock('../../../services/promql_search_service', () => ({
  PromQLSearchService: jest.fn().mockImplementation(() => ({
    executeMetricRequest: mockExecuteMetricRequest,
  })),
}));

// Mock the APM config context
const mockConfig = {
  prometheusDataSource: {
    id: 'prometheus-ds-123',
  },
};

jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: jest.fn(() => ({ config: mockConfig })),
}));

import { useApmConfig } from '../../../config/apm_config_context';

describe('useServicesRedMetrics', () => {
  const defaultParams = {
    services: [
      { serviceName: 'api-gateway', environment: 'prod' },
      { serviceName: 'user-service', environment: 'prod' },
    ],
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-01T01:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useApmConfig as jest.Mock).mockReturnValue({ config: mockConfig });
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

  describe('successful batch fetch', () => {
    it('should fetch latency, throughput, and failure ratio in parallel', async () => {
      // Mock responses for all three metrics
      mockExecuteMetricRequest
        .mockResolvedValueOnce({
          // Latency response
          type: 'data_frame',
          fields: [
            { name: 'Time', values: [1704067200000, 1704070800000] },
            { name: 'Series', values: ['{service="api-gateway"}', '{service="api-gateway"}'] },
            { name: 'Value', values: [0.1, 0.15] },
          ],
        })
        .mockResolvedValueOnce({
          // Throughput response
          type: 'data_frame',
          fields: [
            { name: 'Time', values: [1704067200000] },
            { name: 'Series', values: ['{service="api-gateway"}'] },
            { name: 'Value', values: [1000] },
          ],
        })
        .mockResolvedValueOnce({
          // Failure ratio response
          type: 'data_frame',
          fields: [
            { name: 'Time', values: [1704067200000] },
            { name: 'Series', values: ['{service="api-gateway"}'] },
            { name: 'Value', values: [2.5] },
          ],
        });

      const { result, waitForNextUpdate } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitForNextUpdate();

      // Should have called executeMetricRequest 3 times (latency, throughput, failure)
      expect(mockExecuteMetricRequest).toHaveBeenCalledTimes(3);

      // Check that all services have entries in the map
      expect(result.current.metricsMap.has('api-gateway')).toBe(true);
      expect(result.current.metricsMap.has('user-service')).toBe(true);
    });

    it('should build correct service filter', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        type: 'data_frame',
        fields: [],
      });

      const { waitForNextUpdate } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitForNextUpdate();

      // Check that the query includes the service filter
      const callArgs = mockExecuteMetricRequest.mock.calls[0][0];
      expect(callArgs.query).toContain('service=~"api-gateway|user-service"');
    });
  });

  describe('error handling', () => {
    it('should set error state on fetch failure', async () => {
      const mockError = new Error('Prometheus query failed');
      mockExecuteMetricRequest.mockRejectedValue(mockError);

      const { result, waitForNextUpdate } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitForNextUpdate();

      expect(result.current.error).toEqual(mockError);
      expect(result.current.metricsMap.size).toBe(0);
    });
  });

  describe('refetch', () => {
    it('should refetch data when refetch is called', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        type: 'data_frame',
        fields: [],
      });

      const { result, waitForNextUpdate } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitForNextUpdate();

      const initialCallCount = mockExecuteMetricRequest.mock.calls.length;

      act(() => {
        result.current.refetch();
      });

      await waitForNextUpdate();

      expect(mockExecuteMetricRequest.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  describe('time range handling', () => {
    it('should convert time to seconds', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        type: 'data_frame',
        fields: [],
      });

      const { waitForNextUpdate } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitForNextUpdate();

      const callArgs = mockExecuteMetricRequest.mock.calls[0][0];
      expect(callArgs.startTime).toBe(Math.floor(defaultParams.startTime.getTime() / 1000));
      expect(callArgs.endTime).toBe(Math.floor(defaultParams.endTime.getTime() / 1000));
    });
  });

  describe('response formats', () => {
    it('should handle standard Prometheus response format', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        data: {
          result: [
            {
              metric: { service: 'api-gateway' },
              values: [
                [1704067200, '0.1'],
                [1704070800, '0.15'],
              ],
            },
          ],
        },
      });

      const { result, waitForNextUpdate } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitForNextUpdate();

      const apiGatewayMetrics = result.current.metricsMap.get('api-gateway');
      expect(apiGatewayMetrics).toBeDefined();
    });

    it('should handle instant query response format', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        data: {
          result: [
            {
              metric: { service: 'api-gateway' },
              value: [1704067200, '0.1'],
            },
          ],
        },
      });

      const { result, waitForNextUpdate } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitForNextUpdate();

      expect(result.current.metricsMap.has('api-gateway')).toBe(true);
    });

    it('should handle instantData format from query enhancements', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        meta: {
          instantData: {
            rows: [{ service: 'api-gateway', Time: 1704067200000, Value: '0.1' }],
          },
        },
      });

      const { result, waitForNextUpdate } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitForNextUpdate();

      expect(result.current.metricsMap.has('api-gateway')).toBe(true);
    });
  });
});

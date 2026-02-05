/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useEdgeMetrics } from '../use_edge_metrics';

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
  },
};

jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: jest.fn(() => ({ config: mockConfig })),
}));

import { useApmConfig } from '../../../config/apm_config_context';

describe('useEdgeMetrics', () => {
  const defaultParams = {
    enabled: true,
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-01T01:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useApmConfig as jest.Mock).mockReturnValue({ config: mockConfig });
  });

  describe('initial state', () => {
    it('should return empty map when enabled=false', () => {
      const { result } = renderHook(() =>
        useEdgeMetrics({
          ...defaultParams,
          enabled: false,
        })
      );

      expect(result.current.edgeMetricsMap.size).toBe(0);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should return empty map when no Prometheus config', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: {} });

      const { result } = renderHook(() => useEdgeMetrics(defaultParams));

      expect(result.current.edgeMetricsMap.size).toBe(0);
      expect(result.current.isLoading).toBe(false);
    });

    it('should return empty map when config is null', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: null });

      const { result } = renderHook(() => useEdgeMetrics(defaultParams));

      expect(result.current.edgeMetricsMap.size).toBe(0);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('successful fetch', () => {
    it('should fetch edge metrics successfully with standard Prometheus format', async () => {
      const mockEdgeResponse = (metricValue: number) => ({
        data: {
          result: [
            {
              metric: { service: 'frontend', environment: 'generic:default', remoteService: 'api' },
              value: [1704067200, String(metricValue)],
            },
            {
              metric: { service: 'api', environment: 'generic:default', remoteService: 'db' },
              value: [1704067200, String(metricValue + 10)],
            },
          ],
        },
      });

      mockExecuteMetricRequest
        .mockResolvedValueOnce(mockEdgeResponse(100)) // requests
        .mockResolvedValueOnce(mockEdgeResponse(50)) // latency
        .mockResolvedValueOnce(mockEdgeResponse(5)); // fault rate

      const { result } = renderHook(() => useEdgeMetrics(defaultParams));

      // Initial loading state
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.edgeMetricsMap.size).toBe(2);

      // Check first edge
      const frontendToApi = result.current.edgeMetricsMap.get('frontend::generic:default->api');
      expect(frontendToApi).toBeDefined();
      expect(frontendToApi?.requestCount).toBe(100);
      expect(frontendToApi?.latencyP95).toBe(50);
      expect(frontendToApi?.errorRate).toBe(5);

      // Check second edge
      const apiToDb = result.current.edgeMetricsMap.get('api::generic:default->db');
      expect(apiToDb).toBeDefined();
      expect(apiToDb?.requestCount).toBe(110);
    });

    it('should fetch edge metrics successfully with data frame format', async () => {
      const mockDataFrameResponse = (values: number[]) => ({
        type: 'data_frame',
        fields: [
          {
            name: 'Series',
            values: [
              '{service="frontend",environment="generic:default",remoteService="api"}',
              '{service="api",environment="generic:default",remoteService="db"}',
            ],
          },
          { name: 'Value', values },
        ],
      });

      mockExecuteMetricRequest
        .mockResolvedValueOnce(mockDataFrameResponse([100, 200])) // requests
        .mockResolvedValueOnce(mockDataFrameResponse([50, 75])) // latency
        .mockResolvedValueOnce(mockDataFrameResponse([5, 10])); // fault rate

      const { result } = renderHook(() => useEdgeMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.edgeMetricsMap.size).toBe(2);

      const frontendToApi = result.current.edgeMetricsMap.get('frontend::generic:default->api');
      expect(frontendToApi?.requestCount).toBe(100);
      expect(frontendToApi?.latencyP95).toBe(50);
      expect(frontendToApi?.errorRate).toBe(5);
    });

    it('should fetch edge metrics successfully with instantData format', async () => {
      const mockInstantDataResponse = (value: number) => ({
        meta: {
          instantData: {
            rows: [
              {
                service: 'frontend',
                environment: 'generic:default',
                remoteService: 'api',
                Value: value,
              },
              {
                service: 'api',
                environment: 'generic:default',
                remoteService: 'db',
                Value: value + 50,
              },
            ],
          },
        },
      });

      mockExecuteMetricRequest
        .mockResolvedValueOnce(mockInstantDataResponse(100)) // requests
        .mockResolvedValueOnce(mockInstantDataResponse(25)) // latency
        .mockResolvedValueOnce(mockInstantDataResponse(2)); // fault rate

      const { result } = renderHook(() => useEdgeMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.edgeMetricsMap.size).toBe(2);

      const frontendToApi = result.current.edgeMetricsMap.get('frontend::generic:default->api');
      expect(frontendToApi?.requestCount).toBe(100);
    });

    it('should handle range query format (values array)', async () => {
      const mockRangeResponse = {
        data: {
          result: [
            {
              metric: { service: 'frontend', environment: 'prod', remoteService: 'api' },
              values: [
                [1704067200, '50'],
                [1704067260, '100'],
              ],
            },
          ],
        },
      };

      mockExecuteMetricRequest.mockResolvedValue(mockRangeResponse);

      const { result } = renderHook(() => useEdgeMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should get the latest value (100)
      const edge = result.current.edgeMetricsMap.get('frontend::prod->api');
      expect(edge?.requestCount).toBe(100);
    });

    it('should use default environment when not provided', async () => {
      const mockResponse = {
        data: {
          result: [
            {
              metric: { service: 'frontend', remoteService: 'api' }, // No environment
              value: [1704067200, '100'],
            },
          ],
        },
      };

      mockExecuteMetricRequest.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useEdgeMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should use 'generic:default' as default environment
      const edge = result.current.edgeMetricsMap.get('frontend::generic:default->api');
      expect(edge).toBeDefined();
      expect(edge?.requestCount).toBe(100);
    });

    it('should handle empty response', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { result } = renderHook(() => useEdgeMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.edgeMetricsMap.size).toBe(0);
      expect(result.current.error).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should set error state on fetch failure', async () => {
      const mockError = new Error('Prometheus connection failed');
      mockExecuteMetricRequest.mockRejectedValue(mockError);

      const { result } = renderHook(() => useEdgeMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.edgeMetricsMap.size).toBe(0);
    });

    it('should wrap non-Error throws', async () => {
      mockExecuteMetricRequest.mockRejectedValue('string error');

      const { result } = renderHook(() => useEdgeMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Unknown error');
    });

    it('should handle null response gracefully', async () => {
      mockExecuteMetricRequest.mockResolvedValue(null);

      const { result } = renderHook(() => useEdgeMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.edgeMetricsMap.size).toBe(0);
      expect(result.current.error).toBeNull();
    });

    it('should handle malformed data frame response', async () => {
      const malformedResponse = {
        type: 'data_frame',
        fields: [
          { name: 'Series', values: [] }, // Empty series
          { name: 'Value', values: [] },
        ],
      };

      mockExecuteMetricRequest.mockResolvedValue(malformedResponse);

      const { result } = renderHook(() => useEdgeMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.edgeMetricsMap.size).toBe(0);
      expect(result.current.error).toBeNull();
    });

    it('should handle missing labels in series data', async () => {
      const responseWithMissingLabels = {
        type: 'data_frame',
        fields: [
          {
            name: 'Series',
            values: [
              '{service="frontend"}', // Missing remoteService
              '{remoteService="api"}', // Missing service
            ],
          },
          { name: 'Value', values: [100, 200] },
        ],
      };

      mockExecuteMetricRequest.mockResolvedValue(responseWithMissingLabels);

      const { result } = renderHook(() => useEdgeMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should not create edges for incomplete labels
      expect(result.current.edgeMetricsMap.size).toBe(0);
    });
  });

  describe('refetch', () => {
    it('should refetch data when refetch is called', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { result } = renderHook(() => useEdgeMetrics(defaultParams));

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

      // Should have made 3 more calls (requests, latency, fault rate)
      expect(mockExecuteMetricRequest.mock.calls.length).toBe(initialCallCount + 3);
    });
  });

  describe('parameter changes', () => {
    it('should refetch when time range changes', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { result, rerender } = renderHook(({ params }) => useEdgeMetrics(params), {
        initialProps: { params: defaultParams },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const callsAfterInitial = mockExecuteMetricRequest.mock.calls.length;

      rerender({
        params: {
          ...defaultParams,
          startTime: new Date('2024-01-02T00:00:00Z'),
        },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockExecuteMetricRequest.mock.calls.length).toBeGreaterThan(callsAfterInitial);
    });

    it('should not fetch when enabled changes from true to false', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { result, rerender } = renderHook(({ params }) => useEdgeMetrics(params), {
        initialProps: { params: defaultParams },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const callsAfterInitial = mockExecuteMetricRequest.mock.calls.length;

      rerender({
        params: {
          ...defaultParams,
          enabled: false,
        },
      });

      // Should clear the map without making new calls
      expect(result.current.edgeMetricsMap.size).toBe(0);
      expect(mockExecuteMetricRequest.mock.calls.length).toBe(callsAfterInitial);
    });
  });
});

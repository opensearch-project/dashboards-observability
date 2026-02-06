/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useSelectedEdgeMetrics } from '../use_selected_edge_metrics';
import { SelectedEdgeState } from '../../../common/types/service_map_types';

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

describe('useSelectedEdgeMetrics', () => {
  const mockSelectedEdge: SelectedEdgeState = {
    edgeId: 'frontend::generic:default->api',
    sourceService: 'frontend',
    sourceEnvironment: 'generic:default',
    targetService: 'api',
    position: { x: 100, y: 200 },
  };

  const defaultParams = {
    selectedEdge: mockSelectedEdge,
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-01T01:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useApmConfig as jest.Mock).mockReturnValue({ config: mockConfig });
  });

  describe('initial state', () => {
    it('should return null when no edge selected', () => {
      const { result } = renderHook(() =>
        useSelectedEdgeMetrics({
          ...defaultParams,
          selectedEdge: null,
        })
      );

      expect(result.current.metrics).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should return null when no Prometheus config', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: {} });

      const { result } = renderHook(() => useSelectedEdgeMetrics(defaultParams));

      expect(result.current.metrics).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('should return null when config is null', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: null });

      const { result } = renderHook(() => useSelectedEdgeMetrics(defaultParams));

      expect(result.current.metrics).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('successful fetch', () => {
    it('should fetch metrics for selected edge with standard Prometheus format', async () => {
      const mockMetricResponse = (value: number) => ({
        data: {
          result: [
            {
              metric: {},
              value: [1704067200, String(value)],
            },
          ],
        },
      });

      mockExecuteMetricRequest
        .mockResolvedValueOnce(mockMetricResponse(1000)) // requests
        .mockResolvedValueOnce(mockMetricResponse(250)) // latency P99
        .mockResolvedValueOnce(mockMetricResponse(50)) // faults
        .mockResolvedValueOnce(mockMetricResponse(25)); // errors

      const { result } = renderHook(() => useSelectedEdgeMetrics(defaultParams));

      // Initial loading state
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.metrics).not.toBeNull();

      // Check metrics values
      expect(result.current.metrics?.edgeId).toBe('frontend::generic:default->api');
      expect(result.current.metrics?.sourceService).toBe('frontend');
      expect(result.current.metrics?.sourceEnvironment).toBe('generic:default');
      expect(result.current.metrics?.targetService).toBe('api');
      expect(result.current.metrics?.requestCount).toBe(1000);
      expect(result.current.metrics?.latencyP99).toBe(250);
      expect(result.current.metrics?.faultCount).toBe(50);
      expect(result.current.metrics?.errorCount).toBe(25);
    });

    it('should extract values from data frame format', async () => {
      const mockDataFrameResponse = (value: number) => ({
        type: 'data_frame',
        fields: [
          { name: 'Time', values: [1704067200000, 1704067260000] },
          { name: 'Value', values: [value - 10, value] }, // Latest value is `value`
        ],
      });

      mockExecuteMetricRequest
        .mockResolvedValueOnce(mockDataFrameResponse(500)) // requests
        .mockResolvedValueOnce(mockDataFrameResponse(150)) // latency P99
        .mockResolvedValueOnce(mockDataFrameResponse(30)) // faults
        .mockResolvedValueOnce(mockDataFrameResponse(15)); // errors

      const { result } = renderHook(() => useSelectedEdgeMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.metrics?.requestCount).toBe(500);
      expect(result.current.metrics?.latencyP99).toBe(150);
      expect(result.current.metrics?.faultCount).toBe(30);
      expect(result.current.metrics?.errorCount).toBe(15);
    });

    it('should extract values from instantData format', async () => {
      const mockInstantDataResponse = (value: number) => ({
        meta: {
          instantData: {
            rows: [{ Value: value }],
          },
        },
      });

      mockExecuteMetricRequest
        .mockResolvedValueOnce(mockInstantDataResponse(750)) // requests
        .mockResolvedValueOnce(mockInstantDataResponse(200)) // latency P99
        .mockResolvedValueOnce(mockInstantDataResponse(40)) // faults
        .mockResolvedValueOnce(mockInstantDataResponse(20)); // errors

      const { result } = renderHook(() => useSelectedEdgeMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.metrics?.requestCount).toBe(750);
      expect(result.current.metrics?.latencyP99).toBe(200);
      expect(result.current.metrics?.faultCount).toBe(40);
      expect(result.current.metrics?.errorCount).toBe(20);
    });

    it('should handle range query format (values array)', async () => {
      const mockRangeResponse = {
        data: {
          result: [
            {
              metric: {},
              values: [
                [1704067200, '50'],
                [1704067260, '100'],
                [1704067320, '150'],
              ],
            },
          ],
        },
      };

      mockExecuteMetricRequest.mockResolvedValue(mockRangeResponse);

      const { result } = renderHook(() => useSelectedEdgeMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should get the latest value (150)
      expect(result.current.metrics?.requestCount).toBe(150);
    });

    it('should handle empty response', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { result } = renderHook(() => useSelectedEdgeMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.metrics).not.toBeNull();
      expect(result.current.metrics?.requestCount).toBe(0);
      expect(result.current.metrics?.latencyP99).toBe(0);
      expect(result.current.metrics?.faultCount).toBe(0);
      expect(result.current.metrics?.errorCount).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should set error state on fetch failure', async () => {
      const mockError = new Error('Prometheus connection failed');
      mockExecuteMetricRequest.mockRejectedValue(mockError);

      const { result } = renderHook(() => useSelectedEdgeMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.metrics).toBeNull();
    });

    it('should wrap non-Error throws', async () => {
      mockExecuteMetricRequest.mockRejectedValue('string error');

      const { result } = renderHook(() => useSelectedEdgeMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Unknown error');
    });

    it('should handle null response gracefully', async () => {
      mockExecuteMetricRequest.mockResolvedValue(null);

      const { result } = renderHook(() => useSelectedEdgeMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.metrics).not.toBeNull();
      expect(result.current.metrics?.requestCount).toBe(0);
    });

    it('should handle undefined response gracefully', async () => {
      mockExecuteMetricRequest.mockResolvedValue(undefined);

      const { result } = renderHook(() => useSelectedEdgeMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.metrics).not.toBeNull();
      expect(result.current.metrics?.requestCount).toBe(0);
    });

    it('should handle missing value fields in data frame', async () => {
      const malformedResponse = {
        type: 'data_frame',
        fields: [
          { name: 'Time', values: [1704067200000] },
          // Missing 'Value' field
        ],
      };

      mockExecuteMetricRequest.mockResolvedValue(malformedResponse);

      const { result } = renderHook(() => useSelectedEdgeMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.metrics?.requestCount).toBe(0);
    });

    it('should handle empty instantData rows', async () => {
      const emptyInstantData = {
        meta: {
          instantData: {
            rows: [],
          },
        },
      };

      mockExecuteMetricRequest.mockResolvedValue(emptyInstantData);

      const { result } = renderHook(() => useSelectedEdgeMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.metrics?.requestCount).toBe(0);
    });
  });

  describe('parameter changes', () => {
    it('should refetch when edge selection changes', async () => {
      const mockMetricResponse = (value: number) => ({
        data: {
          result: [{ metric: {}, value: [1704067200, String(value)] }],
        },
      });

      mockExecuteMetricRequest.mockResolvedValue(mockMetricResponse(100));

      const { result, rerender } = renderHook(({ params }) => useSelectedEdgeMetrics(params), {
        initialProps: { params: defaultParams },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const callsAfterInitial = mockExecuteMetricRequest.mock.calls.length;

      const newSelectedEdge: SelectedEdgeState = {
        edgeId: 'api::prod->db',
        sourceService: 'api',
        sourceEnvironment: 'prod',
        targetService: 'db',
        position: { x: 200, y: 300 },
      };

      rerender({
        params: {
          ...defaultParams,
          selectedEdge: newSelectedEdge,
        },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockExecuteMetricRequest.mock.calls.length).toBeGreaterThan(callsAfterInitial);
    });

    it('should not refetch when only position changes', async () => {
      const mockMetricResponse = (value: number) => ({
        data: {
          result: [{ metric: {}, value: [1704067200, String(value)] }],
        },
      });

      mockExecuteMetricRequest.mockResolvedValue(mockMetricResponse(100));

      const { result, rerender } = renderHook(({ params }) => useSelectedEdgeMetrics(params), {
        initialProps: { params: defaultParams },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const callsAfterInitial = mockExecuteMetricRequest.mock.calls.length;

      // Only change the position, not the edge identity
      const sameEdgeDifferentPosition: SelectedEdgeState = {
        ...mockSelectedEdge,
        position: { x: 500, y: 600 }, // Different position
      };

      rerender({
        params: {
          ...defaultParams,
          selectedEdge: sameEdgeDifferentPosition,
        },
      });

      // Should not trigger a refetch since edgeId, sourceService, etc. are the same
      expect(mockExecuteMetricRequest.mock.calls.length).toBe(callsAfterInitial);
    });

    it('should refetch when time range changes', async () => {
      const mockMetricResponse = (value: number) => ({
        data: {
          result: [{ metric: {}, value: [1704067200, String(value)] }],
        },
      });

      mockExecuteMetricRequest.mockResolvedValue(mockMetricResponse(100));

      const { result, rerender } = renderHook(({ params }) => useSelectedEdgeMetrics(params), {
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

    it('should clear metrics when edge is deselected', async () => {
      const mockMetricResponse = (value: number) => ({
        data: {
          result: [{ metric: {}, value: [1704067200, String(value)] }],
        },
      });

      mockExecuteMetricRequest.mockResolvedValue(mockMetricResponse(100));

      const { result, rerender } = renderHook(({ params }) => useSelectedEdgeMetrics(params), {
        initialProps: { params: defaultParams },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.metrics).not.toBeNull();

      const callsAfterInitial = mockExecuteMetricRequest.mock.calls.length;

      rerender({
        params: {
          ...defaultParams,
          selectedEdge: null,
        },
      });

      // Should clear metrics without making new calls
      expect(result.current.metrics).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(mockExecuteMetricRequest.mock.calls.length).toBe(callsAfterInitial);
    });
  });

  describe('query parameters', () => {
    it('should pass correct parameters to query functions', async () => {
      const mockMetricResponse = {
        data: {
          result: [{ metric: {}, value: [1704067200, '100'] }],
        },
      };

      mockExecuteMetricRequest.mockResolvedValue(mockMetricResponse);

      const customEdge: SelectedEdgeState = {
        edgeId: 'my-service::production->backend',
        sourceService: 'my-service',
        sourceEnvironment: 'production',
        targetService: 'backend',
        position: { x: 0, y: 0 },
      };

      renderHook(() =>
        useSelectedEdgeMetrics({
          ...defaultParams,
          selectedEdge: customEdge,
        })
      );

      // Wait for the effect to run
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Check that the query includes the correct service parameters
      expect(mockExecuteMetricRequest).toHaveBeenCalled();
      const queryCall = mockExecuteMetricRequest.mock.calls[0][0];
      expect(queryCall.query).toContain('my-service');
      expect(queryCall.query).toContain('production');
      expect(queryCall.query).toContain('backend');
    });
  });
});

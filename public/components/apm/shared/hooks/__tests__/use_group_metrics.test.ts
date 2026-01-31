/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '@testing-library/react-hooks';
import { useGroupMetrics } from '../use_group_metrics';

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

describe('useGroupMetrics', () => {
  const defaultParams = {
    groupByAttribute: 'telemetry.sdk.language',
    groupByValue: 'java',
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-01T01:00:00Z'),
    enabled: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useApmConfig as jest.Mock).mockReturnValue({ config: mockConfig });
  });

  describe('initial state', () => {
    it('should return null metrics when enabled=false', () => {
      const { result } = renderHook(() =>
        useGroupMetrics({
          ...defaultParams,
          enabled: false,
        })
      );

      expect(result.current.metrics).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should return null when no groupByAttribute', () => {
      const { result } = renderHook(() =>
        useGroupMetrics({
          ...defaultParams,
          groupByAttribute: '',
        })
      );

      expect(result.current.metrics).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('should return null when no groupByValue', () => {
      const { result } = renderHook(() =>
        useGroupMetrics({
          ...defaultParams,
          groupByValue: '',
        })
      );

      expect(result.current.metrics).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('should return null when no Prometheus config', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: {} });

      const { result } = renderHook(() => useGroupMetrics(defaultParams));

      expect(result.current.metrics).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('should return null when config is null', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: null });

      const { result } = renderHook(() => useGroupMetrics(defaultParams));

      expect(result.current.metrics).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('successful fetch', () => {
    it('should fetch group metrics successfully with standard Prometheus format', async () => {
      const mockMetricResponse = (value: number) => ({
        data: {
          result: [
            {
              metric: {},
              values: [
                [1704067200, String(value)],
                [1704067260, String(value + 10)],
              ],
            },
          ],
        },
      });

      mockExecuteMetricRequest
        .mockResolvedValueOnce(mockMetricResponse(1000)) // throughput
        .mockResolvedValueOnce(mockMetricResponse(50)) // faults
        .mockResolvedValueOnce(mockMetricResponse(100)) // errors
        .mockResolvedValueOnce(mockMetricResponse(100)) // latency P50
        .mockResolvedValueOnce(mockMetricResponse(200)) // latency P90
        .mockResolvedValueOnce(mockMetricResponse(500)); // latency P99

      const { result, waitForNextUpdate } = renderHook(() => useGroupMetrics(defaultParams));

      // Initial loading state
      expect(result.current.isLoading).toBe(true);

      await waitForNextUpdate();

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.metrics).not.toBeNull();

      // Check metrics values
      expect(result.current.metrics?.throughput.length).toBeGreaterThan(0);
      expect(result.current.metrics?.faults.length).toBeGreaterThan(0);
      expect(result.current.metrics?.errors.length).toBeGreaterThan(0);
      expect(result.current.metrics?.latencyP50.length).toBeGreaterThan(0);
      expect(result.current.metrics?.latencyP90.length).toBeGreaterThan(0);
      expect(result.current.metrics?.latencyP99.length).toBeGreaterThan(0);
    });

    it('should fetch group metrics successfully with data frame format', async () => {
      const mockDataFrameResponse = (values: number[]) => ({
        type: 'data_frame',
        fields: [
          { name: 'Time', values: [1704067200000, 1704067260000] },
          { name: 'Value', values },
        ],
      });

      mockExecuteMetricRequest
        .mockResolvedValueOnce(mockDataFrameResponse([1000, 1100])) // throughput
        .mockResolvedValueOnce(mockDataFrameResponse([50, 60])) // faults
        .mockResolvedValueOnce(mockDataFrameResponse([100, 110])) // errors
        .mockResolvedValueOnce(mockDataFrameResponse([100, 105])) // latency P50
        .mockResolvedValueOnce(mockDataFrameResponse([200, 210])) // latency P90
        .mockResolvedValueOnce(mockDataFrameResponse([500, 520])); // latency P99

      const { result, waitForNextUpdate } = renderHook(() => useGroupMetrics(defaultParams));

      await waitForNextUpdate();

      expect(result.current.metrics).not.toBeNull();
      expect(result.current.metrics?.throughput.length).toBe(2);
      expect(result.current.metrics?.avgThroughput).toBe(1050); // (1000 + 1100) / 2
    });

    it('should fetch group metrics successfully with instantData format', async () => {
      const mockInstantDataResponse = (value: number) => ({
        meta: {
          instantData: {
            rows: [{ Time: 1704067200000, Value: value }],
          },
        },
      });

      mockExecuteMetricRequest
        .mockResolvedValueOnce(mockInstantDataResponse(1000)) // throughput
        .mockResolvedValueOnce(mockInstantDataResponse(50)) // faults
        .mockResolvedValueOnce(mockInstantDataResponse(100)) // errors
        .mockResolvedValueOnce(mockInstantDataResponse(100)) // latency P50
        .mockResolvedValueOnce(mockInstantDataResponse(200)) // latency P90
        .mockResolvedValueOnce(mockInstantDataResponse(500)); // latency P99

      const { result, waitForNextUpdate } = renderHook(() => useGroupMetrics(defaultParams));

      await waitForNextUpdate();

      expect(result.current.metrics).not.toBeNull();
      expect(result.current.metrics?.throughput.length).toBe(1);
    });

    it('should calculate failure ratio correctly', async () => {
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
        .mockResolvedValueOnce(mockMetricResponse(100)) // throughput (total requests)
        .mockResolvedValueOnce(mockMetricResponse(10)) // faults
        .mockResolvedValueOnce(mockMetricResponse(5)) // errors
        .mockResolvedValueOnce(mockMetricResponse(100)) // latency P50
        .mockResolvedValueOnce(mockMetricResponse(200)) // latency P90
        .mockResolvedValueOnce(mockMetricResponse(500)); // latency P99

      const { result, waitForNextUpdate } = renderHook(() => useGroupMetrics(defaultParams));

      await waitForNextUpdate();

      // Failure ratio = (faults + errors) / totalRequests * 100
      // = (10 + 5) / 100 * 100 = 15%
      expect(result.current.metrics?.avgFailureRatio).toBe(15);
      expect(result.current.metrics?.totalRequests).toBe(100);
      expect(result.current.metrics?.totalFaults).toBe(10);
      expect(result.current.metrics?.totalErrors).toBe(5);
    });

    it('should handle zero total requests (avoid division by zero)', async () => {
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
        .mockResolvedValueOnce(mockMetricResponse(0)) // throughput (0 requests)
        .mockResolvedValueOnce(mockMetricResponse(0)) // faults
        .mockResolvedValueOnce(mockMetricResponse(0)) // errors
        .mockResolvedValueOnce(mockMetricResponse(0)) // latency P50
        .mockResolvedValueOnce(mockMetricResponse(0)) // latency P90
        .mockResolvedValueOnce(mockMetricResponse(0)); // latency P99

      const { result, waitForNextUpdate } = renderHook(() => useGroupMetrics(defaultParams));

      await waitForNextUpdate();

      // Should be 0, not NaN or Infinity
      expect(result.current.metrics?.avgFailureRatio).toBe(0);
    });

    it('should handle empty response', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { result, waitForNextUpdate } = renderHook(() => useGroupMetrics(defaultParams));

      await waitForNextUpdate();

      expect(result.current.metrics).not.toBeNull();
      expect(result.current.metrics?.throughput).toEqual([]);
      expect(result.current.metrics?.avgThroughput).toBe(0);
    });

    it('should convert attribute name to Prometheus label format', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      renderHook(() =>
        useGroupMetrics({
          ...defaultParams,
          groupByAttribute: 'telemetry.sdk.language',
        })
      );

      // Wait for the effect to run
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Check that the query includes the converted label name (dots to underscores)
      expect(mockExecuteMetricRequest).toHaveBeenCalled();
      const queryCall = mockExecuteMetricRequest.mock.calls[0][0];
      expect(queryCall.query).toContain('telemetry_sdk_language');
    });
  });

  describe('error handling', () => {
    it('should set error state on fetch failure', async () => {
      const mockError = new Error('Prometheus connection failed');
      mockExecuteMetricRequest.mockRejectedValue(mockError);

      const { result, waitForNextUpdate } = renderHook(() => useGroupMetrics(defaultParams));

      await waitForNextUpdate();

      expect(result.current.error).toEqual(mockError);
      expect(result.current.metrics).toBeNull();
    });

    it('should wrap non-Error throws', async () => {
      mockExecuteMetricRequest.mockRejectedValue('string error');

      const { result, waitForNextUpdate } = renderHook(() => useGroupMetrics(defaultParams));

      await waitForNextUpdate();

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Unknown error');
    });

    it('should handle null response gracefully', async () => {
      mockExecuteMetricRequest.mockResolvedValue(null);

      const { result, waitForNextUpdate } = renderHook(() => useGroupMetrics(defaultParams));

      await waitForNextUpdate();

      expect(result.current.metrics).not.toBeNull();
      expect(result.current.metrics?.throughput).toEqual([]);
    });

    it('should handle NaN values in calculations', async () => {
      const mockResponseWithNaN = {
        type: 'data_frame',
        fields: [
          { name: 'Time', values: [1704067200000, 1704067260000] },
          { name: 'Value', values: [NaN, 100] },
        ],
      };

      mockExecuteMetricRequest.mockResolvedValue(mockResponseWithNaN);

      const { result, waitForNextUpdate } = renderHook(() => useGroupMetrics(defaultParams));

      await waitForNextUpdate();

      // Should filter out NaN and calculate based on valid values
      expect(result.current.metrics).not.toBeNull();
      expect(Number.isFinite(result.current.metrics?.avgThroughput)).toBe(true);
    });

    it('should handle Infinity values in calculations', async () => {
      const mockResponseWithInfinity = {
        type: 'data_frame',
        fields: [
          { name: 'Time', values: [1704067200000, 1704067260000] },
          { name: 'Value', values: [Infinity, 100] },
        ],
      };

      mockExecuteMetricRequest.mockResolvedValue(mockResponseWithInfinity);

      const { result, waitForNextUpdate } = renderHook(() => useGroupMetrics(defaultParams));

      await waitForNextUpdate();

      // Should filter out Infinity and calculate based on valid values
      expect(result.current.metrics).not.toBeNull();
      expect(Number.isFinite(result.current.metrics?.avgThroughput)).toBe(true);
    });
  });

  describe('parameter changes', () => {
    it('should refetch when groupByValue changes', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { waitForNextUpdate, rerender } = renderHook(({ params }) => useGroupMetrics(params), {
        initialProps: { params: defaultParams },
      });

      await waitForNextUpdate();

      const callsAfterInitial = mockExecuteMetricRequest.mock.calls.length;

      rerender({
        params: {
          ...defaultParams,
          groupByValue: 'python',
        },
      });

      await waitForNextUpdate();

      expect(mockExecuteMetricRequest.mock.calls.length).toBeGreaterThan(callsAfterInitial);
    });

    it('should refetch when groupByAttribute changes', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { waitForNextUpdate, rerender } = renderHook(({ params }) => useGroupMetrics(params), {
        initialProps: { params: defaultParams },
      });

      await waitForNextUpdate();

      const callsAfterInitial = mockExecuteMetricRequest.mock.calls.length;

      rerender({
        params: {
          ...defaultParams,
          groupByAttribute: 'service.namespace',
        },
      });

      await waitForNextUpdate();

      expect(mockExecuteMetricRequest.mock.calls.length).toBeGreaterThan(callsAfterInitial);
    });

    it('should refetch when time range changes', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { waitForNextUpdate, rerender } = renderHook(({ params }) => useGroupMetrics(params), {
        initialProps: { params: defaultParams },
      });

      await waitForNextUpdate();

      const callsAfterInitial = mockExecuteMetricRequest.mock.calls.length;

      rerender({
        params: {
          ...defaultParams,
          startTime: new Date('2024-01-02T00:00:00Z'),
        },
      });

      await waitForNextUpdate();

      expect(mockExecuteMetricRequest.mock.calls.length).toBeGreaterThan(callsAfterInitial);
    });

    it('should not fetch when enabled changes from true to false', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { result, waitForNextUpdate, rerender } = renderHook(
        ({ params }) => useGroupMetrics(params),
        { initialProps: { params: defaultParams } }
      );

      await waitForNextUpdate();

      const callsAfterInitial = mockExecuteMetricRequest.mock.calls.length;

      rerender({
        params: {
          ...defaultParams,
          enabled: false,
        },
      });

      // Should set metrics to null without making new calls
      expect(result.current.metrics).toBeNull();
      expect(mockExecuteMetricRequest.mock.calls.length).toBe(callsAfterInitial);
    });
  });
});

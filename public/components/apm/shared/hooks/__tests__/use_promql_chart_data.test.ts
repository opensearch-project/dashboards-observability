/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { usePromQLChartData } from '../use_promql_chart_data';

// Mock the PromQLSearchService
const mockExecuteMetricRequest = jest.fn();
jest.mock('../../../query_services/promql_search_service', () => ({
  PromQLSearchService: jest.fn().mockImplementation(() => ({
    executeMetricRequest: mockExecuteMetricRequest,
  })),
}));

// Mock time_utils
jest.mock('../../utils/time_utils', () => ({
  parseTimeRange: jest.fn(() => ({
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-01T01:00:00Z'),
  })),
  getTimeInSeconds: jest.fn((date) => Math.floor(date.getTime() / 1000)),
}));

describe('usePromQLChartData', () => {
  const defaultParams = {
    promqlQuery: 'sum(rate(requests_total[5m]))',
    timeRange: { from: 'now-1h', to: 'now' },
    prometheusConnectionId: 'prometheus-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('should return empty series when disabled', () => {
      const { result } = renderHook(() =>
        usePromQLChartData({
          ...defaultParams,
          enabled: false,
        })
      );

      expect(result.current.series).toEqual([]);
      expect(result.current.latestValue).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should return empty series when no promqlQuery', () => {
      const { result } = renderHook(() =>
        usePromQLChartData({
          ...defaultParams,
          promqlQuery: '',
        })
      );

      expect(result.current.series).toEqual([]);
    });

    it('should return empty series when no prometheusConnectionId', () => {
      const { result } = renderHook(() =>
        usePromQLChartData({
          ...defaultParams,
          prometheusConnectionId: '',
        })
      );

      expect(result.current.series).toEqual([]);
    });
  });

  describe('successful fetch - data_frame format', () => {
    it('should transform data_frame response to chart series', async () => {
      const mockResponse = {
        type: 'data_frame',
        fields: [
          { name: 'Time', type: 'timestamp', values: [1704067200000, 1704067260000] },
          { name: 'Series', type: 'string', values: ['frontend', 'frontend'] },
          { name: 'Value', type: 'double', values: [100, 150] },
        ],
        size: 2,
      };

      mockExecuteMetricRequest.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => usePromQLChartData(defaultParams));

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.series).toHaveLength(1);
      expect(result.current.series[0].name).toBe('frontend');
      expect(result.current.series[0].data).toHaveLength(2);
      expect(result.current.series[0].data[0].value).toBe(100);
      expect(result.current.latestValue).toBe(150);
    });

    it('should handle multiple series in data_frame', async () => {
      const mockResponse = {
        type: 'data_frame',
        fields: [
          { name: 'Time', type: 'timestamp', values: [1704067200000, 1704067200000] },
          { name: 'Series', type: 'string', values: ['frontend', 'cart'] },
          { name: 'Value', type: 'double', values: [100, 200] },
        ],
        size: 2,
      };

      mockExecuteMetricRequest.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => usePromQLChartData(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.series).toHaveLength(2);
    });

    it('should extract labelField from series name', async () => {
      const mockResponse = {
        type: 'data_frame',
        fields: [
          { name: 'Time', type: 'timestamp', values: [1704067200000] },
          {
            name: 'Series',
            type: 'string',
            values: ['{remoteService="cart", operation="AddItem"}'],
          },
          { name: 'Value', type: 'double', values: [100] },
        ],
        size: 1,
      };

      mockExecuteMetricRequest.mockResolvedValue(mockResponse);

      const { result } = renderHook(() =>
        usePromQLChartData({
          ...defaultParams,
          labelField: 'remoteService',
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.series[0].name).toBe('cart');
    });
  });

  describe('successful fetch - JDBC format', () => {
    it('should transform JDBC response to chart series', async () => {
      const mockResponse = {
        schema: [
          { name: '@timestamp', type: 'timestamp' },
          { name: 'service', type: 'string' },
          { name: 'value', type: 'double' },
        ],
        datarows: [
          ['2024-01-01T00:00:00Z', 'frontend', 100],
          ['2024-01-01T00:01:00Z', 'frontend', 150],
        ],
      };

      mockExecuteMetricRequest.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => usePromQLChartData(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.series).toHaveLength(1);
      expect(result.current.series[0].data).toHaveLength(2);
    });
  });

  describe('successful fetch - Prometheus format', () => {
    it('should transform Prometheus response to chart series', async () => {
      const mockResponse = {
        data: {
          result: [
            {
              metric: { service: 'frontend' },
              values: [
                [1704067200, '100'],
                [1704067260, '150'],
              ],
            },
          ],
        },
      };

      mockExecuteMetricRequest.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => usePromQLChartData(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.series).toHaveLength(1);
      expect(result.current.series[0].name).toBe('frontend');
      expect(result.current.series[0].data).toHaveLength(2);
      // Values are converted from seconds to milliseconds
      expect(result.current.series[0].data[0].timestamp).toBe(1704067200000);
    });

    it('should extract labelField from Prometheus labels', async () => {
      const mockResponse = {
        data: {
          result: [
            {
              metric: { remoteService: 'cart', operation: 'AddItem' },
              values: [[1704067200, '100']],
            },
          ],
        },
      };

      mockExecuteMetricRequest.mockResolvedValue(mockResponse);

      const { result } = renderHook(() =>
        usePromQLChartData({
          ...defaultParams,
          labelField: 'remoteService',
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.series[0].name).toBe('cart');
    });

    it('should use priority label order when no labelField specified', async () => {
      const mockResponse = {
        data: {
          result: [
            {
              metric: { job: 'prometheus', service: 'frontend' },
              values: [[1704067200, '100']],
            },
          ],
        },
      };

      mockExecuteMetricRequest.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => usePromQLChartData(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // 'service' has higher priority than 'job'
      expect(result.current.series[0].name).toBe('frontend');
    });
  });

  describe('error handling', () => {
    it('should set error state on fetch failure', async () => {
      const mockError = new Error('PromQL query failed');
      mockExecuteMetricRequest.mockRejectedValue(mockError);

      const { result } = renderHook(() => usePromQLChartData(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.series).toEqual([]);
      expect(result.current.latestValue).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('should wrap non-Error throws', async () => {
      mockExecuteMetricRequest.mockRejectedValue('string error');

      const { result } = renderHook(() => usePromQLChartData(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Unknown error');
    });
  });

  describe('refetch', () => {
    it('should refetch when refetch function is called', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { result } = renderHook(() => usePromQLChartData(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockExecuteMetricRequest).toHaveBeenCalledTimes(1);

      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockExecuteMetricRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe('parameter changes', () => {
    it('should refetch when promqlQuery changes', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { result, rerender } = renderHook(({ params }) => usePromQLChartData(params), {
        initialProps: { params: defaultParams },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      rerender({
        params: {
          ...defaultParams,
          promqlQuery: 'different_query',
        },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockExecuteMetricRequest).toHaveBeenCalledTimes(2);
    });

    it('should refetch when refreshTrigger changes', async () => {
      mockExecuteMetricRequest.mockResolvedValue({ data: { result: [] } });

      const { result, rerender } = renderHook(({ params }) => usePromQLChartData(params), {
        initialProps: { params: { ...defaultParams, refreshTrigger: 0 } },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      rerender({
        params: { ...defaultParams, refreshTrigger: 1 },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockExecuteMetricRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe('edge cases', () => {
    it('should handle null response', async () => {
      mockExecuteMetricRequest.mockResolvedValue(null);

      const { result } = renderHook(() => usePromQLChartData(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.series).toEqual([]);
      expect(result.current.latestValue).toBeNull();
    });

    it('should handle empty data_frame fields', async () => {
      const mockResponse = {
        type: 'data_frame',
        fields: [],
        size: 0,
      };

      mockExecuteMetricRequest.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => usePromQLChartData(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.series).toEqual([]);
    });

    it('should skip NaN values in data', async () => {
      const mockResponse = {
        type: 'data_frame',
        fields: [
          { name: 'Time', type: 'timestamp', values: [1704067200000, 1704067260000] },
          { name: 'Series', type: 'string', values: ['frontend', 'frontend'] },
          { name: 'Value', type: 'double', values: [NaN, 150] },
        ],
        size: 2,
      };

      mockExecuteMetricRequest.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => usePromQLChartData(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.series[0].data).toHaveLength(1);
      expect(result.current.series[0].data[0].value).toBe(150);
    });

    it('should assign colors to series from CHART_COLORS', async () => {
      const mockResponse = {
        type: 'data_frame',
        fields: [
          { name: 'Time', type: 'timestamp', values: [1704067200000, 1704067200000] },
          { name: 'Series', type: 'string', values: ['service1', 'service2'] },
          { name: 'Value', type: 'double', values: [100, 200] },
        ],
        size: 2,
      };

      mockExecuteMetricRequest.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => usePromQLChartData(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Each series should have a color assigned
      expect(result.current.series[0].color).toBeDefined();
      expect(result.current.series[1].color).toBeDefined();
      expect(result.current.series[0].color).not.toBe(result.current.series[1].color);
    });

    it('should sort data points by timestamp', async () => {
      const mockResponse = {
        type: 'data_frame',
        fields: [
          { name: 'Time', type: 'timestamp', values: [1704067260000, 1704067200000] }, // Out of order
          { name: 'Series', type: 'string', values: ['frontend', 'frontend'] },
          { name: 'Value', type: 'double', values: [150, 100] },
        ],
        size: 2,
      };

      mockExecuteMetricRequest.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => usePromQLChartData(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Data should be sorted by timestamp
      expect(result.current.series[0].data[0].timestamp).toBeLessThan(
        result.current.series[0].data[1].timestamp
      );
      expect(result.current.series[0].data[0].value).toBe(100);
      expect(result.current.series[0].data[1].value).toBe(150);
    });
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react-hooks';
import { useServiceDependenciesByFaultRate } from '../use_service_dependencies_by_fault_rate';

// Mock the PromQLSearchService
const mockExecuteMetricRequest = jest.fn();
jest.mock('../../../query_services/promql_search_service', () => ({
  PromQLSearchService: jest.fn().mockImplementation(() => ({
    executeMetricRequest: mockExecuteMetricRequest,
  })),
}));

// Mock promql_queries
jest.mock('../../../query_services/query_requests/promql_queries', () => ({
  getQueryServiceDependenciesByFaultRateAvg: jest.fn(() => 'mock_fault_rate_query'),
}));

// Mock time_utils
jest.mock('../../utils/time_utils', () => ({
  getTimeInSeconds: jest.fn((date) => Math.floor(date.getTime() / 1000)),
  calculateTimeRangeDuration: jest.fn(() => '1h'),
}));

// Mock the APM config context
const mockConfig = {
  prometheusDataSource: {
    id: 'prometheus-1',
    name: 'prometheus-1', // ConnectionId for PromQL queries
  },
};

jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: jest.fn(() => ({ config: mockConfig })),
}));

import { useApmConfig } from '../../../config/apm_config_context';

describe('useServiceDependenciesByFaultRate', () => {
  const defaultParams = {
    serviceName: 'frontend',
    environment: 'production',
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-01T01:00:00Z'),
    limit: 5,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useApmConfig as jest.Mock).mockReturnValue({ config: mockConfig });
  });

  describe('initial state', () => {
    it('should return empty data when no prometheusDataSource', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: {} });

      const { result } = renderHook(() => useServiceDependenciesByFaultRate(defaultParams));

      expect(result.current.data).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should return empty data when serviceName is missing', () => {
      const { result } = renderHook(() =>
        useServiceDependenciesByFaultRate({
          ...defaultParams,
          serviceName: '',
        })
      );

      expect(result.current.data).toEqual([]);
    });

    it('should return empty data when environment is missing', () => {
      const { result } = renderHook(() =>
        useServiceDependenciesByFaultRate({
          ...defaultParams,
          environment: '',
        })
      );

      expect(result.current.data).toEqual([]);
    });
  });

  describe('successful fetch - data frame format', () => {
    it('should fetch and transform dependencies data', async () => {
      const mockResponse = {
        meta: {
          instantData: {
            rows: [
              { remoteService: 'cart', Value: '5.5' },
              { remoteService: 'payment', Value: '3.2' },
              { remoteService: 'shipping', Value: '1.8' },
            ],
          },
        },
      };

      mockExecuteMetricRequest.mockResolvedValue(mockResponse);

      const { result, waitForNextUpdate } = renderHook(() =>
        useServiceDependenciesByFaultRate(defaultParams)
      );

      expect(result.current.isLoading).toBe(true);

      await waitForNextUpdate();

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toHaveLength(3);
      // Should be sorted by fault rate descending
      expect(result.current.data[0].remoteService).toBe('cart');
      expect(result.current.data[0].faultRate).toBe(5.5);
      expect(result.current.data[1].remoteService).toBe('payment');
      expect(result.current.data[1].faultRate).toBe(3.2);
    });

    it('should filter out 0% fault rates', async () => {
      const mockResponse = {
        meta: {
          instantData: {
            rows: [
              { remoteService: 'cart', Value: '5.5' },
              { remoteService: 'payment', Value: '0' },
              { remoteService: 'shipping', Value: '0' },
            ],
          },
        },
      };

      mockExecuteMetricRequest.mockResolvedValue(mockResponse);

      const { result, waitForNextUpdate } = renderHook(() =>
        useServiceDependenciesByFaultRate(defaultParams)
      );

      await waitForNextUpdate();

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data[0].remoteService).toBe('cart');
    });

    it('should respect limit parameter', async () => {
      const mockResponse = {
        meta: {
          instantData: {
            rows: [
              { remoteService: 'cart', Value: '5.5' },
              { remoteService: 'payment', Value: '4.2' },
              { remoteService: 'shipping', Value: '3.8' },
              { remoteService: 'inventory', Value: '2.1' },
              { remoteService: 'notification', Value: '1.5' },
            ],
          },
        },
      };

      mockExecuteMetricRequest.mockResolvedValue(mockResponse);

      const { result, waitForNextUpdate } = renderHook(() =>
        useServiceDependenciesByFaultRate({
          ...defaultParams,
          limit: 3,
        })
      );

      await waitForNextUpdate();

      expect(result.current.data).toHaveLength(3);
    });

    it('should default limit to 5 when not provided', async () => {
      const mockResponse = {
        meta: {
          instantData: {
            rows: Array.from({ length: 10 }, (_, i) => ({
              remoteService: `service-${i}`,
              Value: `${10 - i}`,
            })),
          },
        },
      };

      mockExecuteMetricRequest.mockResolvedValue(mockResponse);

      const { result, waitForNextUpdate } = renderHook(() =>
        useServiceDependenciesByFaultRate({
          ...defaultParams,
          limit: undefined,
        })
      );

      await waitForNextUpdate();

      expect(result.current.data).toHaveLength(5);
    });
  });

  describe('successful fetch - Prometheus format', () => {
    it('should handle traditional Prometheus response with instant query format', async () => {
      const mockResponse = {
        data: {
          result: [
            {
              metric: { remoteService: 'cart' },
              value: [1704067200, '5.5'],
            },
            {
              metric: { remoteService: 'payment' },
              value: [1704067200, '3.2'],
            },
          ],
        },
      };

      mockExecuteMetricRequest.mockResolvedValue(mockResponse);

      const { result, waitForNextUpdate } = renderHook(() =>
        useServiceDependenciesByFaultRate(defaultParams)
      );

      await waitForNextUpdate();

      expect(result.current.data).toHaveLength(2);
      expect(result.current.data[0].remoteService).toBe('cart');
      expect(result.current.data[0].faultRate).toBe(5.5);
    });

    it('should default to unknown for missing remoteService', async () => {
      const mockResponse = {
        data: {
          result: [
            {
              metric: {},
              value: [1704067200, '5.5'],
            },
          ],
        },
      };

      mockExecuteMetricRequest.mockResolvedValue(mockResponse);

      const { result, waitForNextUpdate } = renderHook(() =>
        useServiceDependenciesByFaultRate(defaultParams)
      );

      await waitForNextUpdate();

      expect(result.current.data[0].remoteService).toBe('unknown');
    });
  });

  describe('error handling', () => {
    it('should set error state on fetch failure', async () => {
      const mockError = new Error('PromQL query failed');
      mockExecuteMetricRequest.mockRejectedValue(mockError);

      const { result, waitForNextUpdate } = renderHook(() =>
        useServiceDependenciesByFaultRate(defaultParams)
      );

      await waitForNextUpdate();

      expect(result.current.error).toEqual(mockError);
      expect(result.current.data).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });

    it('should wrap non-Error throws', async () => {
      mockExecuteMetricRequest.mockRejectedValue('string error');

      const { result, waitForNextUpdate } = renderHook(() =>
        useServiceDependenciesByFaultRate(defaultParams)
      );

      await waitForNextUpdate();

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Unknown error');
    });
  });

  describe('refetch', () => {
    it('should refetch data when refetch is called', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        meta: { instantData: { rows: [] } },
      });

      const { result, waitForNextUpdate } = renderHook(() =>
        useServiceDependenciesByFaultRate(defaultParams)
      );

      await waitForNextUpdate();

      expect(mockExecuteMetricRequest).toHaveBeenCalledTimes(1);

      act(() => {
        result.current.refetch();
      });

      await waitForNextUpdate();

      expect(mockExecuteMetricRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe('parameter changes', () => {
    it('should refetch when serviceName changes', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        meta: { instantData: { rows: [] } },
      });

      const { waitForNextUpdate, rerender } = renderHook(
        ({ params }) => useServiceDependenciesByFaultRate(params),
        {
          initialProps: { params: defaultParams },
        }
      );

      await waitForNextUpdate();

      rerender({
        params: {
          ...defaultParams,
          serviceName: 'cart',
        },
      });

      await waitForNextUpdate();

      expect(mockExecuteMetricRequest).toHaveBeenCalledTimes(2);
    });

    it('should refetch when refreshTrigger changes', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        meta: { instantData: { rows: [] } },
      });

      const { waitForNextUpdate, rerender } = renderHook(
        ({ params }) => useServiceDependenciesByFaultRate(params),
        {
          initialProps: { params: { ...defaultParams, refreshTrigger: 0 } },
        }
      );

      await waitForNextUpdate();

      rerender({
        params: { ...defaultParams, refreshTrigger: 1 },
      });

      await waitForNextUpdate();

      expect(mockExecuteMetricRequest).toHaveBeenCalledTimes(2);
    });
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useTopDependenciesByFaultRate } from '../use_top_dependencies_by_fault_rate';

// Mock the PromQLSearchService
const mockExecuteMetricRequest = jest.fn();
jest.mock('../../../query_services/promql_search_service', () => ({
  PromQLSearchService: jest.fn().mockImplementation(() => ({
    executeMetricRequest: mockExecuteMetricRequest,
  })),
}));

// Mock time_utils
jest.mock('../../utils/time_utils', () => ({
  getTimeInSeconds: jest.fn((date) => Math.floor(date.getTime() / 1000)),
  calculateTimeRangeDuration: jest.fn(() => '1h'),
}));

// Mock the APM config context
const mockConfig = {
  prometheusDataSource: {
    id: 'prometheus-ds-123',
    name: 'prometheus-ds-123', // ConnectionId for PromQL queries
  },
};

jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: jest.fn(() => ({ config: mockConfig })),
}));

import { useApmConfig } from '../../../config/apm_config_context';

describe('useTopDependenciesByFaultRate', () => {
  const defaultParams = {
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-01T01:00:00Z'),
    limit: 5,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useApmConfig as jest.Mock).mockReturnValue({ config: mockConfig });
  });

  describe('initial state', () => {
    it('should return empty data when no prometheus connection', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: null });

      const { result } = renderHook(() => useTopDependenciesByFaultRate(defaultParams));

      expect(result.current.data).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });

    it('should return empty data when config missing prometheusDataSource', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: {} });

      const { result } = renderHook(() => useTopDependenciesByFaultRate(defaultParams));

      expect(result.current.data).toEqual([]);
    });
  });

  describe('successful fetch', () => {
    it('should fetch and transform dependency fault rate data', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        meta: {
          instantData: {
            rows: [
              {
                service: 'api-gateway',
                remoteService: 'database',
                environment: 'prod',
                Value: '0.15',
              },
              {
                service: 'api-gateway',
                remoteService: 'cache',
                environment: 'prod',
                Value: '0.05',
              },
            ],
          },
        },
      });

      const { result } = renderHook(() => useTopDependenciesByFaultRate(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toHaveLength(2);
      expect(result.current.data[0].source).toBe('api-gateway');
      expect(result.current.data[0].target).toBe('database');
      expect(result.current.data[0].faultRate).toBe(0.15);
    });

    it('should sort by fault rate descending', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        meta: {
          instantData: {
            rows: [
              { service: 'svc', remoteService: 'low', environment: 'prod', Value: '0.01' },
              { service: 'svc', remoteService: 'high', environment: 'prod', Value: '0.50' },
              { service: 'svc', remoteService: 'medium', environment: 'prod', Value: '0.10' },
            ],
          },
        },
      });

      const { result } = renderHook(() => useTopDependenciesByFaultRate(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data[0].target).toBe('high');
      expect(result.current.data[1].target).toBe('medium');
      expect(result.current.data[2].target).toBe('low');
    });

    it('should filter out zero fault rates', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        meta: {
          instantData: {
            rows: [
              { service: 'svc', remoteService: 'has-faults', environment: 'prod', Value: '0.10' },
              { service: 'svc', remoteService: 'no-faults', environment: 'prod', Value: '0' },
            ],
          },
        },
      });

      const { result } = renderHook(() => useTopDependenciesByFaultRate(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data[0].target).toBe('has-faults');
    });

    it('should respect limit parameter', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        meta: {
          instantData: {
            rows: Array.from({ length: 10 }, (_, i) => ({
              service: 'svc',
              remoteService: `dep${i}`,
              environment: 'prod',
              Value: String(0.5 - i * 0.04),
            })),
          },
        },
      });

      const { result } = renderHook(() =>
        useTopDependenciesByFaultRate({
          ...defaultParams,
          limit: 3,
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toHaveLength(3);
    });
  });

  describe('Prometheus response formats', () => {
    it('should handle standard Prometheus result format with instant query', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        data: {
          result: [
            {
              metric: { service: 'api-gateway', remoteService: 'database', environment: 'prod' },
              value: [1704067200, '0.25'],
            },
          ],
        },
      });

      const { result } = renderHook(() => useTopDependenciesByFaultRate(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data[0].source).toBe('api-gateway');
      expect(result.current.data[0].target).toBe('database');
      expect(result.current.data[0].faultRate).toBe(0.25);
    });
  });

  describe('error handling', () => {
    it('should set error state on fetch failure', async () => {
      const mockError = new Error('Query failed');
      mockExecuteMetricRequest.mockRejectedValue(mockError);

      const { result } = renderHook(() => useTopDependenciesByFaultRate(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.data).toEqual([]);
    });
  });

  describe('refetch', () => {
    it('should refetch when refetch is called', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        meta: { instantData: { rows: [] } },
      });

      const { result } = renderHook(() => useTopDependenciesByFaultRate(defaultParams));

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
    it('should refetch when time range changes', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        meta: { instantData: { rows: [] } },
      });

      const { result, rerender } = renderHook(
        ({ params }) => useTopDependenciesByFaultRate(params),
        {
          initialProps: { params: defaultParams },
        }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      rerender({
        params: {
          ...defaultParams,
          startTime: new Date('2024-01-02T00:00:00Z'),
        },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockExecuteMetricRequest).toHaveBeenCalledTimes(2);
    });

    it('should refetch when refreshTrigger changes', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        meta: { instantData: { rows: [] } },
      });

      const { result, rerender } = renderHook(
        ({ params }) => useTopDependenciesByFaultRate(params),
        {
          initialProps: { params: { ...defaultParams, refreshTrigger: 0 } },
        }
      );

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
});

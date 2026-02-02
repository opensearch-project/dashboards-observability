/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react-hooks';
import { useTopServicesByFaultRate } from '../use_top_services_by_fault_rate';

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

describe('useTopServicesByFaultRate', () => {
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

      const { result } = renderHook(() => useTopServicesByFaultRate(defaultParams));

      expect(result.current.data).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });

    it('should return empty data when config missing prometheusDataSource', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: {} });

      const { result } = renderHook(() => useTopServicesByFaultRate(defaultParams));

      expect(result.current.data).toEqual([]);
    });
  });

  describe('successful fetch', () => {
    it('should fetch and transform fault rate data', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        meta: {
          instantData: {
            rows: [
              { service: 'api-gateway', environment: 'prod', Value: '0.15' },
              { service: 'user-service', environment: 'prod', Value: '0.05' },
            ],
          },
        },
      });

      const { result, waitForNextUpdate } = renderHook(() =>
        useTopServicesByFaultRate(defaultParams)
      );

      await waitForNextUpdate();

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toHaveLength(2);
      expect(result.current.data[0].serviceName).toBe('api-gateway');
      expect(result.current.data[0].faultRate).toBe(0.15);
    });

    it('should sort by fault rate descending', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        meta: {
          instantData: {
            rows: [
              { service: 'low-fault', environment: 'prod', Value: '0.01' },
              { service: 'high-fault', environment: 'prod', Value: '0.50' },
              { service: 'medium-fault', environment: 'prod', Value: '0.10' },
            ],
          },
        },
      });

      const { result, waitForNextUpdate } = renderHook(() =>
        useTopServicesByFaultRate(defaultParams)
      );

      await waitForNextUpdate();

      expect(result.current.data[0].serviceName).toBe('high-fault');
      expect(result.current.data[1].serviceName).toBe('medium-fault');
      expect(result.current.data[2].serviceName).toBe('low-fault');
    });

    it('should filter out zero fault rates', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        meta: {
          instantData: {
            rows: [
              { service: 'has-faults', environment: 'prod', Value: '0.10' },
              { service: 'no-faults', environment: 'prod', Value: '0' },
            ],
          },
        },
      });

      const { result, waitForNextUpdate } = renderHook(() =>
        useTopServicesByFaultRate(defaultParams)
      );

      await waitForNextUpdate();

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data[0].serviceName).toBe('has-faults');
    });

    it('should respect limit parameter', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        meta: {
          instantData: {
            rows: [
              { service: 'svc1', environment: 'prod', Value: '0.50' },
              { service: 'svc2', environment: 'prod', Value: '0.40' },
              { service: 'svc3', environment: 'prod', Value: '0.30' },
              { service: 'svc4', environment: 'prod', Value: '0.20' },
              { service: 'svc5', environment: 'prod', Value: '0.10' },
              { service: 'svc6', environment: 'prod', Value: '0.05' },
            ],
          },
        },
      });

      const { result, waitForNextUpdate } = renderHook(() =>
        useTopServicesByFaultRate({
          ...defaultParams,
          limit: 3,
        })
      );

      await waitForNextUpdate();

      expect(result.current.data).toHaveLength(3);
    });

    it('should default limit to 5', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        meta: {
          instantData: {
            rows: Array.from({ length: 10 }, (_, i) => ({
              service: `svc${i}`,
              environment: 'prod',
              Value: String(0.5 - i * 0.04),
            })),
          },
        },
      });

      const { result, waitForNextUpdate } = renderHook(() =>
        useTopServicesByFaultRate({
          startTime: defaultParams.startTime,
          endTime: defaultParams.endTime,
          // No limit specified
        })
      );

      await waitForNextUpdate();

      expect(result.current.data.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Prometheus response formats', () => {
    it('should handle standard Prometheus result format with instant query', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        data: {
          result: [
            {
              metric: { service: 'api-gateway', service_name: 'api-gateway' },
              value: [1704067200, '0.25'],
            },
          ],
        },
      });

      const { result, waitForNextUpdate } = renderHook(() =>
        useTopServicesByFaultRate(defaultParams)
      );

      await waitForNextUpdate();

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data[0].faultRate).toBe(0.25);
    });

    it('should fallback to service_name when service not present', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        data: {
          result: [
            {
              metric: { service_name: 'my-service' },
              value: [1704067200, '0.15'],
            },
          ],
        },
      });

      const { result, waitForNextUpdate } = renderHook(() =>
        useTopServicesByFaultRate(defaultParams)
      );

      await waitForNextUpdate();

      expect(result.current.data[0].serviceName).toBe('my-service');
    });
  });

  describe('error handling', () => {
    it('should set error state on fetch failure', async () => {
      const mockError = new Error('Query failed');
      mockExecuteMetricRequest.mockRejectedValue(mockError);

      const { result, waitForNextUpdate } = renderHook(() =>
        useTopServicesByFaultRate(defaultParams)
      );

      await waitForNextUpdate();

      expect(result.current.error).toEqual(mockError);
      expect(result.current.data).toEqual([]);
    });
  });

  describe('refetch', () => {
    it('should refetch when refetch is called', async () => {
      mockExecuteMetricRequest.mockResolvedValue({
        meta: { instantData: { rows: [] } },
      });

      const { result, waitForNextUpdate } = renderHook(() =>
        useTopServicesByFaultRate(defaultParams)
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
});

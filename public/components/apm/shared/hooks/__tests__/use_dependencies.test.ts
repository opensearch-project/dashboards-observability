/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useDependencies } from '../use_dependencies';

// Mock the PPLSearchService
const mockListServiceDependencies = jest.fn();
jest.mock('../../../query_services/ppl_search_service', () => ({
  PPLSearchService: jest.fn().mockImplementation(() => ({
    listServiceDependencies: mockListServiceDependencies,
  })),
}));

// Mock the APM config context
const mockConfig = {
  serviceMapDataset: {
    id: 'dataset-123',
    title: 'otel-apm-service-map',
    datasourceId: 'ds-1',
  },
};

jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: jest.fn(() => ({ config: mockConfig })),
}));

import { useApmConfig } from '../../../config/apm_config_context';

describe('useDependencies', () => {
  const defaultParams = {
    serviceName: 'frontend',
    environment: 'production',
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-01T01:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useApmConfig as jest.Mock).mockReturnValue({ config: mockConfig });
  });

  describe('initial state', () => {
    it('should return empty data and loading false when no config', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: null });

      const { result } = renderHook(() => useDependencies(defaultParams));

      expect(result.current.data).toEqual([]);
      expect(result.current.groupedData).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should return empty data when config has no serviceMapDataset', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: {} });

      const { result } = renderHook(() => useDependencies(defaultParams));

      expect(result.current.data).toEqual([]);
      expect(result.current.groupedData).toEqual([]);
    });
  });

  describe('successful fetch', () => {
    it('should fetch and transform dependencies data', async () => {
      const mockResponse = {
        Dependencies: [
          {
            DependencyName: 'cart',
            Environment: 'prod',
            ServiceOperation: 'checkout',
            RemoteOperation: 'AddItem',
            CallCount: '100',
          },
          {
            DependencyName: 'payment',
            Environment: 'prod',
            ServiceOperation: 'checkout',
            RemoteOperation: 'ProcessPayment',
            CallCount: '50',
          },
        ],
      };

      mockListServiceDependencies.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useDependencies(defaultParams));

      // Initial loading state
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toHaveLength(2);
      expect(result.current.data[0].serviceName).toBe('cart');
      expect(result.current.data[0].environment).toBe('prod');
      expect(result.current.data[0].serviceOperation).toBe('checkout');
      expect(result.current.data[0].remoteOperation).toBe('AddItem');
      expect(result.current.data[0].callCount).toBe(100);
    });

    it('should handle legacy response format', async () => {
      const mockResponse = {
        Dependencies: [
          {
            serviceName: 'legacy-service',
            environment: 'prod',
            serviceOperation: 'op1',
            remoteOperation: 'remoteOp',
            callCount: '25',
          },
        ],
      };

      mockListServiceDependencies.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useDependencies(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data[0].serviceName).toBe('legacy-service');
    });

    it('should default to unknown for missing values', async () => {
      const mockResponse = {
        Dependencies: [{}],
      };

      mockListServiceDependencies.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useDependencies(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data[0].serviceName).toBe('unknown');
      expect(result.current.data[0].environment).toBe('generic:default');
      expect(result.current.data[0].serviceOperation).toBe('unknown');
      expect(result.current.data[0].remoteOperation).toBe('unknown');
      expect(result.current.data[0].callCount).toBe(0);
    });

    it('should handle empty Dependencies array', async () => {
      const mockResponse = {
        Dependencies: [],
      };

      mockListServiceDependencies.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useDependencies(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
      expect(result.current.groupedData).toEqual([]);
    });

    it('should handle missing Dependencies field', async () => {
      const mockResponse = {};

      mockListServiceDependencies.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useDependencies(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
      expect(result.current.groupedData).toEqual([]);
    });
  });

  describe('grouping logic', () => {
    it('should group dependencies by (serviceName + remoteOperation)', async () => {
      const mockResponse = {
        Dependencies: [
          {
            DependencyName: 'cart',
            Environment: 'prod',
            ServiceOperation: 'checkout',
            RemoteOperation: 'AddItem',
            CallCount: '100',
          },
          {
            DependencyName: 'cart',
            Environment: 'prod',
            ServiceOperation: 'orders',
            RemoteOperation: 'AddItem',
            CallCount: '50',
          },
        ],
      };

      mockListServiceDependencies.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useDependencies(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Raw data should have 2 entries
      expect(result.current.data).toHaveLength(2);

      // Grouped data should have 1 entry (same serviceName + remoteOperation)
      expect(result.current.groupedData).toHaveLength(1);
      expect(result.current.groupedData[0].serviceName).toBe('cart');
      expect(result.current.groupedData[0].remoteOperation).toBe('AddItem');
      expect(result.current.groupedData[0].callCount).toBe(150); // 100 + 50
      expect(result.current.groupedData[0].serviceOperations).toEqual(['checkout', 'orders']);
    });

    it('should not duplicate serviceOperations in grouped data', async () => {
      const mockResponse = {
        Dependencies: [
          {
            DependencyName: 'cart',
            Environment: 'prod',
            ServiceOperation: 'checkout',
            RemoteOperation: 'AddItem',
            CallCount: '100',
          },
          {
            DependencyName: 'cart',
            Environment: 'prod',
            ServiceOperation: 'checkout', // Same operation
            RemoteOperation: 'AddItem',
            CallCount: '50',
          },
        ],
      };

      mockListServiceDependencies.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useDependencies(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // serviceOperations should only contain unique values
      expect(result.current.groupedData[0].serviceOperations).toEqual(['checkout']);
    });

    it('should create separate groups for different remoteOperations', async () => {
      const mockResponse = {
        Dependencies: [
          {
            DependencyName: 'cart',
            Environment: 'prod',
            ServiceOperation: 'checkout',
            RemoteOperation: 'AddItem',
            CallCount: '100',
          },
          {
            DependencyName: 'cart',
            Environment: 'prod',
            ServiceOperation: 'checkout',
            RemoteOperation: 'RemoveItem',
            CallCount: '50',
          },
        ],
      };

      mockListServiceDependencies.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useDependencies(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should have 2 groups (different remoteOperation)
      expect(result.current.groupedData).toHaveLength(2);
    });

    it('should initialize metrics fields to undefined in grouped data', async () => {
      const mockResponse = {
        Dependencies: [
          {
            DependencyName: 'cart',
            Environment: 'prod',
            ServiceOperation: 'checkout',
            RemoteOperation: 'AddItem',
            CallCount: '100',
          },
        ],
      };

      mockListServiceDependencies.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useDependencies(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Metrics are initialized to undefined (populated later by useDependencyMetrics)
      expect(result.current.groupedData[0].p50Duration).toBeUndefined();
      expect(result.current.groupedData[0].p90Duration).toBeUndefined();
      expect(result.current.groupedData[0].p99Duration).toBeUndefined();
      expect(result.current.groupedData[0].faultRate).toBeUndefined();
      expect(result.current.groupedData[0].errorRate).toBeUndefined();
      expect(result.current.groupedData[0].availability).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should set error state on fetch failure', async () => {
      const mockError = new Error('Network error');
      mockListServiceDependencies.mockRejectedValue(mockError);

      const { result } = renderHook(() => useDependencies(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.data).toEqual([]);
      expect(result.current.groupedData).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });

    it('should wrap non-Error throws', async () => {
      mockListServiceDependencies.mockRejectedValue('string error');

      const { result } = renderHook(() => useDependencies(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Unknown error');
    });
  });

  describe('refetch', () => {
    it('should refetch data when refetch is called', async () => {
      mockListServiceDependencies.mockResolvedValue({
        Dependencies: [],
      });

      const { result } = renderHook(() => useDependencies(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockListServiceDependencies).toHaveBeenCalledTimes(1);

      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockListServiceDependencies).toHaveBeenCalledTimes(2);
    });
  });

  describe('parameter changes', () => {
    it('should refetch when time range changes', async () => {
      mockListServiceDependencies.mockResolvedValue({
        Dependencies: [],
      });

      const { result, rerender } = renderHook(({ params }) => useDependencies(params), {
        initialProps: { params: defaultParams },
      });

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

      expect(mockListServiceDependencies).toHaveBeenCalledTimes(2);
    });

    it('should refetch when serviceName changes', async () => {
      mockListServiceDependencies.mockResolvedValue({
        Dependencies: [],
      });

      const { result, rerender } = renderHook(({ params }) => useDependencies(params), {
        initialProps: { params: defaultParams },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      rerender({
        params: {
          ...defaultParams,
          serviceName: 'cart',
        },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockListServiceDependencies).toHaveBeenCalledTimes(2);
    });

    it('should refetch when refreshTrigger changes', async () => {
      mockListServiceDependencies.mockResolvedValue({
        Dependencies: [],
      });

      const { result, rerender } = renderHook(({ params }) => useDependencies(params), {
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

      expect(mockListServiceDependencies).toHaveBeenCalledTimes(2);
    });
  });

  describe('dataset configuration', () => {
    it('should build correct dataset config with datasource', async () => {
      mockListServiceDependencies.mockResolvedValue({
        Dependencies: [],
      });

      const { result } = renderHook(() => useDependencies(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const callArgs = mockListServiceDependencies.mock.calls[0][0];
      expect(callArgs.dataset.id).toBe('dataset-123');
      expect(callArgs.dataset.title).toBe('otel-apm-service-map');
      expect(callArgs.dataset.dataSource.id).toBe('ds-1');
    });

    it('should omit dataSource when datasourceId not provided', async () => {
      (useApmConfig as jest.Mock).mockReturnValue({
        config: {
          serviceMapDataset: {
            id: 'dataset-123',
            title: 'otel-apm-service-map',
            // No datasourceId
          },
        },
      });

      mockListServiceDependencies.mockResolvedValue({
        Dependencies: [],
      });

      const { result } = renderHook(() => useDependencies(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const callArgs = mockListServiceDependencies.mock.calls[0][0];
      expect(callArgs.dataset.dataSource).toBeUndefined();
    });

    it('should pass correct key attributes', async () => {
      mockListServiceDependencies.mockResolvedValue({
        Dependencies: [],
      });

      const { result } = renderHook(() => useDependencies(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const callArgs = mockListServiceDependencies.mock.calls[0][0];
      expect(callArgs.keyAttributes.Name).toBe('frontend');
      expect(callArgs.keyAttributes.Environment).toBe('production');
    });

    it('should default environment to unknown when not provided', async () => {
      mockListServiceDependencies.mockResolvedValue({
        Dependencies: [],
      });

      const { result } = renderHook(() =>
        useDependencies({
          ...defaultParams,
          environment: undefined,
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const callArgs = mockListServiceDependencies.mock.calls[0][0];
      expect(callArgs.keyAttributes.Environment).toBe('unknown');
    });
  });
});

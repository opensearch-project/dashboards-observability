/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react-hooks';
import { useOperations } from '../use_operations';

// Mock the PPLSearchService
const mockListServiceOperations = jest.fn();
jest.mock('../../../query_services/ppl_search_service', () => ({
  PPLSearchService: jest.fn().mockImplementation(() => ({
    listServiceOperations: mockListServiceOperations,
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

describe('useOperations', () => {
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

      const { result } = renderHook(() => useOperations(defaultParams));

      expect(result.current.data).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should return empty data when config has no serviceMapDataset', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: {} });

      const { result } = renderHook(() => useOperations(defaultParams));

      expect(result.current.data).toEqual([]);
    });
  });

  describe('successful fetch', () => {
    it('should fetch and transform operations data', async () => {
      const mockResponse = {
        Operations: [
          { Name: 'GET /api/users', Count: '100', DependencyCount: 3 },
          { Name: 'POST /api/orders', Count: '50', DependencyCount: 2 },
        ],
      };

      mockListServiceOperations.mockResolvedValue(mockResponse);

      const { result, waitForNextUpdate } = renderHook(() => useOperations(defaultParams));

      // Initial loading state
      expect(result.current.isLoading).toBe(true);

      await waitForNextUpdate();

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toHaveLength(2);
      expect(result.current.data[0].operationName).toBe('GET /api/users');
      expect(result.current.data[0].requestCount).toBe(100);
      expect(result.current.data[0].dependencyCount).toBe(3);
      expect(result.current.data[1].operationName).toBe('POST /api/orders');
      expect(result.current.data[1].requestCount).toBe(50);
      expect(result.current.data[1].dependencyCount).toBe(2);
    });

    it('should default to unknown for missing operation name', async () => {
      const mockResponse = {
        Operations: [{}],
      };

      mockListServiceOperations.mockResolvedValue(mockResponse);

      const { result, waitForNextUpdate } = renderHook(() => useOperations(defaultParams));

      await waitForNextUpdate();

      expect(result.current.data[0].operationName).toBe('unknown');
      expect(result.current.data[0].requestCount).toBe(0);
    });

    it('should handle empty Operations array', async () => {
      const mockResponse = {
        Operations: [],
      };

      mockListServiceOperations.mockResolvedValue(mockResponse);

      const { result, waitForNextUpdate } = renderHook(() => useOperations(defaultParams));

      await waitForNextUpdate();

      expect(result.current.data).toEqual([]);
    });

    it('should handle missing Operations field', async () => {
      const mockResponse = {};

      mockListServiceOperations.mockResolvedValue(mockResponse);

      const { result, waitForNextUpdate } = renderHook(() => useOperations(defaultParams));

      await waitForNextUpdate();

      expect(result.current.data).toEqual([]);
    });

    it('should initialize metrics fields to default values', async () => {
      const mockResponse = {
        Operations: [{ Name: 'GET /api/users', Count: '100' }],
      };

      mockListServiceOperations.mockResolvedValue(mockResponse);

      const { result, waitForNextUpdate } = renderHook(() => useOperations(defaultParams));

      await waitForNextUpdate();

      // Metrics are initialized to default values (populated later by useOperationMetrics)
      expect(result.current.data[0].errorRate).toBe(0);
      expect(result.current.data[0].faultRate).toBe(0);
      expect(result.current.data[0].avgDuration).toBe(0);
      expect(result.current.data[0].p50Duration).toBe(0);
      expect(result.current.data[0].p90Duration).toBe(0);
      expect(result.current.data[0].p99Duration).toBe(0);
      expect(result.current.data[0].availability).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should set error state on fetch failure', async () => {
      const mockError = new Error('Network error');
      mockListServiceOperations.mockRejectedValue(mockError);

      const { result, waitForNextUpdate } = renderHook(() => useOperations(defaultParams));

      await waitForNextUpdate();

      expect(result.current.error).toEqual(mockError);
      expect(result.current.data).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });

    it('should wrap non-Error throws', async () => {
      mockListServiceOperations.mockRejectedValue('string error');

      const { result, waitForNextUpdate } = renderHook(() => useOperations(defaultParams));

      await waitForNextUpdate();

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Unknown error');
    });
  });

  describe('refetch', () => {
    it('should refetch data when refetch is called', async () => {
      mockListServiceOperations.mockResolvedValue({
        Operations: [],
      });

      const { result, waitForNextUpdate } = renderHook(() => useOperations(defaultParams));

      await waitForNextUpdate();

      expect(mockListServiceOperations).toHaveBeenCalledTimes(1);

      act(() => {
        result.current.refetch();
      });

      await waitForNextUpdate();

      expect(mockListServiceOperations).toHaveBeenCalledTimes(2);
    });
  });

  describe('parameter changes', () => {
    it('should refetch when time range changes', async () => {
      mockListServiceOperations.mockResolvedValue({
        Operations: [],
      });

      const { waitForNextUpdate, rerender } = renderHook(({ params }) => useOperations(params), {
        initialProps: { params: defaultParams },
      });

      await waitForNextUpdate();

      rerender({
        params: {
          ...defaultParams,
          startTime: new Date('2024-01-02T00:00:00Z'),
        },
      });

      await waitForNextUpdate();

      expect(mockListServiceOperations).toHaveBeenCalledTimes(2);
    });

    it('should refetch when serviceName changes', async () => {
      mockListServiceOperations.mockResolvedValue({
        Operations: [],
      });

      const { waitForNextUpdate, rerender } = renderHook(({ params }) => useOperations(params), {
        initialProps: { params: defaultParams },
      });

      await waitForNextUpdate();

      rerender({
        params: {
          ...defaultParams,
          serviceName: 'cart',
        },
      });

      await waitForNextUpdate();

      expect(mockListServiceOperations).toHaveBeenCalledTimes(2);
    });

    it('should refetch when refreshTrigger changes', async () => {
      mockListServiceOperations.mockResolvedValue({
        Operations: [],
      });

      const { waitForNextUpdate, rerender } = renderHook(({ params }) => useOperations(params), {
        initialProps: { params: { ...defaultParams, refreshTrigger: 0 } },
      });

      await waitForNextUpdate();

      rerender({
        params: { ...defaultParams, refreshTrigger: 1 },
      });

      await waitForNextUpdate();

      expect(mockListServiceOperations).toHaveBeenCalledTimes(2);
    });
  });

  describe('dataset configuration', () => {
    it('should build correct dataset config with datasource', async () => {
      mockListServiceOperations.mockResolvedValue({
        Operations: [],
      });

      const { waitForNextUpdate } = renderHook(() => useOperations(defaultParams));

      await waitForNextUpdate();

      const callArgs = mockListServiceOperations.mock.calls[0][0];
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

      mockListServiceOperations.mockResolvedValue({
        Operations: [],
      });

      const { waitForNextUpdate } = renderHook(() => useOperations(defaultParams));

      await waitForNextUpdate();

      const callArgs = mockListServiceOperations.mock.calls[0][0];
      expect(callArgs.dataset.dataSource).toBeUndefined();
    });

    it('should pass correct key attributes', async () => {
      mockListServiceOperations.mockResolvedValue({
        Operations: [],
      });

      const { waitForNextUpdate } = renderHook(() => useOperations(defaultParams));

      await waitForNextUpdate();

      const callArgs = mockListServiceOperations.mock.calls[0][0];
      expect(callArgs.keyAttributes.Name).toBe('frontend');
      expect(callArgs.keyAttributes.Environment).toBe('production');
    });

    it('should default environment to unknown when not provided', async () => {
      mockListServiceOperations.mockResolvedValue({
        Operations: [],
      });

      const { waitForNextUpdate } = renderHook(() =>
        useOperations({
          ...defaultParams,
          environment: undefined,
        })
      );

      await waitForNextUpdate();

      const callArgs = mockListServiceOperations.mock.calls[0][0];
      expect(callArgs.keyAttributes.Environment).toBe('unknown');
    });
  });
});

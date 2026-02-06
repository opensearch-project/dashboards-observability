/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useServices } from '../use_services';

// Mock the PPLSearchService
const mockListServices = jest.fn();
jest.mock('../../../query_services/ppl_search_service', () => ({
  PPLSearchService: jest.fn().mockImplementation(() => ({
    listServices: mockListServices,
  })),
}));

// Mock the APM config context
const mockConfig = {
  serviceMapDataset: {
    id: 'dataset-123',
    title: 'service-map-index',
    datasourceId: 'ds-1',
  },
};

jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: jest.fn(() => ({ config: mockConfig })),
}));

import { useApmConfig } from '../../../config/apm_config_context';

describe('useServices', () => {
  const defaultParams = {
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

      const { result } = renderHook(() => useServices(defaultParams));

      expect(result.current.data).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should return empty data when config has no serviceMapDataset', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: {} });

      const { result } = renderHook(() => useServices(defaultParams));

      expect(result.current.data).toEqual([]);
    });
  });

  describe('successful fetch', () => {
    it('should fetch and transform services data', async () => {
      const mockResponse = {
        ServiceSummaries: [
          {
            KeyAttributes: { Name: 'api-gateway', Environment: 'prod' },
            GroupByAttributes: { team: 'platform' },
          },
          {
            KeyAttributes: { Name: 'user-service', Environment: 'prod' },
            GroupByAttributes: { team: 'users' },
          },
        ],
        AvailableGroupByAttributes: { team: ['platform', 'users'] },
      };

      mockListServices.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useServices(defaultParams));

      // Initial loading state
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toHaveLength(2);
      expect(result.current.data[0].serviceName).toBe('api-gateway');
      expect(result.current.data[0].environment).toBe('prod');
      expect(result.current.data[0].groupByAttributes).toEqual({ team: 'platform' });
      expect(result.current.availableGroupByAttributes).toEqual({ team: ['platform', 'users'] });
    });

    it('should handle legacy response format', async () => {
      const mockResponse = {
        ServiceSummaries: [
          {
            serviceName: 'legacy-service',
            environment: 'prod',
          },
        ],
        AvailableGroupByAttributes: {},
      };

      mockListServices.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useServices(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data[0].serviceName).toBe('legacy-service');
    });

    it('should default to unknown for missing values', async () => {
      const mockResponse = {
        ServiceSummaries: [{}],
        AvailableGroupByAttributes: {},
      };

      mockListServices.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useServices(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data[0].serviceName).toBe('unknown');
      expect(result.current.data[0].environment).toBe('unknown');
    });
  });

  describe('error handling', () => {
    it('should set error state on fetch failure', async () => {
      const mockError = new Error('Network error');
      mockListServices.mockRejectedValue(mockError);

      const { result } = renderHook(() => useServices(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.data).toEqual([]);
    });

    it('should wrap non-Error throws', async () => {
      mockListServices.mockRejectedValue('string error');

      const { result } = renderHook(() => useServices(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Unknown error');
    });
  });

  describe('refetch', () => {
    it('should refetch data when refetch is called', async () => {
      mockListServices.mockResolvedValue({
        ServiceSummaries: [],
        AvailableGroupByAttributes: {},
      });

      const { result } = renderHook(() => useServices(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockListServices).toHaveBeenCalledTimes(1);

      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockListServices).toHaveBeenCalledTimes(2);
    });
  });

  describe('parameter changes', () => {
    it('should refetch when time range changes', async () => {
      mockListServices.mockResolvedValue({
        ServiceSummaries: [],
        AvailableGroupByAttributes: {},
      });

      const { result, rerender } = renderHook(({ params }) => useServices(params), {
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

      expect(mockListServices).toHaveBeenCalledTimes(2);
    });

    it('should refetch when refreshTrigger changes', async () => {
      mockListServices.mockResolvedValue({
        ServiceSummaries: [],
        AvailableGroupByAttributes: {},
      });

      const { result, rerender } = renderHook(({ params }) => useServices(params), {
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

      expect(mockListServices).toHaveBeenCalledTimes(2);
    });
  });

  describe('dataset configuration', () => {
    it('should build correct dataset config with datasource', async () => {
      mockListServices.mockResolvedValue({
        ServiceSummaries: [],
        AvailableGroupByAttributes: {},
      });

      const { result } = renderHook(() => useServices(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const callArgs = mockListServices.mock.calls[0][0];
      expect(callArgs.dataset.id).toBe('dataset-123');
      expect(callArgs.dataset.title).toBe('service-map-index');
      expect(callArgs.dataset.dataSource.id).toBe('ds-1');
    });

    it('should omit dataSource when datasourceId not provided', async () => {
      (useApmConfig as jest.Mock).mockReturnValue({
        config: {
          serviceMapDataset: {
            id: 'dataset-123',
            title: 'service-map-index',
            // No datasourceId
          },
        },
      });

      mockListServices.mockResolvedValue({
        ServiceSummaries: [],
        AvailableGroupByAttributes: {},
      });

      const { result } = renderHook(() => useServices(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const callArgs = mockListServices.mock.calls[0][0];
      expect(callArgs.dataset.dataSource).toBeUndefined();
    });
  });
});

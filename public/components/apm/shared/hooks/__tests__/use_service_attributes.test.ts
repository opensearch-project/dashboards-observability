/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useServiceAttributes } from '../use_service_attributes';

// Mock the PPLSearchService
const mockExecuteQuery = jest.fn();
jest.mock('../../../query_services/ppl_search_service', () => ({
  PPLSearchService: jest.fn().mockImplementation(() => ({
    executeQuery: mockExecuteQuery,
  })),
}));

// Mock the ppl_queries
jest.mock('../../../query_services/query_requests/ppl_queries', () => ({
  getQueryServiceAttributes: jest.fn(() => 'mock_ppl_query'),
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

describe('useServiceAttributes', () => {
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
    it('should return empty attributes when no config', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: null });

      const { result } = renderHook(() => useServiceAttributes(defaultParams));

      expect(result.current.attributes).toEqual({});
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should return empty attributes when no serviceMapDataset', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: {} });

      const { result } = renderHook(() => useServiceAttributes(defaultParams));

      expect(result.current.attributes).toEqual({});
    });

    it('should return empty attributes when serviceName is missing', () => {
      const { result } = renderHook(() =>
        useServiceAttributes({
          ...defaultParams,
          serviceName: '',
        })
      );

      expect(result.current.attributes).toEqual({});
    });

    it('should return empty attributes when environment is missing', () => {
      const { result } = renderHook(() =>
        useServiceAttributes({
          ...defaultParams,
          environment: '',
        })
      );

      expect(result.current.attributes).toEqual({});
    });
  });

  describe('successful fetch', () => {
    it('should fetch and flatten groupByAttributes', async () => {
      const mockResponse = {
        jsonData: [
          {
            'sourceNode.groupByAttributes': {
              telemetry: {
                sdk: {
                  language: 'python',
                  version: '1.0.0',
                },
              },
              deployment: {
                environment: 'prod',
              },
            },
          },
        ],
      };

      mockExecuteQuery.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useServiceAttributes(defaultParams));

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.attributes).toEqual({
        'telemetry.sdk.language': 'python',
        'telemetry.sdk.version': '1.0.0',
        'deployment.environment': 'prod',
      });
    });

    it('should handle JSON string groupByAttributes', async () => {
      const mockResponse = {
        jsonData: [
          {
            'sourceNode.groupByAttributes': JSON.stringify({
              telemetry: {
                sdk: {
                  language: 'java',
                },
              },
            }),
          },
        ],
      };

      mockExecuteQuery.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useServiceAttributes(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.attributes).toEqual({
        'telemetry.sdk.language': 'java',
      });
    });

    it('should handle flat attributes without nesting', async () => {
      const mockResponse = {
        jsonData: [
          {
            'sourceNode.groupByAttributes': {
              language: 'python',
              version: '1.0',
            },
          },
        ],
      };

      mockExecuteQuery.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useServiceAttributes(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.attributes).toEqual({
        language: 'python',
        version: '1.0',
      });
    });

    it('should convert non-string values to strings', async () => {
      const mockResponse = {
        jsonData: [
          {
            'sourceNode.groupByAttributes': {
              count: 42,
              enabled: true,
            },
          },
        ],
      };

      mockExecuteQuery.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useServiceAttributes(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.attributes).toEqual({
        count: '42',
        enabled: 'true',
      });
    });

    it('should handle empty jsonData response', async () => {
      mockExecuteQuery.mockResolvedValue({ jsonData: [] });

      const { result } = renderHook(() => useServiceAttributes(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.attributes).toEqual({});
    });

    it('should handle missing groupByAttributes field', async () => {
      mockExecuteQuery.mockResolvedValue({
        jsonData: [{ someOtherField: 'value' }],
      });

      const { result } = renderHook(() => useServiceAttributes(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.attributes).toEqual({});
    });

    it('should handle invalid JSON string gracefully', async () => {
      const mockResponse = {
        jsonData: [
          {
            'sourceNode.groupByAttributes': 'invalid json {',
          },
        ],
      };

      mockExecuteQuery.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useServiceAttributes(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.attributes).toEqual({});
    });
  });

  describe('error handling', () => {
    it('should set error state on fetch failure', async () => {
      const mockError = new Error('PPL query failed');
      mockExecuteQuery.mockRejectedValue(mockError);

      const { result } = renderHook(() => useServiceAttributes(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.attributes).toEqual({});
      expect(result.current.isLoading).toBe(false);
    });

    it('should wrap non-Error throws', async () => {
      mockExecuteQuery.mockRejectedValue('string error');

      const { result } = renderHook(() => useServiceAttributes(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Unknown error');
    });
  });

  describe('parameter changes', () => {
    it('should refetch when serviceName changes', async () => {
      mockExecuteQuery.mockResolvedValue({ jsonData: [] });

      const { result, rerender } = renderHook(({ params }) => useServiceAttributes(params), {
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

      expect(mockExecuteQuery).toHaveBeenCalledTimes(2);
    });

    it('should refetch when environment changes', async () => {
      mockExecuteQuery.mockResolvedValue({ jsonData: [] });

      const { result, rerender } = renderHook(({ params }) => useServiceAttributes(params), {
        initialProps: { params: defaultParams },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      rerender({
        params: {
          ...defaultParams,
          environment: 'staging',
        },
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockExecuteQuery).toHaveBeenCalledTimes(2);
    });

    it('should refetch when refreshTrigger changes', async () => {
      mockExecuteQuery.mockResolvedValue({ jsonData: [] });

      const { result, rerender } = renderHook(({ params }) => useServiceAttributes(params), {
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

      expect(mockExecuteQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('dataset configuration', () => {
    it('should build correct dataset config with datasource', async () => {
      mockExecuteQuery.mockResolvedValue({ jsonData: [] });

      const { result } = renderHook(() => useServiceAttributes(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const callArgs = mockExecuteQuery.mock.calls[0];
      const dataset = callArgs[1];
      expect(dataset.id).toBe('dataset-123');
      expect(dataset.title).toBe('otel-apm-service-map');
      expect(dataset.dataSource.id).toBe('ds-1');
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

      mockExecuteQuery.mockResolvedValue({ jsonData: [] });

      const { result } = renderHook(() => useServiceAttributes(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const callArgs = mockExecuteQuery.mock.calls[0];
      const dataset = callArgs[1];
      expect(dataset.dataSource).toBeUndefined();
    });
  });
});

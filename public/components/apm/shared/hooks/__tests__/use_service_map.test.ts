/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useServiceMap } from '../use_service_map';

// Mock the PPLSearchService
const mockGetServiceMap = jest.fn();
jest.mock('../../../query_services/ppl_search_service', () => ({
  PPLSearchService: jest.fn().mockImplementation(() => ({
    getServiceMap: mockGetServiceMap,
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

describe('useServiceMap', () => {
  const defaultParams = {
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-01T01:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useApmConfig as jest.Mock).mockReturnValue({ config: mockConfig });
  });

  describe('initial state', () => {
    it('should return empty nodes/edges and loading false when no config', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: null });

      const { result } = renderHook(() => useServiceMap(defaultParams));

      expect(result.current.nodes).toEqual([]);
      expect(result.current.edges).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should return empty data when config has no serviceMapDataset', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: {} });

      const { result } = renderHook(() => useServiceMap(defaultParams));

      expect(result.current.nodes).toEqual([]);
      expect(result.current.edges).toEqual([]);
    });
  });

  describe('successful fetch', () => {
    it('should fetch and return service map data', async () => {
      const mockResponse = {
        Nodes: [
          {
            NodeId: 'node-1',
            Name: 'api-gateway',
            Type: 'Service',
            KeyAttributes: {
              Name: 'api-gateway',
              Environment: 'generic:default',
              Type: 'Service',
            },
            AttributeMaps: [],
            GroupByAttributes: { 'telemetry.sdk.language': 'java' },
          },
          {
            NodeId: 'node-2',
            Name: 'user-service',
            Type: 'Service',
            KeyAttributes: {
              Name: 'user-service',
              Environment: 'eks:cluster',
              Type: 'Service',
            },
            AttributeMaps: [],
            GroupByAttributes: { 'telemetry.sdk.language': 'python' },
          },
        ],
        Edges: [
          {
            EdgeId: 'edge-1',
            SourceNodeId: 'node-1',
            DestinationNodeId: 'node-2',
          },
        ],
        AvailableGroupByAttributes: {
          'telemetry.sdk.language': ['java', 'python'],
        },
        StartTime: 1704067200000,
        EndTime: 1704070800000,
        NextToken: null,
        AwsAccountId: null,
        AggregatedNodes: [],
      };

      mockGetServiceMap.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useServiceMap(defaultParams));

      // Initial loading state
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.nodes).toHaveLength(2);
      expect(result.current.nodes[0].NodeId).toBe('node-1');
      expect(result.current.nodes[0].Name).toBe('api-gateway');
      expect(result.current.edges).toHaveLength(1);
      expect(result.current.edges[0].SourceNodeId).toBe('node-1');
      expect(result.current.edges[0].DestinationNodeId).toBe('node-2');
      expect(result.current.availableGroupByAttributes).toEqual({
        'telemetry.sdk.language': ['java', 'python'],
      });
    });

    it('should handle empty response', async () => {
      const mockResponse = {
        Nodes: [],
        Edges: [],
        AvailableGroupByAttributes: {},
        StartTime: 1704067200000,
        EndTime: 1704070800000,
        NextToken: null,
        AwsAccountId: null,
        AggregatedNodes: [],
      };

      mockGetServiceMap.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useServiceMap(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.nodes).toEqual([]);
      expect(result.current.edges).toEqual([]);
      expect(result.current.availableGroupByAttributes).toEqual({});
    });
  });

  describe('error handling', () => {
    it('should set error state on fetch failure', async () => {
      const mockError = new Error('Network error');
      mockGetServiceMap.mockRejectedValue(mockError);

      const { result } = renderHook(() => useServiceMap(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.nodes).toEqual([]);
      expect(result.current.edges).toEqual([]);
    });

    it('should wrap non-Error throws', async () => {
      mockGetServiceMap.mockRejectedValue('string error');

      const { result } = renderHook(() => useServiceMap(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Unknown error');
    });
  });

  describe('refetch', () => {
    it('should refetch data when refetch is called', async () => {
      mockGetServiceMap.mockResolvedValue({
        Nodes: [],
        Edges: [],
        AvailableGroupByAttributes: {},
        AggregatedNodes: [],
      });

      const { result } = renderHook(() => useServiceMap(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetServiceMap).toHaveBeenCalledTimes(1);

      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetServiceMap).toHaveBeenCalledTimes(2);
    });
  });

  describe('parameter changes', () => {
    it('should refetch when time range changes', async () => {
      mockGetServiceMap.mockResolvedValue({
        Nodes: [],
        Edges: [],
        AvailableGroupByAttributes: {},
        AggregatedNodes: [],
      });

      const { result, rerender } = renderHook(({ params }) => useServiceMap(params), {
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

      expect(mockGetServiceMap).toHaveBeenCalledTimes(2);
    });

    it('should refetch when refreshTrigger changes', async () => {
      mockGetServiceMap.mockResolvedValue({
        Nodes: [],
        Edges: [],
        AvailableGroupByAttributes: {},
        AggregatedNodes: [],
      });

      const { result, rerender } = renderHook(({ params }) => useServiceMap(params), {
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

      expect(mockGetServiceMap).toHaveBeenCalledTimes(2);
    });
  });
});

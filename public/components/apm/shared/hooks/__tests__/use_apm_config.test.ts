/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useDatasets, usePrometheusDataSources, useCorrelatedLogs } from '../use_apm_config';
import { coreRefs } from '../../../../../framework/core_refs';

// Mock coreRefs
jest.mock('../../../../../framework/core_refs', () => ({
  coreRefs: {
    data: undefined,
    savedObjectsClient: undefined,
  },
}));

describe('useDatasets', () => {
  const mockDataService = {
    dataViews: {
      getIdsWithTitle: jest.fn(),
      get: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset coreRefs
    (coreRefs as any).data = undefined;
    (coreRefs as any).savedObjectsClient = undefined;
  });

  describe('Success Cases', () => {
    it('should return empty arrays when coreRefs.data is undefined', () => {
      (coreRefs as any).data = undefined;

      const { result } = renderHook(() => useDatasets());

      expect(result.current.tracesDatasets).toEqual([]);
      expect(result.current.allDatasets).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeUndefined();
    });

    it('should successfully fetch and separate traces and all datasets', async () => {
      const mockDataViews = [
        { id: 'trace-1', title: 'Traces Dataset' },
        { id: 'log-1', title: 'Logs Dataset' },
      ];

      const mockTraceDataView = {
        getDisplayName: jest.fn().mockReturnValue('Traces Dataset Display'),
        signalType: 'traces',
      };

      const mockLogDataView = {
        getDisplayName: jest.fn().mockReturnValue('Logs Dataset Display'),
        signalType: 'logs',
      };

      mockDataService.dataViews.getIdsWithTitle.mockResolvedValue(mockDataViews);
      mockDataService.dataViews.get
        .mockResolvedValueOnce(mockTraceDataView)
        .mockResolvedValueOnce(mockLogDataView);

      (coreRefs as any).data = mockDataService;

      const { result } = renderHook(() => useDatasets());

      expect(result.current.loading).toBe(true);
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.tracesDatasets).toHaveLength(1);
      expect(result.current.allDatasets).toHaveLength(2);
      expect(result.current.tracesDatasets[0].label).toBe('Traces Dataset Display');
      expect(result.current.allDatasets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Traces Dataset Display' }),
          expect.objectContaining({ label: 'Logs Dataset Display' }),
        ])
      );
    });

    it('should filter datasets by signalType === "traces"', async () => {
      const mockDataViews = [
        { id: 'trace-1', title: 'Traces 1' },
        { id: 'trace-2', title: 'Traces 2' },
        { id: 'metric-1', title: 'Metrics 1' },
      ];

      mockDataService.dataViews.getIdsWithTitle.mockResolvedValue(mockDataViews);
      mockDataService.dataViews.get
        .mockResolvedValueOnce({
          getDisplayName: jest.fn().mockReturnValue('Traces 1'),
          signalType: 'traces',
        })
        .mockResolvedValueOnce({
          getDisplayName: jest.fn().mockReturnValue('Traces 2'),
          signalType: 'traces',
        })
        .mockResolvedValueOnce({
          getDisplayName: jest.fn().mockReturnValue('Metrics 1'),
          signalType: 'metrics',
        });

      (coreRefs as any).data = mockDataService;

      const { result } = renderHook(() => useDatasets());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.tracesDatasets).toHaveLength(2);
      expect(result.current.allDatasets).toHaveLength(3);
    });

    it('should use displayName from dataView', async () => {
      const mockDataViews = [{ id: 'test-1', title: 'Test Title' }];
      const mockDisplayName = 'Custom Display Name';

      mockDataService.dataViews.getIdsWithTitle.mockResolvedValue(mockDataViews);
      mockDataService.dataViews.get.mockResolvedValue({
        getDisplayName: jest.fn().mockReturnValue(mockDisplayName),
        signalType: 'traces',
      });

      (coreRefs as any).data = mockDataService;

      const { result } = renderHook(() => useDatasets());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.tracesDatasets[0].label).toBe(mockDisplayName);
      expect(result.current.tracesDatasets[0].value?.displayName).toBe(mockDisplayName);
    });

    it('should handle refresh correctly', async () => {
      const mockDataViews = [{ id: 'test-1', title: 'Test' }];

      mockDataService.dataViews.getIdsWithTitle.mockResolvedValue(mockDataViews);
      mockDataService.dataViews.get.mockResolvedValue({
        getDisplayName: jest.fn().mockReturnValue('Test Display'),
        signalType: 'traces',
      });

      (coreRefs as any).data = mockDataService;

      const { result } = renderHook(() => useDatasets());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Clear mocks and set new data
      mockDataService.dataViews.getIdsWithTitle.mockClear();
      mockDataService.dataViews.getIdsWithTitle.mockResolvedValue([
        { id: 'test-2', title: 'Test 2' },
      ]);
      mockDataService.dataViews.get.mockResolvedValue({
        getDisplayName: jest.fn().mockReturnValue('Test Display 2'),
        signalType: 'traces',
      });

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockDataService.dataViews.getIdsWithTitle).toHaveBeenCalledTimes(1);
    });
  });

  describe('Failure Cases', () => {
    it('should handle error when getIdsWithTitle fails', async () => {
      const mockError = new Error('Failed to fetch data views');
      mockDataService.dataViews.getIdsWithTitle.mockRejectedValue(mockError);

      (coreRefs as any).data = mockDataService;

      const { result } = renderHook(() => useDatasets());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toEqual(mockError);
      expect(result.current.tracesDatasets).toEqual([]);
      expect(result.current.allDatasets).toEqual([]);
    });

    it('should handle error when individual dataset fetch fails and continue', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockDataViews = [
        { id: 'good-1', title: 'Good Dataset' },
        { id: 'bad-1', title: 'Bad Dataset' },
      ];

      mockDataService.dataViews.getIdsWithTitle.mockResolvedValue(mockDataViews);
      mockDataService.dataViews.get
        .mockResolvedValueOnce({
          getDisplayName: jest.fn().mockReturnValue('Good Dataset'),
          signalType: 'traces',
        })
        .mockRejectedValueOnce(new Error('Failed to fetch individual dataset'));

      (coreRefs as any).data = mockDataService;

      const { result } = renderHook(() => useDatasets());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeUndefined();
      expect(result.current.allDatasets).toHaveLength(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch dataset bad-1:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle non-Error objects with toError helper', async () => {
      mockDataService.dataViews.getIdsWithTitle.mockRejectedValue('String error message');

      (coreRefs as any).data = mockDataService;

      const { result } = renderHook(() => useDatasets());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('String error message');
    });
  });
});

describe('usePrometheusDataSources', () => {
  const mockFetch = jest.fn();
  const mockGetType = jest.fn();
  const mockGetDatasetService = jest.fn();

  const createMockDataService = () => ({
    query: {
      queryString: {
        getDatasetService: mockGetDatasetService,
      },
    },
  });

  const mockSavedObjectsClient = {
    find: jest.fn(),
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDatasetService.mockReturnValue({
      getType: mockGetType,
    });
    mockGetType.mockReturnValue({
      fetch: mockFetch,
    });
    (coreRefs as any).data = undefined;
    (coreRefs as any).savedObjectsClient = undefined;
  });

  describe('Success Cases', () => {
    it('should return empty array when coreRefs.data is undefined', async () => {
      (coreRefs as any).data = undefined;
      (coreRefs as any).savedObjectsClient = mockSavedObjectsClient;

      const { result } = renderHook(() => usePrometheusDataSources());

      // Early return path sets loading false synchronously
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.data).toEqual([]);
    });

    it('should return empty array when PROMETHEUS type is not available', async () => {
      mockGetType.mockReturnValue(undefined);
      const mockDataService = createMockDataService();

      (coreRefs as any).data = mockDataService;
      (coreRefs as any).savedObjectsClient = mockSavedObjectsClient;

      const { result } = renderHook(() => usePrometheusDataSources());

      // When PROMETHEUS type is unavailable, hook sets state synchronously after async check
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.data).toEqual([]);
    });

    it('should fetch Prometheus data connections', async () => {
      const mockDataService = createMockDataService();
      mockFetch.mockResolvedValue({
        children: [{ id: 'prom-1', title: 'Production Prometheus' }],
      });

      (coreRefs as any).data = mockDataService;
      (coreRefs as any).savedObjectsClient = mockSavedObjectsClient;

      const { result } = renderHook(() => usePrometheusDataSources());

      expect(result.current.loading).toBe(true);
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data[0].label).toBe('Production Prometheus');
      expect(result.current.data[0].value?.id).toBe('prom-1');
    });

    it('should map all Prometheus connections from fetch result', async () => {
      const mockDataService = createMockDataService();
      mockFetch.mockResolvedValue({
        children: [
          { id: 'prom-1', title: 'Prometheus 1' },
          { id: 'prom-2', title: 'Prometheus 2' },
          { id: 'prom-3', title: 'Prometheus 3' },
        ],
      });

      (coreRefs as any).data = mockDataService;
      (coreRefs as any).savedObjectsClient = mockSavedObjectsClient;

      const { result } = renderHook(() => usePrometheusDataSources());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toHaveLength(3);
      expect(result.current.data[0].label).toBe('Prometheus 1');
      expect(result.current.data[1].label).toBe('Prometheus 2');
      expect(result.current.data[2].label).toBe('Prometheus 3');
    });

    it('should handle empty children array', async () => {
      const mockDataService = createMockDataService();
      mockFetch.mockResolvedValue({ children: [] });

      (coreRefs as any).data = mockDataService;
      (coreRefs as any).savedObjectsClient = mockSavedObjectsClient;

      const { result } = renderHook(() => usePrometheusDataSources());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it('should handle missing children property', async () => {
      const mockDataService = createMockDataService();
      mockFetch.mockResolvedValue({});

      (coreRefs as any).data = mockDataService;
      (coreRefs as any).savedObjectsClient = mockSavedObjectsClient;

      const { result } = renderHook(() => usePrometheusDataSources());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
      expect(result.current.loading).toBe(false);
    });
  });

  describe('Failure Cases', () => {
    it('should handle fetch errors', async () => {
      const mockDataService = createMockDataService();
      const mockError = new Error('Failed to fetch Prometheus connections');
      mockFetch.mockRejectedValue(mockError);

      (coreRefs as any).data = mockDataService;
      (coreRefs as any).savedObjectsClient = mockSavedObjectsClient;

      const { result } = renderHook(() => usePrometheusDataSources());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toEqual(mockError);
      expect(result.current.data).toEqual([]);
    });

    it('should set error state correctly with toError helper', async () => {
      const mockDataService = createMockDataService();
      mockFetch.mockRejectedValue('String error');

      (coreRefs as any).data = mockDataService;
      (coreRefs as any).savedObjectsClient = mockSavedObjectsClient;

      const { result } = renderHook(() => usePrometheusDataSources());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('String error');
    });

    it('should return empty when datasetService is not available', async () => {
      mockGetDatasetService.mockReturnValue(undefined);
      const mockDataService = createMockDataService();

      (coreRefs as any).data = mockDataService;
      (coreRefs as any).savedObjectsClient = mockSavedObjectsClient;

      const { result } = renderHook(() => usePrometheusDataSources());

      // When datasetService is unavailable, hook sets state synchronously after async check
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.data).toEqual([]);
      expect(result.current.loading).toBe(false);
    });
  });
});

describe('useCorrelatedLogs', () => {
  const mockDataService = {
    dataViews: {
      get: jest.fn(),
    },
  };

  const mockSavedObjectsClient = {
    find: jest.fn(),
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (coreRefs as any).data = undefined;
    (coreRefs as any).savedObjectsClient = undefined;
  });

  describe('Success Cases', () => {
    it('should return empty when missing traceDatasetId', () => {
      (coreRefs as any).data = mockDataService;
      (coreRefs as any).savedObjectsClient = mockSavedObjectsClient;

      const { result } = renderHook(() => useCorrelatedLogs(undefined));

      expect(result.current.data).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it('should return empty when missing coreRefs.data', () => {
      (coreRefs as any).data = undefined;
      (coreRefs as any).savedObjectsClient = mockSavedObjectsClient;

      const { result } = renderHook(() => useCorrelatedLogs('trace-1'));

      expect(result.current.data).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it('should return empty when missing coreRefs.savedObjectsClient', () => {
      (coreRefs as any).data = mockDataService;
      (coreRefs as any).savedObjectsClient = undefined;

      const { result } = renderHook(() => useCorrelatedLogs('trace-1'));

      expect(result.current.data).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it('should find trace-to-logs correlations with correlationType starting with "trace-to-logs-"', async () => {
      const mockResponse = {
        savedObjects: [
          {
            id: 'corr-1',
            attributes: { correlationType: 'trace-to-logs-my-trace-dataset' },
            references: [
              { type: 'index-pattern', id: 'trace-1' },
              { type: 'index-pattern', id: 'log-1' },
            ],
          },
        ],
      };

      mockSavedObjectsClient.find.mockResolvedValue(mockResponse);
      mockSavedObjectsClient.get.mockResolvedValue({
        attributes: { schemaMappings: '{}' },
      });
      mockDataService.dataViews.get.mockResolvedValue({
        getDisplayName: jest.fn().mockReturnValue('Log Dataset'),
        title: 'logs-*',
      });

      (coreRefs as any).data = mockDataService;
      (coreRefs as any).savedObjectsClient = mockSavedObjectsClient;

      const { result } = renderHook(() => useCorrelatedLogs('trace-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data[0].id).toBe('log-1');
      expect(result.current.data[0].displayName).toBe('Log Dataset');
    });

    it('should filter correlations by trace dataset ID', async () => {
      const mockResponse = {
        savedObjects: [
          {
            id: 'corr-1',
            attributes: { correlationType: 'trace-to-logs-trace-1' },
            references: [
              { type: 'index-pattern', id: 'trace-1' },
              { type: 'index-pattern', id: 'log-1' },
            ],
          },
          {
            id: 'corr-2',
            attributes: { correlationType: 'trace-to-logs-trace-2' },
            references: [
              { type: 'index-pattern', id: 'trace-2' },
              { type: 'index-pattern', id: 'log-2' },
            ],
          },
        ],
      };

      mockSavedObjectsClient.find.mockResolvedValue(mockResponse);
      mockSavedObjectsClient.get.mockResolvedValue({
        attributes: { schemaMappings: '{}' },
      });
      mockDataService.dataViews.get.mockResolvedValue({
        getDisplayName: jest.fn().mockReturnValue('Log Dataset 1'),
        title: 'logs-*',
      });

      (coreRefs as any).data = mockDataService;
      (coreRefs as any).savedObjectsClient = mockSavedObjectsClient;

      const { result } = renderHook(() => useCorrelatedLogs('trace-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data[0].id).toBe('log-1');
    });

    it('should exclude trace dataset from log datasets', async () => {
      const mockResponse = {
        savedObjects: [
          {
            id: 'corr-1',
            attributes: { correlationType: 'trace-to-logs-trace-1' },
            references: [
              { type: 'index-pattern', id: 'trace-1' },
              { type: 'index-pattern', id: 'log-1' },
            ],
          },
        ],
      };

      mockSavedObjectsClient.find.mockResolvedValue(mockResponse);
      mockSavedObjectsClient.get.mockResolvedValue({
        attributes: { schemaMappings: '{}' },
      });
      mockDataService.dataViews.get.mockResolvedValue({
        getDisplayName: jest.fn().mockReturnValue('Log Dataset'),
        title: 'logs-*',
      });

      (coreRefs as any).data = mockDataService;
      (coreRefs as any).savedObjectsClient = mockSavedObjectsClient;

      const { result } = renderHook(() => useCorrelatedLogs('trace-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data.every((item) => item.id !== 'trace-1')).toBe(true);
    });

    it('should filter out null results from failed fetches', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockResponse = {
        savedObjects: [
          {
            id: 'corr-1',
            attributes: { correlationType: 'trace-to-logs-trace-1' },
            references: [
              { type: 'index-pattern', id: 'trace-1' },
              { type: 'index-pattern', id: 'log-1' },
              { type: 'index-pattern', id: 'log-2' },
            ],
          },
        ],
      };

      mockSavedObjectsClient.find.mockResolvedValue(mockResponse);
      mockSavedObjectsClient.get.mockResolvedValue({
        attributes: { schemaMappings: '{}' },
      });
      mockDataService.dataViews.get
        .mockResolvedValueOnce({
          getDisplayName: jest.fn().mockReturnValue('Log Dataset 1'),
          title: 'logs-1-*',
        })
        .mockRejectedValueOnce(new Error('Failed to fetch log-2'));

      (coreRefs as any).data = mockDataService;
      (coreRefs as any).savedObjectsClient = mockSavedObjectsClient;

      const { result } = renderHook(() => useCorrelatedLogs('trace-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data[0].id).toBe('log-1');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch log dataset log-2:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Failure Cases', () => {
    it('should return empty when no correlations found', async () => {
      mockSavedObjectsClient.find.mockResolvedValue({ savedObjects: [] });

      (coreRefs as any).data = mockDataService;
      (coreRefs as any).savedObjectsClient = mockSavedObjectsClient;

      const { result } = renderHook(() => useCorrelatedLogs('trace-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it('should handle find errors', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockError = new Error('Failed to find correlations');
      mockSavedObjectsClient.find.mockRejectedValue(mockError);

      (coreRefs as any).data = mockDataService;
      (coreRefs as any).savedObjectsClient = mockSavedObjectsClient;

      const { result } = renderHook(() => useCorrelatedLogs('trace-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toEqual(mockError);
      expect(result.current.data).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch correlated logs:', mockError);

      consoleErrorSpy.mockRestore();
    });

    it('should exclude non-trace-to-logs correlation types', async () => {
      const mockResponse = {
        savedObjects: [
          {
            id: 'corr-1',
            attributes: { correlationType: 'trace-to-logs-trace-1' },
            references: [
              { type: 'index-pattern', id: 'trace-1' },
              { type: 'index-pattern', id: 'log-1' },
            ],
          },
          {
            id: 'config-1',
            attributes: { correlationType: 'APM-Config-123' },
            references: [
              { type: 'index-pattern', id: 'trace-1' },
              { type: 'index-pattern', id: 'log-2' },
            ],
          },
        ],
      };

      mockSavedObjectsClient.find.mockResolvedValue(mockResponse);
      mockSavedObjectsClient.get.mockResolvedValue({
        attributes: { schemaMappings: '{}' },
      });
      mockDataService.dataViews.get.mockResolvedValue({
        getDisplayName: jest.fn().mockReturnValue('Log Dataset 1'),
        title: 'logs-*',
      });

      (coreRefs as any).data = mockDataService;
      (coreRefs as any).savedObjectsClient = mockSavedObjectsClient;

      const { result } = renderHook(() => useCorrelatedLogs('trace-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should only include log-1 from trace-to-logs correlation, not log-2 from APM-Config
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data[0].id).toBe('log-1');
    });
  });
});

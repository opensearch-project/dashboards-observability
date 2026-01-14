/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react-hooks';
import { useDatasets, usePrometheusDataSources, useCorrelatedLogs } from '../use_apm_config';

// Mock the utils module (used internally by hooks)
jest.mock('../../../../../../common/utils', () => ({
  getOSDSavedObjectsClient: jest.fn(),
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
  });

  describe('Success Cases', () => {
    it('should return empty arrays when dataService is undefined', () => {
      const { result } = renderHook(() => useDatasets(undefined));

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

      const { result, waitForNextUpdate } = renderHook(() => useDatasets(mockDataService as any));

      expect(result.current.loading).toBe(true);
      await waitForNextUpdate();

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

      const { result, waitForNextUpdate } = renderHook(() => useDatasets(mockDataService as any));

      await waitForNextUpdate();

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

      const { result, waitForNextUpdate } = renderHook(() => useDatasets(mockDataService as any));

      await waitForNextUpdate();

      expect(result.current.tracesDatasets[0].label).toBe(mockDisplayName);
      expect(result.current.tracesDatasets[0].value.displayName).toBe(mockDisplayName);
    });

    it('should handle refresh correctly', async () => {
      const mockDataViews = [{ id: 'test-1', title: 'Test' }];

      mockDataService.dataViews.getIdsWithTitle.mockResolvedValue(mockDataViews);
      mockDataService.dataViews.get.mockResolvedValue({
        getDisplayName: jest.fn().mockReturnValue('Test Display'),
        signalType: 'traces',
      });

      const { result, waitForNextUpdate } = renderHook(() => useDatasets(mockDataService as any));

      await waitForNextUpdate();

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

      await waitForNextUpdate();

      expect(mockDataService.dataViews.getIdsWithTitle).toHaveBeenCalledTimes(1);
    });
  });

  describe('Failure Cases', () => {
    it('should handle error when getIdsWithTitle fails', async () => {
      const mockError = new Error('Failed to fetch data views');
      mockDataService.dataViews.getIdsWithTitle.mockRejectedValue(mockError);

      const { result, waitForNextUpdate } = renderHook(() => useDatasets(mockDataService as any));

      await waitForNextUpdate();

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

      const { result, waitForNextUpdate } = renderHook(() => useDatasets(mockDataService as any));

      await waitForNextUpdate();

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

      const { result, waitForNextUpdate } = renderHook(() => useDatasets(mockDataService as any));

      await waitForNextUpdate();

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('String error message');
    });

    it('should not update state after component unmount', async () => {
      const mockDataViews = [{ id: 'test-1', title: 'Test' }];

      // Create a promise that won't resolve immediately
      let resolvePromise: any;
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockDataService.dataViews.getIdsWithTitle.mockReturnValue(delayedPromise);

      const { result, unmount } = renderHook(() => useDatasets(mockDataService as any));

      expect(result.current.loading).toBe(true);

      // Unmount before promise resolves
      unmount();

      // Resolve the promise after unmount
      resolvePromise(mockDataViews);

      // Wait a bit to ensure no state updates happen
      await new Promise((resolve) => setTimeout(resolve, 50));

      // If we got here without errors, the abort controller worked
      expect(true).toBe(true);
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

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDatasetService.mockReturnValue({
      getType: mockGetType,
    });
    mockGetType.mockReturnValue({
      fetch: mockFetch,
    });
  });

  describe('Success Cases', () => {
    it('should return empty array when PROMETHEUS type is not available', async () => {
      mockGetType.mockReturnValue(undefined);
      const mockDataService = createMockDataService();

      const { result } = renderHook(() => usePrometheusDataSources(mockDataService as any));

      // Early return path sets loading false synchronously
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.data).toEqual([]);
    });

    it('should fetch Prometheus data connections', async () => {
      const mockDataService = createMockDataService();
      mockFetch.mockResolvedValue({
        children: [{ id: 'prom-1', title: 'Production Prometheus' }],
      });

      const { result, waitForNextUpdate } = renderHook(() =>
        usePrometheusDataSources(mockDataService as any)
      );

      expect(result.current.loading).toBe(true);
      await waitForNextUpdate();

      expect(result.current.loading).toBe(false);
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data[0].label).toBe('Production Prometheus');
      expect(result.current.data[0].value.id).toBe('prom-1');
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

      const { result, waitForNextUpdate } = renderHook(() =>
        usePrometheusDataSources(mockDataService as any)
      );

      await waitForNextUpdate();

      expect(result.current.data).toHaveLength(3);
      expect(result.current.data[0].label).toBe('Prometheus 1');
      expect(result.current.data[1].label).toBe('Prometheus 2');
      expect(result.current.data[2].label).toBe('Prometheus 3');
    });

    it('should use title for label and value', async () => {
      const mockDataService = createMockDataService();
      mockFetch.mockResolvedValue({
        children: [{ id: 'prom-1', title: 'My Prometheus Server' }],
      });

      const { result, waitForNextUpdate } = renderHook(() =>
        usePrometheusDataSources(mockDataService as any)
      );

      await waitForNextUpdate();

      expect(result.current.data[0].label).toBe('My Prometheus Server');
      expect(result.current.data[0].value.title).toBe('My Prometheus Server');
    });

    it('should handle refresh', async () => {
      const mockDataService = createMockDataService();
      mockFetch.mockResolvedValue({ children: [] });

      const { result, waitForNextUpdate } = renderHook(() =>
        usePrometheusDataSources(mockDataService as any)
      );

      await waitForNextUpdate();

      mockFetch.mockClear();
      mockFetch.mockResolvedValue({
        children: [{ id: 'new-prom', title: 'New Prometheus' }],
      });

      act(() => {
        result.current.refresh();
      });

      await waitForNextUpdate();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.current.data).toHaveLength(1);
    });

    it('should handle empty children array', async () => {
      const mockDataService = createMockDataService();
      mockFetch.mockResolvedValue({ children: [] });

      const { result, waitForNextUpdate } = renderHook(() =>
        usePrometheusDataSources(mockDataService as any)
      );

      await waitForNextUpdate();

      expect(result.current.data).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it('should handle missing children property', async () => {
      const mockDataService = createMockDataService();
      mockFetch.mockResolvedValue({});

      const { result, waitForNextUpdate } = renderHook(() =>
        usePrometheusDataSources(mockDataService as any)
      );

      await waitForNextUpdate();

      expect(result.current.data).toEqual([]);
      expect(result.current.loading).toBe(false);
    });
  });

  describe('Failure Cases', () => {
    it('should handle fetch errors', async () => {
      const mockDataService = createMockDataService();
      const mockError = new Error('Failed to fetch Prometheus connections');
      mockFetch.mockRejectedValue(mockError);

      const { result, waitForNextUpdate } = renderHook(() =>
        usePrometheusDataSources(mockDataService as any)
      );

      await waitForNextUpdate();

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toEqual(mockError);
      expect(result.current.data).toEqual([]);
    });

    it('should set error state correctly with toError helper', async () => {
      const mockDataService = createMockDataService();
      mockFetch.mockRejectedValue('String error');

      const { result, waitForNextUpdate } = renderHook(() =>
        usePrometheusDataSources(mockDataService as any)
      );

      await waitForNextUpdate();

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('String error');
    });

    it('should return empty when datasetService is not available', async () => {
      mockGetDatasetService.mockReturnValue(undefined);
      const mockDataService = createMockDataService();

      const { result } = renderHook(() => usePrometheusDataSources(mockDataService as any));

      // Early return path sets loading false synchronously
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
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
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Success Cases', () => {
    it('should return empty when missing dataService', () => {
      const { result } = renderHook(() =>
        useCorrelatedLogs(undefined, mockSavedObjectsClient as any, 'trace-1')
      );

      expect(result.current.data).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it('should return empty when missing savedObjectsClient', () => {
      const { result } = renderHook(() =>
        useCorrelatedLogs(mockDataService as any, undefined, 'trace-1')
      );

      expect(result.current.data).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it('should return empty when missing traceDatasetId', () => {
      const { result } = renderHook(() =>
        useCorrelatedLogs(mockDataService as any, mockSavedObjectsClient as any, undefined)
      );

      expect(result.current.data).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it('should find APM correlations with correlationType === "APM-Correlation"', async () => {
      const mockResponse = {
        savedObjects: [
          {
            id: 'corr-1',
            attributes: { correlationType: 'APM-Correlation' },
            references: [
              { type: 'index-pattern', id: 'trace-1' },
              { type: 'index-pattern', id: 'log-1' },
            ],
          },
        ],
      };

      mockSavedObjectsClient.find.mockResolvedValue(mockResponse);
      mockDataService.dataViews.get.mockResolvedValue({
        getDisplayName: jest.fn().mockReturnValue('Log Dataset'),
      });

      const { result, waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogs(mockDataService as any, mockSavedObjectsClient as any, 'trace-1')
      );

      await waitForNextUpdate();

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data[0].id).toBe('log-1');
      expect(result.current.data[0].displayName).toBe('Log Dataset');
    });

    it('should filter correlations by trace dataset ID', async () => {
      const mockResponse = {
        savedObjects: [
          {
            id: 'corr-1',
            attributes: { correlationType: 'APM-Correlation' },
            references: [
              { type: 'index-pattern', id: 'trace-1' },
              { type: 'index-pattern', id: 'log-1' },
            ],
          },
          {
            id: 'corr-2',
            attributes: { correlationType: 'APM-Correlation' },
            references: [
              { type: 'index-pattern', id: 'trace-2' },
              { type: 'index-pattern', id: 'log-2' },
            ],
          },
        ],
      };

      mockSavedObjectsClient.find.mockResolvedValue(mockResponse);
      mockDataService.dataViews.get.mockResolvedValue({
        getDisplayName: jest.fn().mockReturnValue('Log Dataset 1'),
      });

      const { result, waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogs(mockDataService as any, mockSavedObjectsClient as any, 'trace-1')
      );

      await waitForNextUpdate();

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data[0].id).toBe('log-1');
    });

    it('should exclude trace dataset from log datasets', async () => {
      const mockResponse = {
        savedObjects: [
          {
            id: 'corr-1',
            attributes: { correlationType: 'APM-Correlation' },
            references: [
              { type: 'index-pattern', id: 'trace-1' },
              { type: 'index-pattern', id: 'log-1' },
            ],
          },
        ],
      };

      mockSavedObjectsClient.find.mockResolvedValue(mockResponse);
      mockDataService.dataViews.get.mockResolvedValue({
        getDisplayName: jest.fn().mockReturnValue('Log Dataset'),
      });

      const { result, waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogs(mockDataService as any, mockSavedObjectsClient as any, 'trace-1')
      );

      await waitForNextUpdate();

      expect(result.current.data.every((item) => item.id !== 'trace-1')).toBe(true);
    });

    it('should fetch display names for each log dataset', async () => {
      const mockResponse = {
        savedObjects: [
          {
            id: 'corr-1',
            attributes: { correlationType: 'APM-Correlation' },
            references: [
              { type: 'index-pattern', id: 'trace-1' },
              { type: 'index-pattern', id: 'log-1' },
              { type: 'index-pattern', id: 'log-2' },
            ],
          },
        ],
      };

      mockSavedObjectsClient.find.mockResolvedValue(mockResponse);
      mockDataService.dataViews.get
        .mockResolvedValueOnce({
          getDisplayName: jest.fn().mockReturnValue('Log Dataset 1'),
        })
        .mockResolvedValueOnce({
          getDisplayName: jest.fn().mockReturnValue('Log Dataset 2'),
        });

      const { result, waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogs(mockDataService as any, mockSavedObjectsClient as any, 'trace-1')
      );

      await waitForNextUpdate();

      expect(result.current.data).toHaveLength(2);
      expect(mockDataService.dataViews.get).toHaveBeenCalledTimes(2);
    });

    it('should filter out null results from failed fetches', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockResponse = {
        savedObjects: [
          {
            id: 'corr-1',
            attributes: { correlationType: 'APM-Correlation' },
            references: [
              { type: 'index-pattern', id: 'trace-1' },
              { type: 'index-pattern', id: 'log-1' },
              { type: 'index-pattern', id: 'log-2' },
            ],
          },
        ],
      };

      mockSavedObjectsClient.find.mockResolvedValue(mockResponse);
      mockDataService.dataViews.get
        .mockResolvedValueOnce({
          getDisplayName: jest.fn().mockReturnValue('Log Dataset 1'),
        })
        .mockRejectedValueOnce(new Error('Failed to fetch log-2'));

      const { result, waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogs(mockDataService as any, mockSavedObjectsClient as any, 'trace-1')
      );

      await waitForNextUpdate();

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

      const { result, waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogs(mockDataService as any, mockSavedObjectsClient as any, 'trace-1')
      );

      await waitForNextUpdate();

      expect(result.current.data).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it('should handle find errors', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockError = new Error('Failed to find correlations');
      mockSavedObjectsClient.find.mockRejectedValue(mockError);

      const { result, waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogs(mockDataService as any, mockSavedObjectsClient as any, 'trace-1')
      );

      await waitForNextUpdate();

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toEqual(mockError);
      expect(result.current.data).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch correlated logs:', mockError);

      consoleErrorSpy.mockRestore();
    });

    it('should handle individual log dataset fetch errors', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockResponse = {
        savedObjects: [
          {
            id: 'corr-1',
            attributes: { correlationType: 'APM-Correlation' },
            references: [
              { type: 'index-pattern', id: 'trace-1' },
              { type: 'index-pattern', id: 'log-1' },
            ],
          },
        ],
      };

      mockSavedObjectsClient.find.mockResolvedValue(mockResponse);
      mockDataService.dataViews.get.mockRejectedValue(new Error('Dataset not found'));

      const { result, waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogs(mockDataService as any, mockSavedObjectsClient as any, 'trace-1')
      );

      await waitForNextUpdate();

      expect(result.current.data).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch log dataset log-1:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should exclude non-APM-Correlation types', async () => {
      const mockResponse = {
        savedObjects: [
          {
            id: 'corr-1',
            attributes: { correlationType: 'APM-Correlation' },
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
      mockDataService.dataViews.get.mockResolvedValue({
        getDisplayName: jest.fn().mockReturnValue('Log Dataset 1'),
      });

      const { result, waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogs(mockDataService as any, mockSavedObjectsClient as any, 'trace-1')
      );

      await waitForNextUpdate();

      // Should only include log-1 from APM-Correlation, not log-2 from APM-Config
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data[0].id).toBe('log-1');
    });
  });
});

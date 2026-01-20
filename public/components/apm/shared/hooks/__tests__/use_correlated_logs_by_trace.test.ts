/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '@testing-library/react-hooks';
import { useCorrelatedLogsByTrace } from '../use_correlated_logs_by_trace';
import { CorrelatedLogDataset } from '../use_apm_config';

// Mock the PPLSearchService
const mockExecuteQuery = jest.fn();
jest.mock('../../../query_services/ppl_search_service', () => ({
  PPLSearchService: jest.fn().mockImplementation(() => ({
    executeQuery: mockExecuteQuery,
  })),
}));

// Mock core refs for toasts
const mockAddDanger = jest.fn();
jest.mock('../../../../../framework/core_refs', () => ({
  coreRefs: {
    toasts: {
      addDanger: jest.fn((opts) => mockAddDanger(opts)),
    },
  },
}));

describe('useCorrelatedLogsByTrace', () => {
  const createLogDataset = (
    id: string,
    overrides?: Partial<CorrelatedLogDataset>
  ): CorrelatedLogDataset => ({
    id,
    title: `logs-${id}`,
    displayName: `Log Dataset ${id}`,
    schemaMappings: {
      serviceName: 'serviceName',
      timestamp: 'timestamp',
      traceId: 'traceId',
    },
    ...overrides,
  });

  const defaultParams = {
    traceIds: ['trace-1', 'trace-2'],
    logDatasets: [createLogDataset('ds-1')],
    serviceName: 'frontend',
    spanTimeRange: {
      minTime: new Date('2024-01-01T00:00:00Z'),
      maxTime: new Date('2024-01-01T01:00:00Z'),
    },
    enabled: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('should return empty results when disabled', () => {
      const { result } = renderHook(() =>
        useCorrelatedLogsByTrace({
          ...defaultParams,
          enabled: false,
        })
      );

      expect(result.current.logResults).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should return empty results when no log datasets', () => {
      const { result } = renderHook(() =>
        useCorrelatedLogsByTrace({
          ...defaultParams,
          logDatasets: [],
        })
      );

      expect(result.current.logResults).toEqual([]);
    });
  });

  describe('successful fetch', () => {
    it('should fetch logs and transform response', async () => {
      const mockResponse = {
        jsonData: [
          {
            timestamp: '2024-01-01T00:30:00Z',
            severityText: 'INFO',
            body: 'Test log message',
            spanId: 'span-123',
          },
        ],
      };

      mockExecuteQuery.mockResolvedValue(mockResponse);

      const { result, waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogsByTrace(defaultParams)
      );

      // Initial loading state
      expect(result.current.logResults[0]?.loading).toBe(true);

      await waitForNextUpdate();

      expect(result.current.logResults).toHaveLength(1);
      expect(result.current.logResults[0].loading).toBe(false);
      expect(result.current.logResults[0].logs).toHaveLength(1);
      expect(result.current.logResults[0].logs[0].message).toBe('Test log message');
      expect(result.current.logResults[0].logs[0].level).toBe('INFO');
      expect(result.current.logResults[0].logs[0].spanId).toBe('span-123');
    });

    it('should handle multiple log datasets', async () => {
      mockExecuteQuery
        .mockResolvedValueOnce({ jsonData: [{ body: 'Log 1' }] })
        .mockResolvedValueOnce({ jsonData: [{ body: 'Log 2' }] });

      const { result, waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogsByTrace({
          ...defaultParams,
          logDatasets: [createLogDataset('ds-1'), createLogDataset('ds-2')],
        })
      );

      await waitForNextUpdate();

      expect(result.current.logResults).toHaveLength(2);
      expect(result.current.logResults[0].logs[0].message).toBe('Log 1');
      expect(result.current.logResults[1].logs[0].message).toBe('Log 2');
    });

    it('should handle alternative timestamp and message field names', async () => {
      const mockResponse = {
        jsonData: [
          {
            time: '2024-01-01T00:30:00Z',
            message: 'Alternative message field',
            severity: 'WARN',
          },
        ],
      };

      mockExecuteQuery.mockResolvedValue(mockResponse);

      const { result, waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogsByTrace(defaultParams)
      );

      await waitForNextUpdate();

      expect(result.current.logResults[0].logs[0].timestamp).toBe('2024-01-01T00:30:00Z');
      expect(result.current.logResults[0].logs[0].message).toBe('Alternative message field');
      expect(result.current.logResults[0].logs[0].level).toBe('WARN');
    });

    it('should handle empty jsonData response', async () => {
      mockExecuteQuery.mockResolvedValue({ jsonData: [] });

      const { result, waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogsByTrace(defaultParams)
      );

      await waitForNextUpdate();

      expect(result.current.logResults[0].logs).toEqual([]);
    });

    it('should handle missing jsonData', async () => {
      mockExecuteQuery.mockResolvedValue({});

      const { result, waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogsByTrace(defaultParams)
      );

      await waitForNextUpdate();

      expect(result.current.logResults[0].logs).toEqual([]);
    });
  });

  describe('PPL query building', () => {
    it('should build query with traceId IN clause', async () => {
      mockExecuteQuery.mockResolvedValue({ jsonData: [] });

      const { waitForNextUpdate } = renderHook(() => useCorrelatedLogsByTrace(defaultParams));

      await waitForNextUpdate();

      const executedQuery = mockExecuteQuery.mock.calls[0][0];
      expect(executedQuery).toContain("where `serviceName` = 'frontend'");
      expect(executedQuery).toContain("where (`traceId` IN ('trace-1', 'trace-2')");
      expect(executedQuery).toContain('isnull(`traceId`)');
    });

    it('should build query with timestamp range and buffer', async () => {
      mockExecuteQuery.mockResolvedValue({ jsonData: [] });

      const { waitForNextUpdate } = renderHook(() => useCorrelatedLogsByTrace(defaultParams));

      await waitForNextUpdate();

      const executedQuery = mockExecuteQuery.mock.calls[0][0];
      // Should include timestamp filter
      expect(executedQuery).toContain('where `timestamp` >=');
      expect(executedQuery).toContain('AND `timestamp` <=');
    });

    it('should not include traceId filter when traceIds array is empty', async () => {
      mockExecuteQuery.mockResolvedValue({ jsonData: [] });

      const { waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogsByTrace({
          ...defaultParams,
          traceIds: [],
        })
      );

      await waitForNextUpdate();

      const executedQuery = mockExecuteQuery.mock.calls[0][0];
      // Should not have traceId IN clause
      expect(executedQuery).not.toContain('traceId` IN');
    });

    it('should use custom field names from schema mappings', async () => {
      mockExecuteQuery.mockResolvedValue({ jsonData: [] });

      const customDataset = createLogDataset('custom', {
        schemaMappings: {
          serviceName: 'service.name',
          timestamp: '@timestamp',
          traceId: 'trace.id',
        },
      });

      const { waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogsByTrace({
          ...defaultParams,
          logDatasets: [customDataset],
        })
      );

      await waitForNextUpdate();

      const executedQuery = mockExecuteQuery.mock.calls[0][0];
      expect(executedQuery).toContain('where `service.name` =');
      expect(executedQuery).toContain('where `@timestamp` >=');
      expect(executedQuery).toContain('`trace.id` IN');
    });
  });

  describe('schema validation', () => {
    it('should show error toast and skip dataset with missing serviceName mapping', async () => {
      const invalidDataset = createLogDataset('invalid', {
        schemaMappings: {
          serviceName: '',
          timestamp: 'timestamp',
          traceId: 'traceId',
        },
      });

      const { result, waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogsByTrace({
          ...defaultParams,
          logDatasets: [invalidDataset],
        })
      );

      // Schema validation fails synchronously (no await reached), so state updates
      // happen during initial render. Wait for the state to settle.
      try {
        await waitForNextUpdate({ timeout: 100 });
      } catch {
        // Expected - updates may have already occurred synchronously
      }

      expect(mockAddDanger).toHaveBeenCalled();
      expect(result.current.logResults[0].error).toBeDefined();
      expect(mockExecuteQuery).not.toHaveBeenCalled();
    });

    it('should show error toast and skip dataset with missing timestamp mapping', async () => {
      const invalidDataset = createLogDataset('invalid', {
        schemaMappings: {
          serviceName: 'serviceName',
          timestamp: '',
          traceId: 'traceId',
        },
      });

      const { result, waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogsByTrace({
          ...defaultParams,
          logDatasets: [invalidDataset],
        })
      );

      // Schema validation fails synchronously (no await reached), so state updates
      // happen during initial render. Wait for the state to settle.
      try {
        await waitForNextUpdate({ timeout: 100 });
      } catch {
        // Expected - updates may have already occurred synchronously
      }

      expect(mockAddDanger).toHaveBeenCalled();
      expect(result.current.logResults[0].error).toBeDefined();
    });

    it('should default traceId field when not in schema mappings', async () => {
      const datasetWithoutTraceId = createLogDataset('no-traceid', {
        schemaMappings: {
          serviceName: 'serviceName',
          timestamp: 'timestamp',
          // No traceId in schema
        },
      });

      mockExecuteQuery.mockResolvedValue({ jsonData: [] });

      const { waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogsByTrace({
          ...defaultParams,
          logDatasets: [datasetWithoutTraceId],
        })
      );

      await waitForNextUpdate();

      const executedQuery = mockExecuteQuery.mock.calls[0][0];
      // Should default to 'traceId' field
      expect(executedQuery).toContain('`traceId` IN');
    });
  });

  describe('error handling', () => {
    it('should handle query execution error per dataset', async () => {
      const mockError = new Error('PPL query failed');
      mockExecuteQuery.mockRejectedValue(mockError);

      const { result, waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogsByTrace(defaultParams)
      );

      await waitForNextUpdate();

      expect(result.current.logResults[0].error).toEqual(mockError);
      expect(result.current.logResults[0].loading).toBe(false);
    });

    it('should wrap non-Error throws', async () => {
      mockExecuteQuery.mockRejectedValue('string error');

      const { result, waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogsByTrace(defaultParams)
      );

      await waitForNextUpdate();

      expect(result.current.logResults[0].error).toBeInstanceOf(Error);
    });

    it('should continue fetching other datasets when one fails', async () => {
      mockExecuteQuery
        .mockRejectedValueOnce(new Error('First dataset failed'))
        .mockResolvedValueOnce({ jsonData: [{ body: 'Success log' }] });

      const { result, waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogsByTrace({
          ...defaultParams,
          logDatasets: [createLogDataset('ds-1'), createLogDataset('ds-2')],
        })
      );

      await waitForNextUpdate();

      expect(result.current.logResults[0].error).toBeDefined();
      expect(result.current.logResults[1].logs).toHaveLength(1);
    });
  });

  describe('result metadata', () => {
    it('should include dataset metadata in results', async () => {
      mockExecuteQuery.mockResolvedValue({ jsonData: [] });

      const dataset = createLogDataset('ds-test', {
        displayName: 'Test Log Dataset',
        title: 'logs-test-index',
        schemaMappings: {
          serviceName: 'service.name',
          timestamp: 'timestamp',
          traceId: 'traceId',
        },
      });

      const { result, waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogsByTrace({
          ...defaultParams,
          logDatasets: [dataset],
        })
      );

      await waitForNextUpdate();

      expect(result.current.logResults[0].datasetId).toBe('ds-test');
      expect(result.current.logResults[0].displayName).toBe('Test Log Dataset');
      expect(result.current.logResults[0].title).toBe('logs-test-index');
      expect(result.current.logResults[0].serviceNameField).toBe('service.name');
    });
  });

  describe('time buffer', () => {
    it('should apply 5-minute buffer to time range', async () => {
      mockExecuteQuery.mockResolvedValue({ jsonData: [] });

      const { waitForNextUpdate } = renderHook(() => useCorrelatedLogsByTrace(defaultParams));

      await waitForNextUpdate();

      const executedQuery = mockExecuteQuery.mock.calls[0][0];
      // The minTime should be 5 minutes before the span minTime
      // 2024-01-01T00:00:00Z - 5 min = 2023-12-31T23:55:00Z
      expect(executedQuery).toContain('2023-12-31T23:55:00');
      // The maxTime should be 5 minutes after the span maxTime
      // 2024-01-01T01:00:00Z + 5 min = 2024-01-01T01:05:00Z
      expect(executedQuery).toContain('2024-01-01T01:05:00');
    });

    it('should not include time filter when spanTimeRange is not provided', async () => {
      mockExecuteQuery.mockResolvedValue({ jsonData: [] });

      const { waitForNextUpdate } = renderHook(() =>
        useCorrelatedLogsByTrace({
          ...defaultParams,
          spanTimeRange: undefined,
        })
      );

      await waitForNextUpdate();

      const executedQuery = mockExecuteQuery.mock.calls[0][0];
      // Should not have timestamp range filter
      expect(executedQuery).not.toContain('where `timestamp` >=');
    });
  });
});

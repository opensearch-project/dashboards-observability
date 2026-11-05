/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useServiceMapMetrics,
  ServiceMapMetricParams,
  chunkNames,
} from '../use_service_map_metrics';
import { APPLICATION_MAP_CONSTANTS } from '../../../common/constants';

const {
  METRICS_BATCH_SIZE: MAP_METRICS_BATCH_SIZE,
  METRICS_BATCH_MAX_CHARS: MAP_METRICS_BATCH_MAX_CHARS,
} = APPLICATION_MAP_CONSTANTS;

// Mock the PromQLSearchService
const mockExecuteInstantQuery = jest.fn();
jest.mock('../../../query_services/promql_search_service', () => ({
  PromQLSearchService: jest.fn().mockImplementation(() => ({
    executeInstantQuery: mockExecuteInstantQuery,
  })),
}));

// Mock the APM config context
const mockConfig = {
  prometheusDataSource: {
    id: 'prometheus-ds-1',
    name: 'prometheus-ds-1', // ConnectionId for PromQL queries
  },
};

jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: jest.fn(() => ({ config: mockConfig })),
}));

import { useApmConfig } from '../../../config/apm_config_context';

describe('useServiceMapMetrics', () => {
  const defaultParams: ServiceMapMetricParams = {
    services: [
      { serviceName: 'api-gateway', environment: 'generic:default' },
      { serviceName: 'user-service', environment: 'eks:cluster' },
    ],
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-01T01:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useApmConfig as jest.Mock).mockReturnValue({ config: mockConfig });
  });

  describe('initial state', () => {
    it('should return empty metrics map when no services', () => {
      const { result } = renderHook(() =>
        useServiceMapMetrics({
          ...defaultParams,
          services: [],
        })
      );

      expect(result.current.metricsMap.size).toBe(0);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should return empty metrics map when no prometheus datasource configured', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: {} });

      const { result } = renderHook(() => useServiceMapMetrics(defaultParams));

      expect(result.current.metricsMap.size).toBe(0);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('successful fetch', () => {
    it('should fetch and return metrics for all services', async () => {
      // Mock responses for all 3 metric queries (throughput, faults, errors)
      const mockMetricResponse = (serviceName: string, value: number) => ({
        data: {
          result: [
            {
              // Metrics group by (environment, service), so the series carries both.
              metric: { service: serviceName, environment: 'generic:default' },
              values: [
                [1704067200, String(value)],
                [1704067260, String(value + 1)],
              ],
            },
          ],
        },
      });

      mockExecuteInstantQuery
        // Throughput
        .mockResolvedValueOnce(mockMetricResponse('api-gateway', 100))
        // Faults
        .mockResolvedValueOnce(mockMetricResponse('api-gateway', 5))
        // Errors
        .mockResolvedValueOnce(mockMetricResponse('api-gateway', 10));

      const { result } = renderHook(() => useServiceMapMetrics(defaultParams));

      // Initial loading state
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.metricsMap.size).toBe(2);

      // Check metrics for api-gateway
      const gatewayMetrics = result.current.metricsMap.get('api-gateway::generic:default');
      expect(gatewayMetrics).toBeDefined();
      expect(gatewayMetrics?.throughput.length).toBeGreaterThan(0);
      // Latency should be empty (not fetched in this hook)
      expect(gatewayMetrics?.latency).toEqual([]);
      expect(gatewayMetrics?.avgLatency).toBe(0);
    });

    it('should handle services with no metrics data', async () => {
      // Reset mock to clear any previous setup
      mockExecuteInstantQuery.mockReset();
      mockExecuteInstantQuery.mockResolvedValue({ data: { result: [] } });

      const { result } = renderHook(() => useServiceMapMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.metricsMap.size).toBe(2);

      // Services should have empty metric arrays
      const gatewayMetrics = result.current.metricsMap.get('api-gateway::generic:default');
      expect(gatewayMetrics?.throughput).toEqual([]);
      expect(gatewayMetrics?.avgThroughput).toBe(0);
      expect(gatewayMetrics?.totalRequests).toBe(0);
      expect(gatewayMetrics?.totalFaults).toBe(0);
      expect(gatewayMetrics?.totalErrors).toBe(0);
      expect(gatewayMetrics?.avgFailureRatio).toBe(0);
    });
  });

  describe('dependency nodes (database / messaging / external)', () => {
    // Dependency batches are bounded by remoteService=~"..."; service batches by service=~"...".
    const isDependencyQuery = (q: string) => q.includes('remoteService=~');
    const series = (serviceName: string, value: number) => ({
      metric: { service: serviceName, environment: 'generic:default' },
      values: [[1704067200, String(value)]],
    });

    it('issues only the service queries for a service-only map (older data)', async () => {
      mockExecuteInstantQuery.mockReset();
      mockExecuteInstantQuery.mockResolvedValue({ data: { result: [] } });

      const { result } = renderHook(() => useServiceMapMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const queries = mockExecuteInstantQuery.mock.calls.map((c) => c[0].query as string);
      expect(queries).toHaveLength(3);
      queries.forEach((q) => expect(isDependencyQuery(q)).toBe(false));
    });

    it('uses caller-derived series for dependency nodes only', async () => {
      mockExecuteInstantQuery.mockReset();
      // The caller-derived series names both nodes; only the database node may use it.
      mockExecuteInstantQuery.mockImplementation(({ query }: { query: string }) =>
        Promise.resolve({
          data: {
            result: isDependencyQuery(query)
              ? [series('redis:valkey-cart', 40), series('api-gateway', 99)]
              : [],
          },
        })
      );

      const { result } = renderHook(() =>
        useServiceMapMetrics({
          ...defaultParams,
          services: [
            { serviceName: 'api-gateway', environment: 'generic:default', type: 'service' },
            { serviceName: 'redis:valkey-cart', environment: 'generic:default', type: 'database' },
          ],
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(6);
      expect(
        result.current.metricsMap.get('redis:valkey-cart::generic:default')?.totalRequests
      ).toBe(40);
      expect(result.current.metricsMap.get('api-gateway::generic:default')?.totalRequests).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should set error state on fetch failure', async () => {
      mockExecuteInstantQuery.mockReset();
      const mockError = new Error('Prometheus connection failed');
      mockExecuteInstantQuery.mockRejectedValue(mockError);

      const { result } = renderHook(() => useServiceMapMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toEqual(mockError);
      // Failed nodes are unavailable, never a healthy 0, and no longer pending.
      expect(result.current.metricsMap.size).toBe(0);
      expect(result.current.failedNodeIds).toEqual(
        new Set(['api-gateway::generic:default', 'user-service::eks:cluster'])
      );
      expect(result.current.pendingNodeIds.size).toBe(0);
    });

    it('should wrap non-Error throws', async () => {
      mockExecuteInstantQuery.mockReset();
      mockExecuteInstantQuery.mockRejectedValue('string error');

      const { result } = renderHook(() => useServiceMapMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Unknown error');
    });
  });

  describe('refetch', () => {
    it('should refetch metrics when refetch is called', async () => {
      mockExecuteInstantQuery.mockReset();
      mockExecuteInstantQuery.mockResolvedValue({ data: { result: [] } });

      const { result } = renderHook(() => useServiceMapMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCallCount = mockExecuteInstantQuery.mock.calls.length;

      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockExecuteInstantQuery.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  describe('node list changes', () => {
    it('fetches only the names that are new to the current time range', async () => {
      mockExecuteInstantQuery.mockReset();
      mockExecuteInstantQuery.mockResolvedValue({ data: { result: [] } });

      const { result, rerender } = renderHook(
        (props: ServiceMapMetricParams) => useServiceMapMetrics(props),
        {
          initialProps: defaultParams,
        }
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const initialCallCount = mockExecuteInstantQuery.mock.calls.length;

      // e.g. the PPL map for a new time range adds a node.
      rerender({
        ...defaultParams,
        services: [
          ...defaultParams.services,
          { serviceName: 'cart', environment: 'generic:default' },
        ],
      });
      await waitFor(() =>
        expect(result.current.metricsMap.has('cart::generic:default')).toBe(true)
      );

      // One more batch (three queries), bounded to the new name only.
      const newQueries = mockExecuteInstantQuery.mock.calls
        .slice(initialCallCount)
        .map((c) => c[0].query as string);
      expect(newQueries).toHaveLength(3);
      newQueries.forEach((q) => {
        expect(q).toContain('service=~"cart"');
        expect(q).not.toContain('api-gateway');
      });
    });

    it('fetches the caller-derived queries once dependency nodes appear', async () => {
      mockExecuteInstantQuery.mockReset();
      mockExecuteInstantQuery.mockResolvedValue({ data: { result: [] } });

      const { result, rerender } = renderHook(
        (props: ServiceMapMetricParams) => useServiceMapMetrics(props),
        {
          initialProps: defaultParams,
        }
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(3);

      rerender({
        ...defaultParams,
        services: [
          ...defaultParams.services,
          { serviceName: 'redis', environment: 'generic:default', type: 'database' },
        ],
      });
      await waitFor(() => expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(6));
      const depQueries = mockExecuteInstantQuery.mock.calls.slice(3).map((c) => c[0].query);
      depQueries.forEach((q: string) => expect(q).toContain('remoteService=~"redis"'));
    });
  });

  describe('batching', () => {
    const manyServices = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        serviceName: `svc-${i}`,
        environment: 'generic:default',
      }));

    it('splits names by count and by regex length, preserving order', () => {
      const names = Array.from({ length: MAP_METRICS_BATCH_SIZE + 5 }, (_, i) => `n${i}`);
      const batches = chunkNames(names);
      expect(batches.map((b) => b.length)).toEqual([MAP_METRICS_BATCH_SIZE, 5]);
      expect(batches.flat()).toEqual(names);

      const long = Array.from({ length: 10 }, (_, i) => `${'x'.repeat(1000)}${i}`);
      chunkNames(long).forEach((b) =>
        expect(b.reduce((n, s) => n + s.length + 1, 0)).toBeLessThanOrEqual(
          MAP_METRICS_BATCH_MAX_CHARS
        )
      );
    });

    it('bounds every query to a batch of names and covers every node', async () => {
      mockExecuteInstantQuery.mockReset();
      mockExecuteInstantQuery.mockResolvedValue({ data: { result: [] } });
      const services = manyServices(MAP_METRICS_BATCH_SIZE * 2 + 1);

      const { result } = renderHook(() => useServiceMapMetrics({ ...defaultParams, services }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const queries = mockExecuteInstantQuery.mock.calls.map((c) => c[0].query as string);
      expect(queries).toHaveLength(9); // 3 batches x (throughput, faults, errors)
      queries.forEach((q) => expect(q).toMatch(/service=~"/));
      expect(result.current.metricsMap.size).toBe(services.length);
      expect(result.current.pendingNodeIds.size).toBe(0);
    });

    it('reports nodes as pending until their batch lands', async () => {
      mockExecuteInstantQuery.mockReset();
      const resolvers: Array<() => void> = [];
      mockExecuteInstantQuery.mockImplementation(
        () => new Promise((resolve) => resolvers.push(() => resolve({ data: { result: [] } })))
      );

      const { result } = renderHook(() => useServiceMapMetrics(defaultParams));
      await waitFor(() => expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(3));
      expect(result.current.pendingNodeIds).toEqual(
        new Set(['api-gateway::generic:default', 'user-service::eks:cluster'])
      );
      expect(result.current.metricsMap.size).toBe(0);

      await act(async () => resolvers.forEach((r) => r()));
      await waitFor(() => expect(result.current.pendingNodeIds.size).toBe(0));
      expect(result.current.metricsMap.size).toBe(2);
    });

    it('waits while disabled, reporting the nodes as pending', async () => {
      mockExecuteInstantQuery.mockReset();
      mockExecuteInstantQuery.mockResolvedValue({ data: { result: [] } });

      const { result, rerender } = renderHook(
        (props: ServiceMapMetricParams) => useServiceMapMetrics(props),
        { initialProps: { ...defaultParams, enabled: false } }
      );
      expect(mockExecuteInstantQuery).not.toHaveBeenCalled();
      expect(result.current.pendingNodeIds.size).toBe(2);

      rerender({ ...defaultParams, enabled: true });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(3);
    });

    it('a failed batch does not blank the nodes of other batches', async () => {
      mockExecuteInstantQuery.mockReset();
      mockExecuteInstantQuery.mockImplementation(({ query }: { query: string }) =>
        query.includes('svc-0|')
          ? Promise.reject(new Error('Read timed out'))
          : Promise.resolve({
              data: {
                result: [
                  {
                    metric: {
                      service: `svc-${MAP_METRICS_BATCH_SIZE}`,
                      environment: 'generic:default',
                    },
                    value: [1, '7'],
                  },
                ],
              },
            })
      );
      const services = manyServices(MAP_METRICS_BATCH_SIZE + 1);

      const { result } = renderHook(() => useServiceMapMetrics({ ...defaultParams, services }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.error?.message).toBe('Read timed out');
      expect(
        result.current.metricsMap.get(`svc-${MAP_METRICS_BATCH_SIZE}::generic:default`)
          ?.totalRequests
      ).toBe(7);
      // The failed batch's nodes are unavailable (no spinner, no 0).
      expect(result.current.metricsMap.has('svc-0::generic:default')).toBe(false);
      expect(result.current.failedNodeIds.has('svc-0::generic:default')).toBe(true);
      expect(result.current.failedNodeIds.size).toBe(MAP_METRICS_BATCH_SIZE);
    });

    it('a partial failure (faults only) marks the batch failed', async () => {
      mockExecuteInstantQuery.mockReset();
      mockExecuteInstantQuery.mockImplementation(({ query }: { query: string }) =>
        query.includes('fault{')
          ? Promise.reject(new Error('Read timed out'))
          : Promise.resolve({ data: { result: [] } })
      );
      const { result } = renderHook(() => useServiceMapMetrics(defaultParams));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.failedNodeIds.size).toBe(2);
      expect(result.current.metricsMap.size).toBe(0);
    });

    it('a malformed response fails its batch instead of leaving it pending', async () => {
      mockExecuteInstantQuery.mockReset();
      // `fields` without values makes indexing throw.
      mockExecuteInstantQuery.mockResolvedValue({
        type: 'data_frame',
        fields: [{ name: 'Time' }, { name: 'Series' }, { name: 'Value' }],
      });
      const { result } = renderHook(() => useServiceMapMetrics(defaultParams));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.failedNodeIds.size).toBe(2);
    });

    it('retryFailed re-fetches only the failed nodes', async () => {
      mockExecuteInstantQuery.mockReset();
      mockExecuteInstantQuery.mockRejectedValueOnce(new Error('timeout'));
      mockExecuteInstantQuery.mockResolvedValue({ data: { result: [] } });
      const { result } = renderHook(() => useServiceMapMetrics(defaultParams));
      await waitFor(() => expect(result.current.failedNodeIds.size).toBe(2));
      const callsBefore = mockExecuteInstantQuery.mock.calls.length;

      act(() => result.current.retryFailed());
      await waitFor(() => expect(result.current.failedNodeIds.size).toBe(0));
      expect(result.current.metricsMap.size).toBe(2);
      expect(result.current.error).toBeNull();
      expect(mockExecuteInstantQuery.mock.calls.length - callsBefore).toBe(3);
    });

    it('splits a batch the server truncated at the series limit, and retries the halves', async () => {
      mockExecuteInstantQuery.mockReset();
      const services = manyServices(4);
      mockExecuteInstantQuery.mockImplementation(({ query }: { query: string }) => {
        const names = (query.match(/service=~"([^"]+)"/)?.[1] ?? '').split('|');
        return Promise.resolve(
          names.length > 2
            ? { type: 'data_frame', fields: [], meta: { truncation: { tableTruncated: true } } }
            : { data: { result: [] } }
        );
      });
      const { result } = renderHook(() => useServiceMapMetrics({ ...defaultParams, services }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const batchSizes = mockExecuteInstantQuery.mock.calls
        .filter((c) => (c[0].query as string).includes('request{'))
        .map((c) => (c[0].query.match(/service=~"([^"]+)"/)?.[1] ?? '').split('|').length);
      expect(batchSizes).toEqual([4, 2, 2]);
      expect(result.current.metricsMap.size).toBe(4);
      expect(result.current.failedNodeIds.size).toBe(0);
    });

    it('a single name still truncated is unavailable, not partial', async () => {
      mockExecuteInstantQuery.mockReset();
      mockExecuteInstantQuery.mockResolvedValue({
        type: 'data_frame',
        fields: [],
        meta: { truncation: { tableTruncated: true } },
      });
      const { result } = renderHook(() =>
        useServiceMapMetrics({ ...defaultParams, services: manyServices(1) })
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.failedNodeIds).toEqual(new Set(['svc-0::generic:default']));
    });

    it('holds the concurrency limit across node-list changes, and drops batches that left the screen', async () => {
      mockExecuteInstantQuery.mockReset();
      let inFlight = 0;
      let maxInFlight = 0;
      const resolvers: Array<() => void> = [];
      mockExecuteInstantQuery.mockImplementation(() => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise((resolve) =>
          resolvers.push(() => {
            inFlight -= 1;
            resolve({ data: { result: [] } });
          })
        );
      });
      const group = (prefix: string) =>
        Array.from({ length: MAP_METRICS_BATCH_SIZE * 2 }, (_, i) => ({
          serviceName: `${prefix}-${i}`,
          environment: 'generic:default',
        }));

      const { result, rerender } = renderHook(
        (props: ServiceMapMetricParams) => useServiceMapMetrics(props),
        { initialProps: { ...defaultParams, services: group('a') } }
      );
      // Open B, then C, while A's batches are still in flight.
      rerender({ ...defaultParams, services: group('b') });
      rerender({ ...defaultParams, services: group('c') });
      expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(6); // 2 batches x 3 queries
      expect(maxInFlight).toBe(6);

      // Drain everything.
      while (resolvers.length > 0) {
        await act(async () => resolvers.splice(0).forEach((r) => r()));
      }
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(maxInFlight).toBe(6);
      const queried = new Set(
        mockExecuteInstantQuery.mock.calls.flatMap((c) =>
          (c[0].query.match(/service=~"([^"]+)"/)?.[1] ?? '').split('|')
        )
      );
      // A's two batches had started; B never started and was dropped; C was fetched.
      expect(queried.has('a-0')).toBe(true);
      expect(queried.has('b-0')).toBe(false);
      expect(queried.has('c-0')).toBe(true);
      expect(result.current.metricsMap.size).toBe(MAP_METRICS_BATCH_SIZE * 2);
    });

    it('aborts the in-flight batches when the time range changes', async () => {
      mockExecuteInstantQuery.mockReset();
      mockExecuteInstantQuery.mockImplementation(() => new Promise(() => {}));
      const { rerender } = renderHook(
        (props: ServiceMapMetricParams) => useServiceMapMetrics(props),
        { initialProps: defaultParams }
      );
      await waitFor(() => expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(3));
      const firstSignals = mockExecuteInstantQuery.mock.calls.map((c) => c[0].signal);
      firstSignals.forEach((sig: AbortSignal) => expect(sig.aborted).toBe(false));

      rerender({ ...defaultParams, endTime: new Date('2024-01-01T02:00:00Z') });
      await waitFor(() => expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(6));
      firstSignals.forEach((sig: AbortSignal) => expect(sig.aborted).toBe(true));
    });

    it('refetches everything for a new time range', async () => {
      mockExecuteInstantQuery.mockReset();
      mockExecuteInstantQuery.mockResolvedValue({ data: { result: [] } });

      const { result, rerender } = renderHook(
        (props: ServiceMapMetricParams) => useServiceMapMetrics(props),
        { initialProps: defaultParams }
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(3);

      rerender({ ...defaultParams, endTime: new Date('2024-01-01T02:00:00Z') });
      await waitFor(() => expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(6));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });
  });

  describe('data frame format handling', () => {
    it('should handle data frame response format', async () => {
      mockExecuteInstantQuery.mockReset();
      const dataFrameResponse = {
        type: 'data_frame',
        fields: [
          { name: 'Time', values: [1704067200000, 1704067260000] },
          {
            name: 'Series',
            values: [
              '{environment="generic:default", service="api-gateway"}',
              '{environment="generic:default", service="api-gateway"}',
            ],
          },
          { name: 'Value', values: [100, 101] },
        ],
      };

      mockExecuteInstantQuery.mockResolvedValue(dataFrameResponse);

      const { result } = renderHook(() => useServiceMapMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const gatewayMetrics = result.current.metricsMap.get('api-gateway::generic:default');
      expect(gatewayMetrics?.throughput.length).toBeGreaterThan(0);
    });
  });
});

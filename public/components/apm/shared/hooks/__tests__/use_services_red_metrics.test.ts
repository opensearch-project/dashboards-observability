/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useServicesRedMetrics, serviceNodeKey } from '../use_services_red_metrics';

// Mock the PromQLSearchService
const mockExecuteMetricRequest = jest.fn();
const mockExecuteInstantQuery = jest.fn();
jest.mock('../../../query_services/promql_search_service', () => ({
  PromQLSearchService: jest.fn().mockImplementation(() => ({
    executeMetricRequest: mockExecuteMetricRequest,
    executeInstantQuery: mockExecuteInstantQuery,
  })),
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

// Build a query-enhancements data_frame carrying one (environment, service) series.
const dataFrame = (seriesLabel: string, value: number) => ({
  type: 'data_frame',
  fields: [
    { name: 'Time', values: [1704067200000] },
    { name: 'Series', values: [seriesLabel] },
    { name: 'Value', values: [value] },
  ],
});

describe('useServicesRedMetrics', () => {
  const defaultParams = {
    services: [
      { serviceName: 'api-gateway', environment: 'prod' },
      { serviceName: 'user-service', environment: 'prod' },
    ],
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-01T01:00:00Z'), // 3600s window
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useApmConfig as jest.Mock).mockReturnValue({ config: mockConfig });
    // Default: queries return an empty data frame. The hook still records a
    // (zeroed) entry for every service, so metricsMap is populated regardless.
    mockExecuteInstantQuery.mockResolvedValue({ type: 'data_frame', fields: [] });
    mockExecuteMetricRequest.mockResolvedValue({ type: 'data_frame', fields: [] });
  });

  describe('initial state', () => {
    it('should return empty map when no services provided', () => {
      const { result } = renderHook(() =>
        useServicesRedMetrics({
          ...defaultParams,
          services: [],
        })
      );

      expect(result.current.metricsMap.size).toBe(0);
      expect(result.current.isLoading).toBe(false);
    });

    it('should return empty map when no prometheus connection', () => {
      (useApmConfig as jest.Mock).mockReturnValue({ config: null });

      const { result } = renderHook(() => useServicesRedMetrics(defaultParams));

      expect(result.current.metricsMap.size).toBe(0);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('catalog (instant) metrics for all services', () => {
    it('fetches instant metrics for every service and no range queries without a visible page', async () => {
      const { result } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Three instant queries drive the numbers/sort/filters for all services:
      // throughput total, failure-ratio total, and latency P99.
      expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(3);
      // Per-step range (sparkline) queries only run for a supplied visible page.
      expect(mockExecuteMetricRequest).not.toHaveBeenCalled();
    });

    it('keys metricsMap by service and environment (serviceNodeKey)', async () => {
      const { result } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.metricsMap.has(serviceNodeKey('api-gateway', 'prod'))).toBe(true);
      expect(result.current.metricsMap.has(serviceNodeKey('user-service', 'prod'))).toBe(true);
    });

    it('does not embed a service=~ list filter in the catalog queries', async () => {
      const { result } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const queries = mockExecuteInstantQuery.mock.calls.map((c) => c[0].query as string);
      expect(queries.length).toBeGreaterThan(0);
      queries.forEach((q) => expect(q).not.toContain('service=~'));
    });

    it('parses instant responses into per-(service, environment) values', async () => {
      mockExecuteInstantQuery.mockResolvedValue(
        dataFrame('{environment="prod", service="api-gateway"}', 5)
      );

      const { result } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const metrics = result.current.metricsMap.get(serviceNodeKey('api-gateway', 'prod'));
      expect(metrics).toBeDefined();
      // Latency P99 and failure ratio come straight from the instant value.
      expect(metrics!.avgLatency).toBe(5);
      expect(metrics!.avgFailureRatio).toBe(5);
      // Throughput is the summed total divided by the range (req/s).
      expect(metrics!.avgThroughput).toBeCloseTo(5 / 3600, 5);
      // A service with no matching series stays zeroed, not undefined.
      const other = result.current.metricsMap.get(serviceNodeKey('user-service', 'prod'));
      expect(other!.avgLatency).toBe(0);
    });
  });

  describe('visible-page sparklines', () => {
    it('fetches range queries only for the visible page via a bounded service=~ filter', async () => {
      const { result } = renderHook(() =>
        useServicesRedMetrics({
          ...defaultParams,
          sparklineServices: [{ serviceName: 'api-gateway', environment: 'prod' }],
        })
      );

      // Debounced (~250ms) then three range queries: throughput, failure, latency.
      await waitFor(() => expect(mockExecuteMetricRequest).toHaveBeenCalledTimes(3), {
        timeout: 2000,
      });

      const rangeQuery = mockExecuteMetricRequest.mock.calls[0][0].query as string;
      expect(rangeQuery).toContain('service=~"api-gateway"');
      // Bounded to the visible page - off-page services are not fetched.
      expect(rangeQuery).not.toContain('user-service');
      expect(result.current).toBeDefined();
    });
  });

  describe('dependency rows (database / messaging / external)', () => {
    const isDependencyQuery = (q: string) => /remoteService(!=""|=~)/.test(q);
    const withDependency = {
      ...defaultParams,
      services: [
        { serviceName: 'api-gateway', environment: 'prod', type: 'service' },
        { serviceName: 'api.openai.com', environment: 'prod', type: 'external' },
      ],
    };

    it('issues no caller-derived queries for a service-only catalog (older data)', async () => {
      const { result } = renderHook(() =>
        useServicesRedMetrics({
          ...defaultParams,
          services: defaultParams.services.map((s) => ({ ...s, type: 'service' })),
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const queries = mockExecuteInstantQuery.mock.calls.map((c) => c[0].query as string);
      expect(queries).toHaveLength(3);
      queries.forEach((q) => expect(isDependencyQuery(q)).toBe(false));
    });

    it('adds the caller-derived instant queries when a dependency row is present', async () => {
      const { result } = renderHook(() => useServicesRedMetrics(withDependency));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const queries = mockExecuteInstantQuery.mock.calls.map((c) => c[0].query as string);
      // 3 service queries + dependency throughput, failure ratio and latency.
      expect(queries).toHaveLength(6);
      expect(queries.filter(isDependencyQuery)).toHaveLength(3);
    });

    it('fills dependency rows from caller-derived series and never service rows', async () => {
      // The caller-derived series carries both names; only the dependency row may use it.
      mockExecuteInstantQuery.mockImplementation(({ query }: { query: string }) =>
        Promise.resolve(
          isDependencyQuery(query)
            ? {
                type: 'data_frame',
                fields: [
                  { name: 'Time', values: [1704067200000, 1704067200000] },
                  {
                    name: 'Series',
                    values: [
                      '{environment="prod", service="api.openai.com"}',
                      '{environment="prod", service="api-gateway"}',
                    ],
                  },
                  { name: 'Value', values: [7, 9] },
                ],
              }
            : { type: 'data_frame', fields: [] }
        )
      );

      const { result } = renderHook(() => useServicesRedMetrics(withDependency));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const dep = result.current.metricsMap.get(serviceNodeKey('api.openai.com', 'prod'));
      expect(dep!.avgLatency).toBe(7);
      expect(dep!.avgFailureRatio).toBe(7);
      expect(dep!.avgThroughput).toBeCloseTo(7 / 3600, 5);
      const svc = result.current.metricsMap.get(serviceNodeKey('api-gateway', 'prod'));
      expect(svc!.avgLatency).toBe(0);
      expect(svc!.avgFailureRatio).toBe(0);
      expect(svc!.avgThroughput).toBe(0);
    });

    it('surfaces a failed caller-derived latency query as an error', async () => {
      const depError = new Error('dependency latency failed');
      mockExecuteInstantQuery.mockImplementation(({ query }: { query: string }) =>
        isDependencyQuery(query) && query.includes('latency_seconds_bucket')
          ? Promise.reject(depError)
          : Promise.resolve({ type: 'data_frame', fields: [] })
      );

      const { result } = renderHook(() => useServicesRedMetrics(withDependency));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toEqual(depError);
    });

    it('bounds the dependency sparklines to the page dependencies, escaped for the literal', async () => {
      renderHook(() =>
        useServicesRedMetrics({
          ...withDependency,
          sparklineServices: withDependency.services,
        })
      );

      // Service batch (3) + dependency batch (3).
      await waitFor(() => expect(mockExecuteMetricRequest).toHaveBeenCalledTimes(6), {
        timeout: 2000,
      });

      const rangeQueries = mockExecuteMetricRequest.mock.calls.map((c) => c[0].query as string);
      const serviceBatch = rangeQueries.filter((q) => /[{,]service=~/.test(q));
      expect(serviceBatch).toHaveLength(3);
      serviceBatch.forEach((q) => {
        expect(q).toContain('service=~"api-gateway"');
        expect(q).not.toContain('openai');
      });
      const depBatch = rangeQueries.filter(isDependencyQuery);
      expect(depBatch).toHaveLength(3);
      depBatch.forEach((q) => {
        // Only this page's dependency, not every remote target (`remoteService!=""`).
        expect(q).toContain('remoteService=~"api\\\\.openai\\\\.com"');
        expect(q).not.toContain('remoteService!=""');
      });
    });
  });

  describe('scoped (filtered) catalog', () => {
    const catalog = [
      { serviceName: 'api-gateway', environment: 'prod', type: 'service' },
      { serviceName: 'user-service', environment: 'prod', type: 'service' },
      { serviceName: 'api.openai.com', environment: 'prod', type: 'external' },
    ];
    const instantQueries = () =>
      mockExecuteInstantQuery.mock.calls.map((c) => c[0].query as string);
    const isDependencyQuery = (q: string) => /remoteService(!=""|=~)/.test(q);

    it('bounds the instant queries to the scoped service names', async () => {
      const { result } = renderHook(() =>
        useServicesRedMetrics({
          ...defaultParams,
          services: catalog,
          scopeServices: [catalog[1]],
        })
      );

      await waitFor(() => expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(3));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Only service rows are in scope, so no caller-derived queries run.
      instantQueries().forEach((q) => {
        expect(q).toContain('service=~"user-service"');
        expect(isDependencyQuery(q)).toBe(false);
      });
      expect([...result.current.metricsMap.keys()]).toEqual([
        serviceNodeKey('user-service', 'prod'),
      ]);
    });

    it('bounds the caller-derived queries to the scoped dependencies only', async () => {
      const { result } = renderHook(() =>
        useServicesRedMetrics({
          ...defaultParams,
          services: catalog,
          scopeServices: [catalog[2]],
        })
      );

      await waitFor(() => expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(3));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      instantQueries().forEach((q) => {
        expect(q).toContain('remoteService=~"api\\\\.openai\\\\.com"');
        expect(q).not.toContain('remoteService!=""');
      });
    });

    it('issues no query when the filter matches nothing', async () => {
      const { result } = renderHook(() =>
        useServicesRedMetrics({ ...defaultParams, services: catalog, scopeServices: [] })
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mockExecuteInstantQuery).not.toHaveBeenCalled();
    });

    it('falls back to unbounded queries when the name list is too long to embed', async () => {
      const many = Array.from({ length: 200 }, (_, i) => ({
        serviceName: `service-with-a-long-name-${i}`,
        environment: 'prod',
        type: 'service',
      }));
      const { result } = renderHook(() =>
        useServicesRedMetrics({
          ...defaultParams,
          services: [...many, catalog[0]],
          scopeServices: many,
        })
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(3);
      instantQueries().forEach((q) => expect(q).not.toContain('service=~'));
    });

    it('serves a narrowed (and cleared) filter from the loaded full catalog', async () => {
      const { result, rerender } = renderHook(
        (props: { scopeServices?: typeof catalog }) =>
          useServicesRedMetrics({ ...defaultParams, services: catalog, ...props }),
        { initialProps: {} }
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      // Full catalog: 3 service + 3 caller-derived queries.
      expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(6);

      rerender({ scopeServices: [catalog[0]] });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      rerender({});
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      // Let any (wrongly) debounced fetch fire before asserting.
      await new Promise((r) => setTimeout(r, 400));

      expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(6);
      expect(result.current.metricsMap.has(serviceNodeKey('user-service', 'prod'))).toBe(true);
    });

    it('keeps an in-flight catalog fetch through a filter change and does not resend it', async () => {
      // Hold the unbounded (catalog) queries open; scoped queries answer immediately.
      const pending: Array<(v: unknown) => void> = [];
      mockExecuteInstantQuery.mockImplementation(({ query }: { query: string }) =>
        /service=~|remoteService=~/.test(query)
          ? Promise.resolve({ type: 'data_frame', fields: [] })
          : new Promise((r) => pending.push(r))
      );
      const { result, rerender } = renderHook(
        (props: { scopeServices?: typeof catalog }) =>
          useServicesRedMetrics({ ...defaultParams, services: catalog, ...props }),
        { initialProps: {} }
      );
      await waitFor(() => expect(pending).toHaveLength(6));
      const catalogCalls = mockExecuteInstantQuery.mock.calls.slice();

      // Type a search while the catalog scan runs: scoped queries go out, the scan survives.
      rerender({ scopeServices: [catalog[0]] });
      await waitFor(() => expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(9));
      catalogCalls.forEach((c) => expect(c[0].signal.aborted).toBe(false));

      // Clear the search: answered by the in-flight scan, not a second one.
      rerender({});
      await new Promise((r) => setTimeout(r, 400));
      expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(9);
      expect(result.current.isLoading).toBe(true);

      await act(async () => pending.forEach((r) => r({ type: 'data_frame', fields: [] })));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.metricsMap.has(serviceNodeKey('user-service', 'prod'))).toBe(true);
      expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(9);
    });

    it('reports when a filter is too broad to narrow the queries', async () => {
      const many = Array.from({ length: 200 }, (_, i) => ({
        serviceName: `service-with-a-long-name-${i}`,
        environment: 'prod',
        type: 'service',
      }));
      const { result } = renderHook(() =>
        useServicesRedMetrics({
          ...defaultParams,
          services: [...many, catalog[0]],
          scopeServices: many,
        })
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.scopeFellBack).toBe(true);
    });

    it('refetches bounded when the full catalog has not loaded', async () => {
      // The unbounded catalog load times out (the customer's 503 case).
      mockExecuteInstantQuery.mockRejectedValue(new Error('Read timed out'));
      const { result, rerender } = renderHook(
        (props: { scopeServices?: typeof catalog }) =>
          useServicesRedMetrics({ ...defaultParams, services: catalog, ...props }),
        { initialProps: {} }
      );
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      mockExecuteInstantQuery.mockClear();
      mockExecuteInstantQuery.mockResolvedValue({ type: 'data_frame', fields: [] });

      rerender({ scopeServices: [catalog[0]] });
      await waitFor(() => expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(3));
      instantQueries().forEach((q) => expect(q).toContain('service=~"api-gateway"'));
    });
  });

  describe('enabled', () => {
    it('issues no query while disabled and fetches once enabled', async () => {
      const { result, rerender } = renderHook(
        (props: { enabled: boolean }) =>
          useServicesRedMetrics({
            ...defaultParams,
            sparklineServices: defaultParams.services,
            ...props,
          }),
        { initialProps: { enabled: false } }
      );

      await new Promise((r) => setTimeout(r, 400));
      expect(result.current.isLoading).toBe(true);
      expect(mockExecuteInstantQuery).not.toHaveBeenCalled();
      expect(mockExecuteMetricRequest).not.toHaveBeenCalled();

      rerender({ enabled: true });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mockExecuteInstantQuery).toHaveBeenCalledTimes(3);
      await waitFor(() => expect(mockExecuteMetricRequest).toHaveBeenCalledTimes(3));
    });
  });

  describe('error handling', () => {
    it('surfaces an error and leaves failed metrics unavailable, not 0', async () => {
      const mockError = new Error('Prometheus query failed');
      mockExecuteInstantQuery.mockRejectedValue(mockError);

      const { result } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toEqual(mockError);
      // A failed query must not read as a real 0 (it would sort and filter as one).
      expect(result.current.metricsMap.get(serviceNodeKey('api-gateway', 'prod'))).toBeUndefined();
    });

    it('keeps the metrics that succeeded when one query fails', async () => {
      mockExecuteInstantQuery.mockImplementation(({ query }: { query: string }) =>
        query.includes('histogram_quantile')
          ? Promise.reject(new Error('Read timed out'))
          : Promise.resolve(dataFrame('{environment="prod", service="api-gateway"}', 36))
      );

      const { result } = renderHook(() => useServicesRedMetrics(defaultParams));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const m = result.current.metricsMap.get(serviceNodeKey('api-gateway', 'prod'))!;
      expect(m.avgLatency).toBeUndefined();
      expect(m.avgThroughput).toBeCloseTo(36 / 3600, 5);
      expect(m.avgFailureRatio).toBe(36);
      expect(result.current.error?.message).toBe('Read timed out');
    });
  });

  describe('refetch', () => {
    it('refetches the catalog instant metrics when refetch is called', async () => {
      const { result } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCallCount = mockExecuteInstantQuery.mock.calls.length;

      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(mockExecuteInstantQuery.mock.calls.length).toBeGreaterThan(initialCallCount);
      });
    });
  });

  describe('time range handling', () => {
    it('passes the range end as seconds to the instant queries', async () => {
      const { result } = renderHook(() => useServicesRedMetrics(defaultParams));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const callArgs = mockExecuteInstantQuery.mock.calls[0][0];
      expect(callArgs.time).toBe(Math.floor(defaultParams.endTime.getTime() / 1000));
    });
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';

let mockConfigState: { config: any; loading: boolean };
jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: () => mockConfigState,
}));

const mockMappedFields = jest.fn();
jest.mock('../../../query_services/field_mapping_service', () => ({
  getMappedFieldNames: (...args: unknown[]) => mockMappedFields(...args),
}));

const mockPpl = jest.fn();
jest.mock('../../../query_services/ppl_search_service', () => ({
  PPLSearchService: jest.fn().mockImplementation(() => ({
    executeQuery: (...args: unknown[]) => mockPpl(...args),
  })),
}));

const mockInstant = jest.fn();
jest.mock('../../../query_services/promql_search_service', () => ({
  PromQLSearchService: jest.fn().mockImplementation(() => ({
    executeInstantQuery: (...args: unknown[]) => mockInstant(...args),
  })),
}));

import { clearInfraCache, useServiceInfrastructure } from '../use_service_infrastructure';

const timeRange = { from: 'now-15m', to: 'now' };
const config = (overrides: Record<string, unknown> = {}) => ({
  tracesDataset: { id: 'traces', title: 'otel-v1-apm-span-*', datasourceId: 'ds-1' },
  serviceMapDataset: { id: 'map', title: 'otel-v2-apm-service-map-*', datasourceId: 'ds-1' },
  prometheusDataSource: { id: 'prom-id', name: 'prom', meta: {} },
  ...overrides,
});
const rows = (r: Array<Record<string, unknown>>) => ({ meta: { instantData: { rows: r } } });
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Prometheus for one host `h1` (plain labels), with every metric present. */
const hostPrometheus = ({ query }: { query: string }) => {
  if (query.includes('timestamp(')) {
    return Promise.resolve(rows(query.includes('host_id=~') ? [{ Value: nowSeconds() }] : []));
  }
  if (query.startsWith('count(')) return Promise.resolve(rows([{ Value: '1' }]));
  return Promise.resolve(rows([]));
};

const spanHostRows = { jsonData: [{ 'resource.attributes.host.id': 'h1' }] };

const render = (trigger?: number) =>
  renderHook(({ t }) => useServiceInfrastructure('billing', 'prod', timeRange, t), {
    initialProps: { t: trigger },
  });

describe('useServiceInfrastructure', () => {
  beforeEach(() => {
    clearInfraCache();
    jest.clearAllMocks();
    mockConfigState = { config: config(), loading: false };
    mockMappedFields.mockImplementation((title: string) =>
      Promise.resolve(
        title.includes('service-map') ? new Set<string>() : new Set(['resource.attributes.host.id'])
      )
    );
    mockPpl.mockResolvedValue(spanHostRows);
    mockInstant.mockImplementation(hostPrometheus);
  });

  it('waits for the APM settings before calling anything not configured', () => {
    mockConfigState = { config: null, loading: true };
    const { result } = render();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.notConfigured).toBeUndefined();
  });

  it('reports a missing Prometheus data source or traces dataset as not configured', () => {
    mockConfigState = { config: config({ prometheusDataSource: undefined }), loading: false };
    expect(render().result.current.notConfigured).toBe('prometheus');
    mockConfigState = { config: config({ tracesDataset: undefined }), loading: false };
    expect(render().result.current.notConfigured).toBe('traces');
    expect(mockPpl).not.toHaveBeenCalled();
  });

  it('falls back to the spans, with a warning, when the service map cannot be read', async () => {
    mockMappedFields.mockImplementation((title: string) =>
      title.includes('service-map')
        ? Promise.reject(new Error('index_not_found'))
        : Promise.resolve(new Set(['resource.attributes.host.id']))
    );
    const { result } = render();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.warnings).toEqual(['serviceMap']);
    expect(result.current.keySource).toBe('spans');
    expect(result.current.hostIds).toEqual(['h1']);
    expect(result.current.chartHostIds).toEqual(['h1']);
    expect(result.current.error).toBeNull();
  });

  it('shows a span query failure as an error, not as "not instrumented"', async () => {
    mockPpl.mockRejectedValue(new Error('Unauthorized'));
    const { result } = render();
    await waitFor(() => expect(result.current.error?.message).toBe('Unauthorized'));
    expect(result.current.platform).toBe('none');
    // Errors are strict: the PPL service must not swallow them.
    expect(mockPpl.mock.calls[0][3]).toEqual({ strict: true });
  });

  it('shows an unreadable traces index as an error', async () => {
    mockMappedFields.mockRejectedValue(new Error('security_exception'));
    const { result } = render();
    await waitFor(() => expect(result.current.error?.message).toBe('security_exception'));
  });

  it('keeps the pods when one pod table query fails, with a warning', async () => {
    mockMappedFields.mockImplementation((title: string) =>
      Promise.resolve(
        title.includes('service-map')
          ? new Set<string>()
          : new Set([
              'resource.attributes.k8s.namespace.name',
              'resource.attributes.k8s.deployment.name',
            ])
      )
    );
    mockPpl.mockResolvedValue({
      jsonData: [
        {
          'resource.attributes.k8s.namespace.name': 'shop',
          'resource.attributes.k8s.deployment.name': 'catalog',
        },
      ],
    });
    const pod = { k8s_namespace_name: 'shop', k8s_pod_name: 'catalog-1', k8s_node_name: 'n1' };
    mockInstant.mockImplementation(({ query }: { query: string }) => {
      if (query.includes('timestamp(')) return Promise.resolve(rows([{ Value: nowSeconds() }]));
      if (
        query.startsWith(
          'max by (k8s_cluster_name, k8s_namespace_name, k8s_pod_name, k8s_node_name)'
        )
      ) {
        return Promise.resolve(rows([pod]));
      }
      if (
        query.startsWith(
          'sum by (k8s_cluster_name, k8s_namespace_name, k8s_pod_name) (container_cpu_usage'
        )
      ) {
        return Promise.resolve(rows([{ ...pod, Value: '0.25' }]));
      }
      if (query.includes('container_memory_working_set_bytes') && query.startsWith('sum by')) {
        return Promise.reject(new Error('timeout'));
      }
      if (query.startsWith('count(')) return Promise.resolve(rows([{ Value: '1' }]));
      return Promise.resolve(rows([]));
    });
    const { result } = render();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.warnings).toContain('podTable');
    expect(result.current.pods).toHaveLength(1);
    expect(result.current.pods[0]).toMatchObject({ pod: 'catalog-1', cpu: 0.25 });
    expect(result.current.pods[0].memory).toBeUndefined();
    expect(result.current.chartPods).toEqual([
      { cluster: undefined, namespace: 'shop', pod: 'catalog-1' },
    ]);
  });

  it('reads instant values as of the newest sample, not the range end', async () => {
    const newest = nowSeconds() - 200; // inside the grace: no "data ends" note
    mockInstant.mockImplementation(({ query }: { query: string }) => {
      if (query.includes('timestamp(')) return Promise.resolve(rows([{ Value: newest }]));
      if (query.startsWith('count(')) return Promise.resolve(rows([{ Value: '1' }]));
      return Promise.resolve(rows([]));
    });
    const { result } = render();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.dataEndsAt).toBeUndefined();
    const presence = mockInstant.mock.calls.find(([a]) => a.query.startsWith('count('));
    expect(presence?.[0].time).toBe(newest);
  });

  it('serves a complete result from the cache, and refetches on Refresh', async () => {
    const first = render(1);
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    expect(mockPpl).toHaveBeenCalledTimes(1);
    first.unmount();

    // Back to the tab: cached, no queries.
    const second = render(1);
    expect(second.result.current.hostIds).toEqual(['h1']);
    expect(mockPpl).toHaveBeenCalledTimes(1);

    // Refresh: a new trigger evicts the cached entry.
    second.rerender({ t: 2 });
    await waitFor(() => expect(mockPpl).toHaveBeenCalledTimes(2));
  });

  it('does not cache partial results', async () => {
    mockMappedFields.mockImplementation((title: string) =>
      title.includes('service-map')
        ? Promise.reject(new Error('boom'))
        : Promise.resolve(new Set(['resource.attributes.host.id']))
    );
    const first = render();
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();
    const second = render();
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(mockPpl).toHaveBeenCalledTimes(2);
  });

  it('keys the cache on the data source, not only the index pattern', async () => {
    const first = render();
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();
    mockConfigState = {
      config: config({
        tracesDataset: { id: 'traces', title: 'otel-v1-apm-span-*', datasourceId: 'ds-2' },
      }),
      loading: false,
    };
    const second = render();
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(mockPpl).toHaveBeenCalledTimes(2);
  });
});

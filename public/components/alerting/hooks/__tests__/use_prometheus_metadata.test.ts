/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act, waitFor } from '@testing-library/react';

// Post-Phase-4: the hook instantiates `AlertingPromResourcesService` internally
// via `useMemo(() => new AlertingPromResourcesService(datasourceId), [datasourceId])`
// and calls list/get methods on it. We mock the constructor so each test can
// reconfigure its resolved values per-case.
const mockListMetricNames = jest.fn();
const mockListLabelNames = jest.fn();
const mockListLabelValues = jest.fn();
const mockGetMetricMetadata = jest.fn();

jest.mock('../../query_services/alerting_prom_resources_service', () => ({
  AlertingPromResourcesService: jest.fn().mockImplementation(() => ({
    listMetricNames: mockListMetricNames,
    listLabelNames: mockListLabelNames,
    listLabelValues: mockListLabelValues,
    getMetricMetadata: mockGetMetricMetadata,
  })),
}));

import { usePrometheusMetadata } from '../use_prometheus_metadata';

const baseOpts = { datasourceId: 'ds-1' };

beforeEach(() => {
  jest.useFakeTimers();
  mockListMetricNames.mockReset();
  mockListLabelNames.mockReset();
  mockListLabelValues.mockReset();
  mockGetMetricMetadata.mockReset();
  // Default: metric metadata fetch resolves with an empty list so the
  // on-mount effect doesn't leave pending work in tests that don't care.
  mockGetMetricMetadata.mockResolvedValue({ metadata: [] });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('usePrometheusMetadata', () => {
  it('returns initial state with empty data', () => {
    const { result } = renderHook(() => usePrometheusMetadata(baseOpts));
    expect(result.current.metricOptions).toEqual([]);
    expect(result.current.metricsLoading).toBe(false);
    expect(result.current.labelNames).toEqual([]);
    expect(result.current.error).toBe(false);
  });

  it('searchMetrics fetches after debounce and populates options', async () => {
    mockListMetricNames.mockResolvedValueOnce({ metrics: ['up', 'node_cpu'] });
    const { result } = renderHook(() => usePrometheusMetadata(baseOpts));

    act(() => result.current.searchMetrics('up'));
    expect(result.current.metricsLoading).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(result.current.metricsLoading).toBe(false);
      expect(result.current.metricOptions).toEqual([{ label: 'up' }, { label: 'node_cpu' }]);
    });
  });

  it('searchMetrics clears options for short queries', () => {
    const { result } = renderHook(() => usePrometheusMetadata(baseOpts));
    act(() => result.current.searchMetrics('a'));
    expect(result.current.metricOptions).toEqual([]);
    expect(result.current.metricsLoading).toBe(false);
  });

  it('searchMetrics sets error on fetch failure', async () => {
    mockListMetricNames.mockRejectedValueOnce(new Error('fail'));
    const { result } = renderHook(() => usePrometheusMetadata(baseOpts));

    act(() => result.current.searchMetrics('up'));
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() => expect(result.current.error).toBe(true));
  });

  it('auto-fetches label names when selectedMetric changes', async () => {
    mockListLabelNames.mockResolvedValueOnce({ labels: ['job', 'instance'] });
    const { result } = renderHook(() =>
      usePrometheusMetadata({ ...baseOpts, selectedMetric: 'up' })
    );

    await waitFor(() => {
      expect(result.current.labelNames).toEqual(['job', 'instance']);
    });
    expect(mockListLabelNames).toHaveBeenCalledWith('up');
  });

  it('fetchLabelValues populates values for a label', async () => {
    mockListLabelValues.mockResolvedValueOnce({ values: ['api', 'web'] });
    const { result } = renderHook(() => usePrometheusMetadata(baseOpts));

    act(() => {
      result.current.fetchLabelValues('job');
    });

    await waitFor(() => {
      expect(result.current.labelValues.job).toEqual([{ label: 'api' }, { label: 'web' }]);
    });
  });

  it('fetches metric metadata on mount', async () => {
    const meta = [{ metric: 'up', type: 'gauge', help: 'Up' }];
    mockGetMetricMetadata.mockReset();
    mockGetMetricMetadata.mockResolvedValueOnce({ metadata: meta });
    const { result } = renderHook(() => usePrometheusMetadata(baseOpts));

    await waitFor(() => {
      expect(result.current.metricMetadata).toEqual(meta);
    });
  });

  it('does not instantiate the service or fire any fetches when datasourceId is empty', async () => {
    const { AlertingPromResourcesService } = jest.requireMock(
      '../../query_services/alerting_prom_resources_service'
    ) as { AlertingPromResourcesService: jest.Mock };
    AlertingPromResourcesService.mockClear();

    const { result } = renderHook(() =>
      usePrometheusMetadata({ datasourceId: '', selectedMetric: 'up' })
    );

    // Service never constructed.
    expect(AlertingPromResourcesService).not.toHaveBeenCalled();
    // No underlying methods invoked.
    expect(mockGetMetricMetadata).not.toHaveBeenCalled();
    expect(mockListLabelNames).not.toHaveBeenCalled();

    // Interactions are no-ops while idle.
    act(() => {
      result.current.searchMetrics('up');
      result.current.fetchLabelValues('job');
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(mockListMetricNames).not.toHaveBeenCalled();
    expect(mockListLabelValues).not.toHaveBeenCalled();
    expect(result.current.metricOptions).toEqual([]);
    expect(result.current.labelNames).toEqual([]);
    expect(result.current.error).toBe(false);
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { usePrometheusMetadata } from '../use_prometheus_metadata';

const mockApiClient = {
  getMetricNames: jest.fn(),
  getLabelNames: jest.fn(),
  getLabelValues: jest.fn(),
  getMetricMetadata: jest.fn(),
};

const baseOpts = { datasourceId: 'ds-1', apiClient: mockApiClient };

beforeEach(() => {
  jest.useFakeTimers();
  mockApiClient.getMetricMetadata.mockResolvedValue({ metadata: [] });
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
    mockApiClient.getMetricNames.mockResolvedValueOnce({ metrics: ['up', 'node_cpu'] });
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
    mockApiClient.getMetricNames.mockRejectedValueOnce(new Error('fail'));
    const { result } = renderHook(() => usePrometheusMetadata(baseOpts));

    act(() => result.current.searchMetrics('up'));
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() => expect(result.current.error).toBe(true));
  });

  it('auto-fetches label names when selectedMetric changes', async () => {
    mockApiClient.getLabelNames.mockResolvedValueOnce({ labels: ['job', 'instance'] });
    const { result } = renderHook(() =>
      usePrometheusMetadata({ ...baseOpts, selectedMetric: 'up' })
    );

    await waitFor(() => {
      expect(result.current.labelNames).toEqual(['job', 'instance']);
    });
    expect(mockApiClient.getLabelNames).toHaveBeenCalledWith('ds-1', 'up');
  });

  it('fetchLabelValues populates values for a label', async () => {
    mockApiClient.getLabelValues.mockResolvedValueOnce({ values: ['api', 'web'] });
    const { result } = renderHook(() => usePrometheusMetadata(baseOpts));

    act(() => result.current.fetchLabelValues('job'));

    await waitFor(() => {
      expect(result.current.labelValues.job).toEqual([{ label: 'api' }, { label: 'web' }]);
    });
  });

  it('fetches metric metadata on mount', async () => {
    const meta = [{ metric: 'up', type: 'gauge', help: 'Up' }];
    mockApiClient.getMetricMetadata.mockResolvedValueOnce({ metadata: meta });
    const { result } = renderHook(() => usePrometheusMetadata(baseOpts));

    await waitFor(() => {
      expect(result.current.metricMetadata).toEqual(meta);
    });
  });
});

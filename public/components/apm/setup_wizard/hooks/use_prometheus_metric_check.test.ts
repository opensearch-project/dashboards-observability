/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { usePrometheusMetricCheck } from './use_prometheus_metric_check';
import { APM_RED_REQUIRED_METRICS } from '../../common/constants';
import { coreRefs } from '../../../../framework/core_refs';
import type { HttpStart } from '../../../../../../../src/core/public';

// The metadata metrics endpoint filters by substring `search`; simulate that,
// returning a superset of names so we also exercise the exact-membership check.
function makeHttp(metricsByConnection: Record<string, string[]>): HttpStart {
  const get = jest.fn(async (url: string, opts?: { query?: { search?: string } }) => {
    const conn = decodeURIComponent(
      url.replace('/api/alerting/prometheus/', '').replace('/metadata/metrics', '')
    );
    const search = opts?.query?.search ?? '';
    const all = metricsByConnection[conn] ?? [];
    return { metrics: all.filter((m) => m.includes(search)) };
  });
  return { get } as unknown as HttpStart;
}

describe('usePrometheusMetricCheck', () => {
  afterEach(() => {
    coreRefs.http = undefined;
  });

  it('returns empty results and does not load for no candidates', () => {
    coreRefs.http = makeHttp({});
    const { result } = renderHook(() => usePrometheusMetricCheck([]));
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('marks a data source that exposes all required metrics as matching', async () => {
    coreRefs.http = makeHttp({
      'conn-good': [...APM_RED_REQUIRED_METRICS, 'other_metric'],
    });

    const { result } = renderHook(() =>
      usePrometheusMetricCheck([{ id: 'so-1', name: 'conn-good' }])
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0].matches).toBe(true);
    expect(result.current.results[0].missing).toEqual([]);
    expect(result.current.results[0].found).toEqual([...APM_RED_REQUIRED_METRICS]);
  });

  it('reports missing metrics when some are absent', async () => {
    // Only the first required metric present.
    coreRefs.http = makeHttp({ 'conn-partial': [APM_RED_REQUIRED_METRICS[0]] });

    const { result } = renderHook(() =>
      usePrometheusMetricCheck([{ id: 'so-1', name: 'conn-partial' }])
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.results[0].matches).toBe(false);
    expect(result.current.results[0].found).toEqual([APM_RED_REQUIRED_METRICS[0]]);
    expect(result.current.results[0].missing).toEqual(APM_RED_REQUIRED_METRICS.slice(1));
  });

  it('does not count a substring collision as a match', async () => {
    // e.g. `app_requests_total` contains `request` but is not the exact metric.
    const collisions = APM_RED_REQUIRED_METRICS.map((m) => `app_${m}_total`);
    coreRefs.http = makeHttp({ 'conn-collide': collisions });

    const { result } = renderHook(() =>
      usePrometheusMetricCheck([{ id: 'so-1', name: 'conn-collide' }])
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.results[0].matches).toBe(false);
    expect(result.current.results[0].found).toEqual([]);
  });

  it('records an error result when the probe throws', async () => {
    const get = jest.fn(async () => {
      throw new Error('boom');
    });
    coreRefs.http = { get } as unknown as HttpStart;

    const { result } = renderHook(() =>
      usePrometheusMetricCheck([{ id: 'so-1', name: 'conn-err' }])
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.results[0].matches).toBe(false);
    expect(result.current.results[0].error).toBe('boom');
    expect(result.current.results[0].missing).toEqual([...APM_RED_REQUIRED_METRICS]);
  });
});

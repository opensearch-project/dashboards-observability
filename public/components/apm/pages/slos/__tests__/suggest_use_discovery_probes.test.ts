/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useDiscoveryProbes } from '../suggest_use_discovery_probes';
import type { HttpStart } from '../../../../../../../../src/core/public';

function makeHttp(implementations: {
  labelValues?: Record<string, Record<string, string[]> | Error>;
  ruler?: { groups: unknown[] } | Error;
}): HttpStart {
  const get = jest.fn(async (url: string, opts?: { query?: { selector?: string } }) => {
    if (url.includes('/metadata/label-values/')) {
      const label = decodeURIComponent(url.split('/metadata/label-values/')[1]);
      const selector = opts?.query?.selector ?? '';
      const metric = /__name__="([^"]+)"/.exec(selector)?.[1] ?? '';
      const slot = implementations.labelValues?.[metric];
      if (slot instanceof Error) throw slot;
      const values = slot?.[label] ?? [];
      return { values };
    }
    if (url.includes('/rules')) {
      if (implementations.ruler instanceof Error) throw implementations.ruler;
      return { data: { groups: implementations.ruler?.groups ?? [] } };
    }
    return {};
  });
  return ({ get } as unknown) as HttpStart;
}

describe('useDiscoveryProbes', () => {
  // Most probes have empty values — we silence per-probe warn noise so the
  // test output stays readable; each test asserts the warns it cares about.
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns empty defaults and never fetches when datasourceId is empty', () => {
    const http = makeHttp({});
    const { result } = renderHook(() => useDiscoveryProbes({ http, datasourceId: '', epoch: 0 }));
    expect(result.current.metricNames).toEqual([]);
    expect(result.current.labelValuesByMetric).toEqual({});
    expect(result.current.existingRuleGroups).toEqual([]);
    expect(result.current.rulerFetchFailed).toBe(false);
    expect(result.current.loading).toBe(false);
    expect((http as { get: jest.Mock }).get).not.toHaveBeenCalled();
  });

  it('aggregates probe responses into metricNames + labelValuesByMetric', async () => {
    const http = makeHttp({
      labelValues: {
        http_server_request_duration_seconds_count: {
          service_name: ['cart', 'checkout'],
          job: ['opentelemetry-demo/cart'],
        },
      },
      ruler: { groups: [{ name: 'g', file: 'f', interval: 30, rules: [] }] },
    });
    const { result } = renderHook(() =>
      useDiscoveryProbes({ http, datasourceId: 'prom-1', epoch: 0 })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.metricNames).toContain('http_server_request_duration_seconds_count');
    expect(
      result.current.labelValuesByMetric.http_server_request_duration_seconds_count?.service_name
    ).toEqual(['cart', 'checkout']);
    expect(result.current.existingRuleGroups).toHaveLength(1);
    expect(result.current.rulerFetchFailed).toBe(false);
  });

  it('flips rulerFetchFailed when the ruler fetch rejects', async () => {
    const http = makeHttp({
      ruler: new Error('ruler down'),
    });
    const { result } = renderHook(() =>
      useDiscoveryProbes({ http, datasourceId: 'prom-1', epoch: 0 })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rulerFetchFailed).toBe(true);
    expect(result.current.existingRuleGroups).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      '[slo-suggest] ruler-rules fetch failed',
      expect.any(Error)
    );
  });

  it('per-probe failure leaves siblings unaffected and console.warn is called', async () => {
    const http = makeHttp({
      labelValues: {
        rpc_server_duration_seconds_count: new Error('cortex 400'),
        http_server_request_duration_seconds_count: { service_name: ['cart'] },
      },
    });
    const { result } = renderHook(() =>
      useDiscoveryProbes({ http, datasourceId: 'prom-1', epoch: 0 })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.metricNames).toContain('http_server_request_duration_seconds_count');
    expect(result.current.metricNames).not.toContain('rpc_server_duration_seconds_count');
    expect(warnSpy).toHaveBeenCalledWith(
      '[slo-suggest] label-values probe failed for',
      'rpc_server_duration_seconds_count',
      'rpc_service',
      expect.any(Error)
    );
  });

  it('refetches when epoch bumps', async () => {
    const http = makeHttp({
      labelValues: { http_server_request_duration_seconds_count: { service_name: ['cart'] } },
    });
    const { result, rerender } = renderHook(
      ({ epoch }) => useDiscoveryProbes({ http, datasourceId: 'prom-1', epoch }),
      { initialProps: { epoch: 0 } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    const firstCount = ((http as unknown) as { get: jest.Mock }).get.mock.calls.length;
    rerender({ epoch: 1 });
    await waitFor(() => {
      expect(((http as unknown) as { get: jest.Mock }).get.mock.calls.length).toBeGreaterThan(
        firstCount
      );
    });
  });

  it('does not setState after unmount', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const http = makeHttp({
      labelValues: { http_server_request_duration_seconds_count: { service_name: ['x'] } },
    });
    const { unmount } = renderHook(() =>
      useDiscoveryProbes({ http, datasourceId: 'prom-1', epoch: 0 })
    );
    unmount();
    // Drain microtasks so the in-flight effect's `.then` resolves and would
    // attempt a setState if cancellation weren't honored.
    await new Promise((r) => setImmediate(r));
    // Any state-update-after-unmount would trigger React's act warning here.
    expect(errSpy).not.toHaveBeenCalledWith(expect.stringContaining('not wrapped in act'));
    errSpy.mockRestore();
  });
});

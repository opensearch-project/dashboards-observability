/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useDiscoveryProbes } from '../suggest_use_discovery_probes';
import type { HttpStart } from '../../../../../../../../src/core/public';

interface HistogramFixture {
  buckets: Record<string, number>;
  count?: number;
  sum?: number;
}

/** OTel SDK default explicit bounds, as `le` labels. */
const OTEL_DEFAULT_LE = [
  '0',
  '5',
  '10',
  '25',
  '50',
  '75',
  '100',
  '250',
  '500',
  '750',
  '1000',
  '2500',
  '5000',
  '7500',
  '10000',
];

/** Per-range buckets: each `le` holds only its own slice, `+Inf` only the overflow. */
function perRange(slices: Record<string, number>, sum: number): HistogramFixture {
  const buckets: Record<string, number> = { '+Inf': 0 };
  for (const le of OTEL_DEFAULT_LE) buckets[le] = slices[le] ?? 0;
  const count = Object.values(buckets).reduce((a, b) => a + b, 0);
  return { buckets, count, sum };
}

function makeHttp(implementations: {
  labelValues?: Record<string, Record<string, string[]> | Error>;
  ruler?: { groups: unknown[] } | Error;
  /** `_bucket` metric → label → value → hour increases of its buckets, `_count` and `_sum`. */
  histograms?: Record<string, Record<string, Record<string, HistogramFixture>> | Error>;
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
  const post = jest.fn(async (_url: string, opts?: { body?: string }) => {
    const q: string = JSON.parse(opts?.body ?? '{}')?.query?.query ?? '';
    // `sum by (L, le) (increase(M[1h]))` or the `_count` / `_sum` pair.
    const bucketProbe = /^sum by \((\w+), le\) \(increase\((\w+)\[/.exec(q);
    const totalsProbe = /^label_replace\(sum by \((\w+)\) \(increase\((\w+)_count\[/.exec(q);
    const metric = bucketProbe?.[2] ?? (totalsProbe ? `${totalsProbe[2]}_bucket` : '');
    const label = (bucketProbe ?? totalsProbe)?.[1] ?? '';
    const slot = implementations.histograms?.[metric];
    if (slot instanceof Error) throw slot;
    const rows: Array<{ labels: Record<string, string>; value: number }> = [];
    for (const [value, h] of Object.entries(slot?.[label] ?? {})) {
      if (bucketProbe) {
        for (const [le, v] of Object.entries(h.buckets)) {
          rows.push({ labels: { [label]: value, le }, value: v });
        }
        continue;
      }
      if (h.count !== undefined) {
        rows.push({ labels: { [label]: value, slo_probe_part: 'count' }, value: h.count });
      }
      if (h.sum !== undefined) {
        rows.push({ labels: { [label]: value, slo_probe_part: 'sum' }, value: h.sum });
      }
    }
    return {
      body: {
        fields: [
          { name: 'Labels', values: rows.map((r) => r.labels) },
          { name: 'Value', values: rows.map((r) => r.value) },
        ],
      },
    };
  });
  return { get, post } as unknown as HttpStart;
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
    const { result } = renderHook(() => useDiscoveryProbes({ http, datasourceId: '' }));
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
    const { result } = renderHook(() => useDiscoveryProbes({ http, datasourceId: 'prom-1' }));

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
    const { result } = renderHook(() => useDiscoveryProbes({ http, datasourceId: 'prom-1' }));

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
        rpc_server_duration_seconds_count: new Error('prometheus 400'),
        http_server_request_duration_seconds_count: { service_name: ['cart'] },
      },
    });
    const { result } = renderHook(() => useDiscoveryProbes({ http, datasourceId: 'prom-1' }));

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

  it('does not setState after unmount', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const http = makeHttp({
        labelValues: { http_server_request_duration_seconds_count: { service_name: ['x'] } },
      });
      const { unmount } = renderHook(() => useDiscoveryProbes({ http, datasourceId: 'prom-1' }));
      unmount();
      // Drain microtasks so the in-flight effect's `.then` resolves and would
      // attempt a setState if cancellation weren't honored.
      await new Promise((r) => setImmediate(r));
      // Any state-update-after-unmount would trigger React's act warning here.
      expect(errSpy).not.toHaveBeenCalledWith(expect.stringContaining('not wrapped in act'));
    } finally {
      errSpy.mockRestore();
    }
  });

  it('reports latency histograms whose buckets recorded nothing, per service', async () => {
    const http = makeHttp({
      labelValues: {
        http_server_request_duration_seconds_bucket: { service_name: ['flagd', 'cart'] },
      },
      histograms: {
        http_server_request_duration_seconds_bucket: {
          service_name: {
            flagd: { buckets: { '0.5': 0, '+Inf': 0 }, count: 0 },
            cart: { buckets: { '0.5': 90, '+Inf': 100 }, count: 100, sum: 12 },
          },
        },
      },
    });
    const { result } = renderHook(() => useDiscoveryProbes({ http, datasourceId: 'prom-1' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.emptyHistograms).toEqual([
      {
        metric: 'http_server_request_duration_seconds_bucket',
        label: 'service_name',
        value: 'flagd',
      },
    ]);
    // Only histograms actually present are probed.
    const posts = (http as unknown as { post: jest.Mock }).post.mock.calls;
    expect(
      posts.every(([, o]) => (o.body as string).includes('http_server_request_duration'))
    ).toBe(true);
  });

  it('a failed empty-histogram probe filters nothing', async () => {
    const http = makeHttp({
      labelValues: {
        http_server_request_duration_seconds_bucket: { service_name: ['flagd'] },
      },
      histograms: { http_server_request_duration_seconds_bucket: new Error('timeout') },
    });
    const { result } = renderHook(() => useDiscoveryProbes({ http, datasourceId: 'prom-1' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.emptyHistograms).toEqual([]);
    expect(result.current.histogramShapes).toEqual([]);
    expect(result.current.metricNames).toContain('http_server_request_duration_seconds_bucket');
  });

  it('reads each service histogram layout, bounds and unit', async () => {
    const http = makeHttp({
      labelValues: {
        http_server_request_duration_seconds_bucket: {
          service_name: ['flagd', 'cart', 'checkout'],
        },
      },
      histograms: {
        http_server_request_duration_seconds_bucket: {
          service_name: {
            // Seconds observations against millisecond-style bounds: per-range
            // slices, almost everything in the first bucket, +Inf flat.
            flagd: perRange({ '5': 575, '750': 25 }, 600 * 22.9),
            // Real milliseconds: spread across buckets, mean ~120.
            checkout: perRange(
              { '25': 100, '50': 200, '100': 300, '250': 300, '500': 100 },
              1000 * 120
            ),
            // Classic cumulative seconds histogram.
            cart: { buckets: { '0.1': 40, '0.5': 90, '1': 99, '+Inf': 100 }, count: 100, sum: 20 },
          },
        },
      },
    });
    const { result } = renderHook(() => useDiscoveryProbes({ http, datasourceId: 'prom-1' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const shapeOf = (value: string) =>
      result.current.histogramShapes.find((sh) => sh.value === value);
    expect(shapeOf('flagd')).toMatchObject({ layout: 'per_range', unit: 'seconds' });
    expect(shapeOf('flagd')?.bounds.slice(0, 3)).toEqual([0, 5, 10]);
    expect(shapeOf('checkout')).toMatchObject({ layout: 'per_range', unit: 'milliseconds' });
    expect(shapeOf('cart')).toMatchObject({
      layout: 'cumulative',
      unit: 'seconds',
      bounds: [0.1, 0.5, 1],
    });
    expect(result.current.emptyHistograms).toEqual([]);
  });

  it('reports services with server-side span-derived metrics', async () => {
    const http = makeHttp({ labelValues: { request: { service: ['checkout', 'cart'] } } });
    const { result } = renderHook(() => useDiscoveryProbes({ http, datasourceId: 'prom-1' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.spanDerivedServices).toEqual(['checkout', 'cart']);
    const call = (http as unknown as { get: jest.Mock }).get.mock.calls.find(([url]) =>
      String(url).endsWith('/label-values/service')
    );
    expect(call?.[1]?.query?.selector).toBe(
      '{__name__="request",namespace="span_derived",remoteService=""}'
    );
  });

  it('leaves spanDerivedServices undefined when that probe fails or finds none', async () => {
    for (const request of [new Error('boom'), { service: [] }]) {
      const http = makeHttp({ labelValues: { request } });
      const { result } = renderHook(() => useDiscoveryProbes({ http, datasourceId: 'prom-1' }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.spanDerivedServices).toBeUndefined();
    }
  });
});

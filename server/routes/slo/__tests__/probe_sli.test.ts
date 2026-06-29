/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the probe-sli route. These exercise the response-shape
 * contract (partial success, per-query errors, empty-vector detection)
 * against a mocked `DirectQueryPrometheusBackend` — no real Prometheus.
 */

import { registerProbeSliRoute } from '../probe_sli';
import type { DirectQueryPrometheusBackend } from '../../../services/alerting/directquery_prometheus_backend';
import { InMemoryDatasourceService } from '../../../services/alerting';

interface RouteCall {
  path: string;
}
type RouteHandler = (...args: unknown[]) => Promise<unknown>;

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function makeRouter() {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
}

function getProbeHandler(router: ReturnType<typeof makeRouter>): RouteHandler {
  const call = router.post.mock.calls.find(([cfg]: [RouteCall]) => /probe-sli/.test(cfg.path));
  if (!call) throw new Error('probe-sli route not registered');
  return call[1] as RouteHandler;
}

function makeCtx() {
  return {
    core: {
      savedObjects: { client: { find: jest.fn(async () => ({ saved_objects: [] })) } },
      opensearch: { client: { asCurrentUser: {} } },
    },
  };
}

function makeRes() {
  const ok = jest.fn((body: unknown) => ({ status: 200, body }));
  const customError = jest.fn((body: { statusCode: number; body: unknown }) => ({
    status: body.statusCode,
    body: body.body,
  }));
  return { ok, customError };
}

function makeBackend(): jest.Mocked<
  Pick<DirectQueryPrometheusBackend, 'queryInstant' | 'queryRange' | 'queryRangeMatrix'>
> {
  return ({
    queryInstant: jest.fn(),
    // Good/total counts go through the multi-series matrix variant (so
    // per-dimension series are summed); the ratio sparkline still uses the
    // flattened single-series `queryRange`.
    queryRange: jest.fn(),
    queryRangeMatrix: jest.fn(),
  } as unknown) as jest.Mocked<
    Pick<DirectQueryPrometheusBackend, 'queryInstant' | 'queryRange' | 'queryRangeMatrix'>
  >;
}

/** Wrap a flat point list as a single-series matrix (the common probe case). */
function oneSeries(
  points: Array<{ timestamp: number; value: number }>
): Array<{ metric: Record<string, string>; values: Array<{ timestamp: number; value: number }> }> {
  return [{ metric: {}, values: points }];
}

async function seedPrometheusDatasource(service: InMemoryDatasourceService): Promise<void> {
  await service.create({
    name: 'prometheus-test',
    type: 'prometheus',
    url: '',
    enabled: true,
    directQueryName: 'prometheus-test',
  });
}

describe('probe-sli route', () => {
  let router: ReturnType<typeof makeRouter>;
  let datasourceService: InMemoryDatasourceService;
  let backend: ReturnType<typeof makeBackend>;

  beforeEach(async () => {
    datasourceService = new InMemoryDatasourceService(mockLogger as never);
    // Seeded datasource is always `ds-1` — the in-memory service starts its
    // counter at 0 and increments on create, so tests can assume the id.
    await seedPrometheusDatasource(datasourceService);
    backend = makeBackend();
    router = makeRouter();
    registerProbeSliRoute(
      router as never,
      mockLogger as never,
      backend as never,
      datasourceService
    );
  });

  it('returns counts, ratio, and sparkline on full success', async () => {
    // Good + total are multi-series matrix queries (each reduced to the latest
    // finite point per series, then summed); the ratio range feeds the
    // sparkline via the flattened single-series queryRange.
    backend.queryRangeMatrix.mockResolvedValueOnce(
      oneSeries([
        { timestamp: 1_699_999_940_000, value: 90 },
        { timestamp: 1_700_000_000_000, value: 95 },
      ])
    );
    backend.queryRangeMatrix.mockResolvedValueOnce(
      oneSeries([
        { timestamp: 1_699_999_940_000, value: 98 },
        { timestamp: 1_700_000_000_000, value: 100 },
      ])
    );
    backend.queryRange.mockResolvedValueOnce([
      { timestamp: 1_700_000_000_000, value: 0.95 },
      { timestamp: 1_700_000_060_000, value: 0.96 },
    ]);

    const ctx = makeCtx();
    const res = makeRes();
    await getProbeHandler(router)(
      ctx,
      {
        body: {
          datasourceId: 'ds-1',
          goodQuery: 'sum(rate(good[5m]))',
          totalQuery: 'sum(rate(total[5m]))',
          lookback: '1h',
        },
      },
      res
    );

    expect(res.ok).toHaveBeenCalled();
    const body = res.ok.mock.calls[0][0].body;
    expect(body.goodCount).toBe(95);
    expect(body.totalCount).toBe(100);
    expect(body.sliRatio).toBeCloseTo(0.95, 5);
    expect(body.emptyVector).toBe(false);
    expect(body.samplePoints).toHaveLength(2);
    expect(body.errors).toBeUndefined();
  });

  it('surfaces per-query errors without losing the other side', async () => {
    // good range rejects, total range resolves, ratio range empty.
    backend.queryRangeMatrix.mockRejectedValueOnce(new Error('parse error at char 42'));
    backend.queryRangeMatrix.mockResolvedValueOnce(oneSeries([{ timestamp: 1, value: 50 }]));
    backend.queryRange.mockResolvedValueOnce([]);

    const ctx = makeCtx();
    const res = makeRes();
    await getProbeHandler(router)(
      ctx,
      {
        body: {
          datasourceId: 'ds-1',
          goodQuery: '{{{bogus}}}',
          totalQuery: 'sum(rate(total[5m]))',
        },
      },
      res
    );

    expect(res.ok).toHaveBeenCalled();
    const body = res.ok.mock.calls[0][0].body;
    expect(body.errors?.good).toMatch(/parse error/);
    expect(body.errors?.total).toBeUndefined();
    expect(body.goodCount).toBeUndefined();
    expect(body.totalCount).toBe(50);
  });

  it('flags emptyVector when Prometheus returns zero series', async () => {
    backend.queryRangeMatrix.mockResolvedValueOnce([]);
    backend.queryRangeMatrix.mockResolvedValueOnce([]);
    backend.queryRange.mockResolvedValueOnce([]);

    const ctx = makeCtx();
    const res = makeRes();
    await getProbeHandler(router)(
      ctx,
      {
        body: {
          datasourceId: 'ds-1',
          goodQuery: 'sum(rate(missing[5m]))',
          totalQuery: 'sum(rate(missing[5m]))',
        },
      },
      res
    );

    const body = res.ok.mock.calls[0][0].body;
    expect(body.emptyVector).toBe(true);
    expect(body.sliRatio).toBeUndefined();
  });

  it('flags emptyVector when total count is zero (no-data denominator)', async () => {
    backend.queryRangeMatrix.mockResolvedValueOnce(oneSeries([{ timestamp: 1, value: 10 }]));
    backend.queryRangeMatrix.mockResolvedValueOnce(oneSeries([{ timestamp: 1, value: 0 }]));
    backend.queryRange.mockResolvedValueOnce([]);

    const ctx = makeCtx();
    const res = makeRes();
    await getProbeHandler(router)(
      ctx,
      {
        body: {
          datasourceId: 'ds-1',
          goodQuery: 'good',
          totalQuery: 'total',
        },
      },
      res
    );

    const body = res.ok.mock.calls[0][0].body;
    expect(body.goodCount).toBe(10);
    expect(body.totalCount).toBe(0);
    expect(body.emptyVector).toBe(true);
    expect(body.sliRatio).toBeUndefined();
  });

  it('returns 400 when the datasource is unresolvable', async () => {
    const ctx = makeCtx();
    const res = makeRes();
    await getProbeHandler(router)(
      ctx,
      {
        body: {
          datasourceId: 'does-not-exist',
          goodQuery: 'good',
          totalQuery: 'total',
        },
      },
      res
    );

    expect(res.ok).not.toHaveBeenCalled();
    expect(res.customError).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        body: expect.objectContaining({
          message: expect.stringContaining('not registered'),
        }),
      })
    );
    expect(backend.queryRange).not.toHaveBeenCalled();
    expect(backend.queryRangeMatrix).not.toHaveBeenCalled();
  });

  it('sums across series so a multi-series good/total query is not under-counted', async () => {
    // An un-aggregated query (e.g. via the custom raw-textarea fallback) returns
    // one series per dimension value. The probe must SUM the latest finite point
    // of each series — keeping only result[0] would report 30/40 instead of
    // 50/70 and a too-low ratio.
    backend.queryRangeMatrix.mockResolvedValueOnce([
      { metric: { route: '/a' }, values: [{ timestamp: 1, value: 30 }] },
      { metric: { route: '/b' }, values: [{ timestamp: 1, value: 20 }] },
    ]);
    backend.queryRangeMatrix.mockResolvedValueOnce([
      { metric: { route: '/a' }, values: [{ timestamp: 1, value: 40 }] },
      { metric: { route: '/b' }, values: [{ timestamp: 1, value: 30 }] },
    ]);
    backend.queryRange.mockResolvedValueOnce([]);

    const ctx = makeCtx();
    const res = makeRes();
    await getProbeHandler(router)(
      ctx,
      {
        body: {
          datasourceId: 'ds-1',
          goodQuery: 'rate(good[5m])',
          totalQuery: 'rate(total[5m])',
        },
      },
      res
    );

    const body = res.ok.mock.calls[0][0].body;
    expect(body.goodCount).toBe(50);
    expect(body.totalCount).toBe(70);
    expect(body.sliRatio).toBeCloseTo(50 / 70, 5);
  });

  it('takes the latest finite point and clamps ratio to [0, 1]', async () => {
    // Range series: the reducer uses the most recent finite value. A stray
    // NaN at the tail is skipped in favor of the prior real sample.
    backend.queryRangeMatrix.mockResolvedValueOnce(
      oneSeries([
        { timestamp: 1, value: 100 },
        { timestamp: 2, value: 120 },
        { timestamp: 3, value: NaN },
      ])
    );
    backend.queryRangeMatrix.mockResolvedValueOnce(oneSeries([{ timestamp: 1, value: 100 }]));
    backend.queryRange.mockResolvedValueOnce([{ timestamp: 1, value: 1.5 }]);

    const ctx = makeCtx();
    const res = makeRes();
    await getProbeHandler(router)(
      ctx,
      {
        body: {
          datasourceId: 'ds-1',
          goodQuery: 'good',
          totalQuery: 'total',
        },
      },
      res
    );

    const body = res.ok.mock.calls[0][0].body;
    // Latest finite good = 120 (NaN tail skipped); total = 100.
    expect(body.goodCount).toBe(120);
    expect(body.totalCount).toBe(100);
    // 120/100 = 1.2 → clamped to 1
    expect(body.sliRatio).toBe(1);
  });

  it('rejects malformed PromQL with 400 before fanning out (M3 regression)', async () => {
    const ctx = makeCtx();
    const res = makeRes();
    await getProbeHandler(router)(
      ctx,
      {
        body: {
          datasourceId: 'ds-1',
          goodQuery: 'sum(rate(good[5m])',
          totalQuery: 'sum(rate(total[5m]))',
        },
      },
      res
    );

    expect(res.ok).not.toHaveBeenCalled();
    expect(res.customError).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        body: expect.objectContaining({
          attributes: expect.objectContaining({
            fieldErrors: expect.objectContaining({ goodQuery: expect.stringMatching(/balance/i) }),
          }),
        }),
      })
    );
    expect(backend.queryInstant).not.toHaveBeenCalled();
    expect(backend.queryRange).not.toHaveBeenCalled();
    expect(backend.queryRangeMatrix).not.toHaveBeenCalled();
  });

  it('rejects PromQL containing control characters before fanning out', async () => {
    const ctx = makeCtx();
    const res = makeRes();
    await getProbeHandler(router)(
      ctx,
      {
        body: {
          datasourceId: 'ds-1',
          // BEL char escape rejected by validateCustomPromQL.
          goodQuery: 'sum(rate(good\x07[5m]))',
          totalQuery: 'sum(rate(total[5m]))',
        },
      },
      res
    );

    expect(res.ok).not.toHaveBeenCalled();
    expect(res.customError).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(backend.queryInstant).not.toHaveBeenCalled();
  });

  it('caps sparkline at 20 points', async () => {
    backend.queryRangeMatrix.mockResolvedValueOnce(oneSeries([{ timestamp: 1, value: 1 }])); // good
    backend.queryRangeMatrix.mockResolvedValueOnce(oneSeries([{ timestamp: 1, value: 1 }])); // total
    const longSeries = Array.from({ length: 30 }, (_, i) => ({
      timestamp: 1_700_000_000_000 + i * 60_000,
      value: 0.9,
    }));
    backend.queryRange.mockResolvedValueOnce(longSeries); // ratio sparkline

    const ctx = makeCtx();
    const res = makeRes();
    await getProbeHandler(router)(
      ctx,
      {
        body: {
          datasourceId: 'ds-1',
          goodQuery: 'good',
          totalQuery: 'total',
          lookback: '7d',
        },
      },
      res
    );

    const body = res.ok.mock.calls[0][0].body;
    expect(body.samplePoints).toHaveLength(20);
  });
});

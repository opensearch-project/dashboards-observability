/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the SLO aggregate route + its pure `buildAggregateResponse`
 * helper. The router is mocked to capture the registered GET handler and
 * invoke it against a fake `SloService.list` so we don't need a real store.
 */

import {
  buildAggregateResponse,
  MAX_SERVICES_PER_AGGREGATE_CALL,
  registerSloAggregateRoute,
} from '../aggregate_route';
import type { SloHealthState, SloSummary } from '../../../../common/slo/slo_types';
import type { SloService } from '../../../../common/slo/slo_service';

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

interface Router {
  get: jest.Mock;
  post: jest.Mock;
  put: jest.Mock;
  delete: jest.Mock;
}
interface RouteCall {
  path: string;
}
type RouteHandler = (...args: unknown[]) => Promise<unknown>;

function makeRouter(): Router {
  return { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() };
}

function getAggregateHandler(router: Router): RouteHandler {
  const call = router.get.mock.calls.find(([cfg]: [RouteCall]) => /_aggregate$/.test(cfg.path));
  if (!call) throw new Error('aggregate route not registered');
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

function makeSummary(
  overrides: Partial<SloSummary> & Pick<SloSummary, 'id' | 'service'>
): SloSummary {
  const { id, service, status, name, ...rest } = overrides;
  const state: SloHealthState = status?.state ?? 'ok';
  return ({
    id,
    datasourceId: 'ds-1',
    datasourceType: 'prometheus',
    name: name ?? id,
    enabled: true,
    mode: 'active',
    service,
    owner: { teams: [] },
    sliNodeType: 'single',
    sliBackend: 'prometheus',
    sliLeafType: 'availability',
    objectiveCount: 1,
    worstTarget: 0.99,
    window: { type: 'rolling', duration: '28d' },
    labels: {},
    status: {
      sloId: id,
      objectives: [],
      state,
      firingCount: 0,
      ruleCount: 1,
      computedAt: '2026-05-01T00:00:00Z',
      ...(status ?? {}),
    },
    ...rest,
  } as unknown) as SloSummary;
}

describe('buildAggregateResponse', () => {
  it('materializes an empty bucket for every requested service even when no summaries match', () => {
    const body = buildAggregateResponse(['foo', 'bar'], []);
    expect(body.bySvc.foo).toMatchObject({
      total: 0,
      hasAvailability: false,
      hasLatency: false,
      missingCanonicalPair: true,
      slos: [],
    });
    expect(body.bySvc.bar).toBeDefined();
  });

  it('rolls up mixed per-service state + canonical-pair detection', () => {
    const summaries = [
      makeSummary({ id: 'a', service: 'foo', sliLeafType: 'availability' }),
      makeSummary({
        id: 'b',
        service: 'foo',
        sliLeafType: 'latency_threshold',
        status: { state: 'breached' } as SloSummary['status'],
      }),
      makeSummary({
        id: 'c',
        service: 'bar',
        sliLeafType: 'availability',
        status: { state: 'no_data' } as SloSummary['status'],
      }),
    ];
    const body = buildAggregateResponse(['foo', 'bar'], summaries);
    expect(body.bySvc.foo).toMatchObject({
      total: 2,
      ok: 1,
      breached: 1,
      hasAvailability: true,
      hasLatency: true,
      missingCanonicalPair: false,
    });
    expect(body.bySvc.bar).toMatchObject({
      total: 1,
      noData: 1,
      hasAvailability: true,
      hasLatency: false,
      missingCanonicalPair: true,
    });
  });

  it('prefers the canonicalKind tag over the heuristic', () => {
    const summaries = [
      makeSummary({
        id: 'a',
        service: 'foo',
        sliLeafType: 'custom',
        canonicalKind: 'http-availability',
      }),
      makeSummary({
        id: 'b',
        service: 'foo',
        sliLeafType: 'custom',
        canonicalKind: 'rpc-latency',
      }),
    ];
    const body = buildAggregateResponse(['foo'], summaries);
    expect(body.bySvc.foo).toMatchObject({
      hasAvailability: true,
      hasLatency: true,
      missingCanonicalPair: false,
    });
  });

  it('ignores summaries whose service is outside the requested set', () => {
    const summaries = [
      makeSummary({ id: 'a', service: 'foo' }),
      makeSummary({ id: 'b', service: 'stranger' }),
    ];
    const body = buildAggregateResponse(['foo'], summaries);
    expect(Object.keys(body.bySvc)).toEqual(['foo']);
    expect(body.bySvc.foo.total).toBe(1);
  });
});

describe('registerSloAggregateRoute', () => {
  function setup() {
    const router = makeRouter();
    const list = jest.fn();
    const sloService = ({ list } as unknown) as SloService;
    const buildStatusContext = jest.fn().mockReturnValue(undefined);
    registerSloAggregateRoute(router, sloService, mockLogger as never, buildStatusContext);
    return { router, list, buildStatusContext };
  }

  it('returns rolled-up buckets for the requested services', async () => {
    const { router, list } = setup();
    list.mockResolvedValue([
      makeSummary({ id: 'a', service: 'foo', sliLeafType: 'availability' }),
      makeSummary({ id: 'b', service: 'foo', sliLeafType: 'latency_threshold' }),
    ]);
    const handler = getAggregateHandler(router);
    const res = makeRes();
    await handler(makeCtx(), { query: { services: 'foo,bar', datasourceId: 'ds-1' } }, res);
    expect(res.ok).toHaveBeenCalledTimes(1);
    const body = res.ok.mock.calls[0][0].body as {
      bySvc: Record<string, { total: number }>;
    };
    expect(body.bySvc.foo.total).toBe(2);
    expect(body.bySvc.bar.total).toBe(0);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ service: ['foo', 'bar'], datasourceId: ['ds-1'] }),
      undefined,
      expect.anything()
    );
  });

  it('rejects an empty services list with 400', async () => {
    const { router } = setup();
    const handler = getAggregateHandler(router);
    const res = makeRes();
    // Empty-after-trim CSV (the schema requires non-empty, but whitespace-only
    // entries can still produce an empty parsed array).
    const out = (await handler(
      makeCtx(),
      { query: { services: ' , ', datasourceId: 'ds-1' } },
      res
    )) as { status: number };
    expect(out.status).toBe(400);
  });

  it('rejects services over the cap with 400', async () => {
    const { router } = setup();
    const handler = getAggregateHandler(router);
    const res = makeRes();
    const many = Array.from({ length: MAX_SERVICES_PER_AGGREGATE_CALL + 1 }, (_, i) => `s${i}`);
    const out = (await handler(
      makeCtx(),
      { query: { services: many.join(','), datasourceId: 'ds-1' } },
      res
    )) as { status: number };
    expect(out.status).toBe(400);
  });

  it('bubbles a service-layer failure as 500', async () => {
    const { router, list } = setup();
    list.mockRejectedValue(new Error('store exploded'));
    const handler = getAggregateHandler(router);
    const res = makeRes();
    const out = (await handler(
      makeCtx(),
      { query: { services: 'foo', datasourceId: 'ds-1' } },
      res
    )) as { status: number };
    expect(out.status).toBe(500);
    expect(mockLogger.error).toHaveBeenCalled();
  });

  describe('with datasourceService wired (S3 regression)', () => {
    function setupWithDs() {
      const router = makeRouter();
      const list = jest.fn();
      const sloService = ({ list } as unknown) as SloService;
      const buildStatusContext = jest.fn().mockReturnValue(undefined);
      const datasourceService = ({
        get: jest.fn(),
      } as unknown) as { get: jest.Mock };
      registerSloAggregateRoute(
        router,
        sloService,
        mockLogger as never,
        buildStatusContext,
        datasourceService as never
      );
      return { router, list, datasourceService };
    }

    it('returns 400 when the datasource is not registered', async () => {
      const { router, list, datasourceService } = setupWithDs();
      datasourceService.get.mockResolvedValue(null);
      const handler = getAggregateHandler(router);
      const res = makeRes();
      const out = (await handler(
        makeCtx(),
        { query: { services: 'foo', datasourceId: 'ghost' } },
        res
      )) as { status: number };
      expect(out.status).toBe(400);
      expect(list).not.toHaveBeenCalled();
    });

    it('rewrites ds-N to canonical name when filtering the listing', async () => {
      const { router, list, datasourceService } = setupWithDs();
      datasourceService.get.mockResolvedValue({
        id: 'ds-1',
        name: 'prom-prod',
        type: 'prometheus',
      });
      list.mockResolvedValue([]);
      const handler = getAggregateHandler(router);
      const res = makeRes();
      await handler(makeCtx(), { query: { services: 'foo', datasourceId: 'ds-1' } }, res);
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ datasourceId: ['prom-prod'] }),
        undefined,
        expect.anything()
      );
    });
  });
});

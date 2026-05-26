/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Status aggregator fingerprint-keyed queries.
 *
 * Pins:
 *   - When `ctx.ruleDedupEnabled === true` AND the SO carries
 *     `recordingFingerprints`, the aggregator queries by exact
 *     fingerprint-named recording rules (no `slo_id=` selector), and maps
 *     samples back to objectives via the SO's fingerprint map.
 *   - A shared fingerprint across SLOs: the aggregator still makes its own
 *     per-SLO query, but the PromQL string is identical — demonstrates Cortex
 *     can serve both from the same underlying recording series.
 *   - `rules_missing` from the health checker still wins (priority merge).
 *   - `expectedRuleGroupsFor` returns the dedup recording-group names + the
 *     per-SLO alert-group name (single-group fallback kicks in only when
 *     neither dedup field is set).
 */

import {
  DirectQueryStatusAggregator,
  buildDedupObjectiveQuery,
  expectedRuleGroupsFor,
} from '../status_aggregator';
import type { SloRuleHealthChecker, SloStatusAggregationContext } from '../status_aggregator';
import { resetPromQLSearcherForTests, setPromQLSearcher } from '../../alerting/promql_search';
import type { PromQLSearcher } from '../../alerting/promql_search';
import type { AlertingOSClient, Datasource, Logger } from '../../../../common/types/alerting';
import type { SloDocument, SloSpec } from '../../../../common/slo/slo_types';

function noopLogger(): Logger {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function ds(): Datasource {
  return {
    id: 'prom-ds-001',
    name: 'my cortex',
    type: 'prometheus',
    url: '',
    enabled: true,
    directQueryName: 'my-cortex-connection',
  };
}

function dedupDoc(
  id: string,
  fps: Record<string, string>,
  specOverrides: Partial<SloSpec> = {}
): SloDocument {
  const spec: SloSpec = {
    datasourceId: 'prom-ds-001',
    name: 'checkout availability',
    enabled: true,
    mode: 'active',
    service: 'checkout',
    owner: { teams: ['platform'] },
    sli: {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
        metric: 'http_requests_total',
      },
      dimensions: [{ name: 'service', value: 'checkout' }],
    },
    objectives: Object.keys(fps).map((name) => ({ name, target: 0.999 })),
    budgetWarningThresholds: [{ threshold: 0.5, severity: 'warning' }],
    window: { type: 'rolling', duration: '28d' },
    alerting: { strategy: 'mwmbr', burnRates: [] },
    alarms: {
      sliHealth: { enabled: false },
      attainmentBreach: { enabled: false },
      budgetWarning: { enabled: true },
      noData: { enabled: false, forDuration: '10m' },
      resolved: { enabled: false },
    },
    exclusionWindows: [],
    labels: {},
    annotations: {},
    ...specOverrides,
  };
  return {
    id,
    spec,
    status: {
      version: 1,
      createdAt: '2026-04-23T00:00:00Z',
      createdBy: 'tester',
      updatedAt: '2026-04-23T00:00:00Z',
      updatedBy: 'tester',
      provisioning: {
        backend: 'prometheus',
        rulerNamespace: 'slo-generated-default',
        recordingFingerprints: fps,
        alertGroupName: `slo:alerts:checkout_group_${id}`,
      },
    },
  };
}

function instantForMetrics(
  samples: Array<{ name: string; ratio: number; tsSec?: number }>
): { resultType: 'vector'; result: unknown[] } {
  return {
    resultType: 'vector',
    result: samples.map((s) => ({
      metric: { __name__: s.name },
      value: [s.tsSec ?? Math.floor(Date.now() / 1000), String(s.ratio)],
    })),
  };
}

/**
 * Translate a `{resultType, result}` envelope into the IDataFrame our
 * PromQL adapter expects from the search strategy. Mirrors the shape
 * `createDataFrame` produces for a single PROMQL request.
 */
function envelopeToDataFrame(envelope: {
  resultType: string;
  result: Array<{ metric?: Record<string, string>; value?: [number, string] }>;
}) {
  const Time: number[] = [];
  const Series: string[] = [];
  const Labels: Array<Record<string, string>> = [];
  const Value: number[] = [];
  for (const entry of envelope.result) {
    const metric = entry.metric ?? {};
    const labelsWithoutName = { ...metric };
    delete labelsWithoutName.__name__;
    const seriesParts = Object.entries(metric)
      .filter(([, v]) => v !== undefined && v !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`);
    const seriesName = `{${seriesParts.join(', ')}}`;
    if (entry.value) {
      Time.push(entry.value[0] * 1000);
      Series.push(seriesName);
      Labels.push(labelsWithoutName);
      Value.push(Number(entry.value[1]));
    }
  }
  return {
    type: 'data_frame',
    body: {
      type: 'data_frame',
      name: 'cortex',
      schema: [],
      fields: [
        { name: 'Time', type: 'time', values: Time },
        { name: 'Series', type: 'string', values: Series },
        { name: 'Labels', type: 'object', values: Labels },
        { name: 'Value', type: 'number', values: Value },
      ],
      size: Time.length,
      meta: {},
    },
    took: 1,
  };
}

/**
 * Mock setup: PromQL goes through the search strategy (jest.fn), alerts
 * stay on the resource transport.
 */
function mockClient(
  queryHandler: (body: unknown) => unknown,
  alertsHandler: () => unknown = () => ({ data: { alerts: [] } })
): {
  client: AlertingOSClient;
  request: jest.Mock;
  searcher: jest.MockedFunction<PromQLSearcher>;
} {
  const request = jest.fn(async (params: unknown) => {
    const p = params as { method: string; path: string };
    if (p.path.endsWith('/api/v1/alerts')) return { statusCode: 200, body: alertsHandler() };
    throw new Error(`Unexpected transport path: ${p.path}`);
  });
  const searcher = (jest.fn(async (_ctx, req, _options) => {
    const reqBody = (req as { body?: unknown }).body;
    return envelopeToDataFrame(
      queryHandler(reqBody) as Parameters<typeof envelopeToDataFrame>[0]
    ) as never;
  }) as unknown) as jest.MockedFunction<PromQLSearcher>;
  setPromQLSearcher(searcher as PromQLSearcher);
  return {
    client: ({ transport: { request } } as unknown) as AlertingOSClient,
    request,
    searcher,
  };
}

afterEach(() => {
  resetPromQLSearcherForTests();
});

function ctxDedup(
  client: AlertingOSClient,
  checker?: SloRuleHealthChecker
): SloStatusAggregationContext {
  return {
    client,
    requestContext: {} as never,
    workspaceId: 'default',
    resolveDatasource: async () => ds(),
    ruleDedupEnabled: true,
    healthChecker: checker,
  };
}

describe('buildDedupObjectiveQuery', () => {
  it('emits an anchored regex over all fingerprint metric names', () => {
    const q = buildDedupObjectiveQuery([
      'slo:sli_error:ratio_rate_3d:sli_abcdef0123456789',
      'slo:sli_error:ratio_rate_3d:sli_fedcba9876543210',
    ]);
    expect(q).toBe(
      '{__name__=~"^(slo:sli_error:ratio_rate_3d:sli_abcdef0123456789|slo:sli_error:ratio_rate_3d:sli_fedcba9876543210)$"}'
    );
  });
});

describe('DirectQueryStatusAggregator — dedup path', () => {
  it('queries by fingerprint-named rules and maps samples back to objectives', async () => {
    const doc = dedupDoc('slo-a', { 'availability-99-9': 'abcdef0123456789' });
    const { client, searcher } = mockClient((body) => {
      // The strategy receives the query inside body.query.query (the strategy
      // pulls dataset/language out of body.query, so the PromQL string lives
      // one nesting level deeper than the legacy transport body).
      const b = body as { query: { query: string } };
      expect(b.query.query).toContain('__name__=~');
      expect(b.query.query).not.toContain('slo_id');
      expect(b.query.query).toContain('sli_abcdef0123456789');
      return instantForMetrics([
        { name: 'slo:sli_error:ratio_rate_3d:sli_abcdef0123456789', ratio: 0.0002 },
      ]);
    });
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const [status] = await agg.aggregate([doc], ctxDedup(client));
    expect(status.state).toBe('ok');
    expect(status.objectives[0].state).toBe('ok');
    expect(status.objectives[0].currentValue).toBeCloseTo(0.0002, 6);
    // One PromQL strategy call per dedup-fp set.
    expect(searcher).toHaveBeenCalledTimes(1);
    const [, , options] = searcher.mock.calls[0];
    expect(options).toEqual({ strategy: 'promql' });
  });

  it('two SLOs sharing a fingerprint: each produces an identical query (Cortex can serve from one series)', async () => {
    const docA = dedupDoc('slo-a', { 'availability-99-9': 'abcdef0123456789' });
    const docB = dedupDoc('slo-b', { 'availability-99-9': 'abcdef0123456789' }, { name: 'B' });
    const queries: string[] = [];
    const { client } = mockClient((body) => {
      queries.push((body as { query: { query: string } }).query.query);
      return instantForMetrics([
        { name: 'slo:sli_error:ratio_rate_3d:sli_abcdef0123456789', ratio: 0.0003 },
      ]);
    });
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const out = await agg.aggregate([docA, docB], ctxDedup(client));
    expect(out).toHaveLength(2);
    // Two queries, one per SLO — byte-equal because they share the fp.
    expect(queries).toHaveLength(2);
    expect(queries[0]).toBe(queries[1]);
    expect(out[0].objectives[0].currentValue).toBeCloseTo(0.0003, 6);
    expect(out[1].objectives[0].currentValue).toBeCloseTo(0.0003, 6);
  });

  it('rules_missing overlay still wins over sample derivation', async () => {
    const doc = dedupDoc('slo-a', { 'availability-99-9': 'abcdef0123456789' });
    const { client } = mockClient(() =>
      instantForMetrics([
        { name: 'slo:sli_error:ratio_rate_3d:sli_abcdef0123456789', ratio: 0.0002 },
      ])
    );
    const checker: SloRuleHealthChecker = {
      check: jest.fn().mockResolvedValue({
        state: 'rules_missing',
        expectedGroups: [],
        presentGroups: [],
        missingGroups: [],
        computedAt: new Date().toISOString(),
      }),
    };
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const [status] = await agg.aggregate([doc], ctxDedup(client, checker));
    expect(status.state).toBe('rules_missing');
  });

  it('multi-objective SLO: samples map to the right objectives via fingerprint', async () => {
    const doc = dedupDoc('slo-multi', {
      'availability-99-9': 'aaaaaaaaaaaaaaaa',
      'availability-99-99': 'bbbbbbbbbbbbbbbb',
    });
    const { client } = mockClient(() =>
      instantForMetrics([
        // Samples returned in reverse order — mapping must not rely on order.
        { name: 'slo:sli_error:ratio_rate_3d:sli_bbbbbbbbbbbbbbbb', ratio: 0.002 },
        { name: 'slo:sli_error:ratio_rate_3d:sli_aaaaaaaaaaaaaaaa', ratio: 0.0002 },
      ])
    );
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const [status] = await agg.aggregate([doc], ctxDedup(client));
    const a = status.objectives.find((o) => o.objectiveName === 'availability-99-9')!;
    const b = status.objectives.find((o) => o.objectiveName === 'availability-99-99')!;
    expect(a.currentValue).toBeCloseTo(0.0002, 6);
    expect(b.currentValue).toBeCloseTo(0.002, 6);
  });
});

describe('expectedRuleGroupsFor — dedup fields', () => {
  it('returns unique recording-group names + per-SLO alert group', () => {
    const doc = dedupDoc('slo-multi', {
      'availability-99-9': 'aaaaaaaaaaaaaaaa',
      'availability-99-99': 'bbbbbbbbbbbbbbbb',
    });
    const names = expectedRuleGroupsFor(doc);
    expect(names).toContain('slo:rec:aaaaaaaaaaaaaaaa');
    expect(names).toContain('slo:rec:bbbbbbbbbbbbbbbb');
    expect(names).toContain('slo:alerts:checkout_group_slo-multi');
  });

  it('dedups recording-group names when two objectives share a fingerprint', () => {
    const doc = dedupDoc('slo-shared', {
      o1: 'cccccccccccccccc',
      o2: 'cccccccccccccccc',
    });
    const names = expectedRuleGroupsFor(doc);
    const recs = names.filter((n) => n.startsWith('slo:rec:'));
    expect(recs).toEqual(['slo:rec:cccccccccccccccc']);
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Integration test for the per-datasource circuit breaker wired into the
 * status aggregator. Verifies fast-fail to no_data when the breaker is
 * open, isolation across datasources, and cooldown auto-recovery via the
 * injectable clock.
 */

import { DatasourceCircuitBreaker } from '../datasource_circuit_breaker';
import { DirectQueryStatusAggregator } from '../status_aggregator';
import type { AlertingOSClient, Datasource, Logger } from '../../../../common/types/alerting';
import type { SloDocument, SloSpec } from '../../../../common/slo/slo_types';
import type { SloStatusAggregationContext } from '../status_aggregator';
import { resetPromQLSearcherForTests, setPromQLSearcher } from '../../alerting/promql_search';
import type { PromQLSearcher } from '../../alerting/promql_search';

function noopLogger(): Logger {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function makeDoc(id: string, datasourceId: string): SloDocument {
  const spec: SloSpec = {
    datasourceId,
    name: id,
    enabled: true,
    mode: 'active',
    service: 'svc',
    owner: { teams: ['t'] },
    sli: {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
        metric: 'http_requests_total',
      },
      dimensions: [{ name: 'service', value: 'svc' }],
    },
    objectives: [{ name: 'o', target: 0.99 }],
    budgetWarningThresholds: [],
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
  };
  return {
    id,
    spec,
    status: {
      version: 1,
      createdAt: '2024-01-01T00:00:00Z',
      createdBy: 't',
      updatedAt: '2024-01-01T00:00:00Z',
      updatedBy: 't',
      provisioning: { backend: 'prometheus', alertGroupName: `grp-${id}` },
    },
  };
}

function dsFor(id: string): Datasource {
  return {
    id,
    name: id,
    type: 'prometheus',
    url: '',
    enabled: true,
    directQueryName: `${id}-conn`,
  };
}

function ctxFor(
  ds: Record<string, Datasource>,
  client: AlertingOSClient
): SloStatusAggregationContext {
  return {
    client,
    requestContext: {} as never,
    workspaceId: 'default',
    resolveDatasource: async (id: string) => ds[id],
  };
}

beforeEach(() => {
  // The aggregator's PromQL prefetch uses the module-level searcher; stub
  // an empty result so the test focuses on the alerts-fetch path the
  // breaker hooks into.
  setPromQLSearcher(
    (async () =>
      ({
        series: [],
        fields: [],
      } as unknown)) as PromQLSearcher
  );
});
afterEach(() => {
  resetPromQLSearcherForTests();
});

describe('status aggregator + circuit breaker', () => {
  it('open breaker degrades all SLOs on the affected datasource to no_data', async () => {
    const cb = new DatasourceCircuitBreaker({ now: () => 0, failureThreshold: 1 });
    cb.recordFailure('ds-bad'); // opens immediately
    expect(cb.isOpen('ds-bad')).toBe(true);

    const transport = jest.fn(async () => ({ statusCode: 200, body: { data: { alerts: [] } } }));
    const client = ({ transport: { request: transport } } as unknown) as AlertingOSClient;

    const agg = new DirectQueryStatusAggregator(noopLogger(), cb);
    const docs = [makeDoc('a', 'ds-bad'), makeDoc('b', 'ds-bad'), makeDoc('c', 'ds-good')];
    const ctx = ctxFor({ 'ds-bad': dsFor('ds-bad'), 'ds-good': dsFor('ds-good') }, client);
    const results = await agg.aggregate(docs, ctx);

    // ds-bad rows degrade to no_data without paying the alerts fetch.
    expect(results.find((r) => r.sloId === 'a')?.state).toBe('no_data');
    expect(results.find((r) => r.sloId === 'b')?.state).toBe('no_data');

    // ds-good still issues a transport call (alerts).
    expect(
      transport.mock.calls.some((c) =>
        String((c[0] as { path?: string }).path ?? '').endsWith('/api/v1/alerts')
      )
    ).toBe(true);
  });

  it('a successful alerts fetch closes a previously open breaker', async () => {
    let now = 0;
    const cb = new DatasourceCircuitBreaker({
      now: () => now,
      failureThreshold: 3,
      cooldownMs: 60_000,
    });
    cb.recordFailure('ds-1');
    cb.recordFailure('ds-1');
    cb.recordFailure('ds-1');
    expect(cb.isOpen('ds-1')).toBe(true);

    // Past the cooldown — half-open.
    now = 70_000;
    expect(cb.isOpen('ds-1')).toBe(false);

    const transport = jest.fn(async () => ({ statusCode: 200, body: { data: { alerts: [] } } }));
    const client = ({ transport: { request: transport } } as unknown) as AlertingOSClient;
    const agg = new DirectQueryStatusAggregator(noopLogger(), cb);
    const docs = [makeDoc('a', 'ds-1')];
    const ctx = ctxFor({ 'ds-1': dsFor('ds-1') }, client);
    await agg.aggregate(docs, ctx);

    // Successful trial → closed; subsequent calls don't fast-fail.
    expect(cb.isOpen('ds-1')).toBe(false);
  });

  it('records a failure when the alerts fetch throws and re-opens after threshold', async () => {
    const cb = new DatasourceCircuitBreaker({ now: () => 0, failureThreshold: 2 });
    const transport = jest.fn(async () => {
      throw new Error('connection refused');
    });
    const client = ({ transport: { request: transport } } as unknown) as AlertingOSClient;
    const agg = new DirectQueryStatusAggregator(noopLogger(), cb);
    const docs = [makeDoc('a', 'ds-1')];
    const ctx = ctxFor({ 'ds-1': dsFor('ds-1') }, client);

    await agg.aggregate(docs, ctx);
    expect(cb.isOpen('ds-1')).toBe(false);
    await agg.aggregate(docs, ctx);
    expect(cb.isOpen('ds-1')).toBe(true);
  });

  it('a bad datasource does not affect other datasources isolation', async () => {
    const cb = new DatasourceCircuitBreaker({ now: () => 0, failureThreshold: 1 });
    cb.recordFailure('ds-bad');

    const transport = jest.fn(async () => ({ statusCode: 200, body: { data: { alerts: [] } } }));
    const client = ({ transport: { request: transport } } as unknown) as AlertingOSClient;
    const agg = new DirectQueryStatusAggregator(noopLogger(), cb);
    const docs = [makeDoc('a', 'ds-bad'), makeDoc('b', 'ds-good')];
    const ctx = ctxFor({ 'ds-bad': dsFor('ds-bad'), 'ds-good': dsFor('ds-good') }, client);
    await agg.aggregate(docs, ctx);

    expect(cb.isOpen('ds-bad')).toBe(true);
    expect(cb.isOpen('ds-good')).toBe(false);
  });

  it('without a breaker (legacy path), behavior is unchanged', async () => {
    const transport = jest.fn(async () => ({ statusCode: 200, body: { data: { alerts: [] } } }));
    const client = ({ transport: { request: transport } } as unknown) as AlertingOSClient;
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const docs = [makeDoc('a', 'ds-1')];
    const ctx = ctxFor({ 'ds-1': dsFor('ds-1') }, client);
    const results = await agg.aggregate(docs, ctx);
    expect(results).toHaveLength(1);
  });

  it('onTransition fires once per state change, not per call', async () => {
    const now = 0;
    const events: Array<[string, 'open' | 'close']> = [];
    const cb = new DatasourceCircuitBreaker({
      now: () => now,
      failureThreshold: 1,
      cooldownMs: 60_000,
      onTransition: (id, kind) => events.push([id, kind]),
    });
    const transport = jest.fn(async () => {
      throw new Error('boom');
    });
    const client = ({ transport: { request: transport } } as unknown) as AlertingOSClient;
    const agg = new DirectQueryStatusAggregator(noopLogger(), cb);
    const docs = [makeDoc('a', 'ds-1')];
    const ctx = ctxFor({ 'ds-1': dsFor('ds-1') }, client);
    await agg.aggregate(docs, ctx);
    await agg.aggregate(docs, ctx); // breaker already open; second call short-circuits, no extra event
    expect(events).toEqual([['ds-1', 'open']]);
  });
});

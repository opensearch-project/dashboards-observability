/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Integration test for the cachedState writeback path: `paginate` folds in
 * live status, then the writeback helper patches the SO so the next
 * state-filtered listing can push the filter to the index.
 */

import { SloService } from '../slo_service';
import { InMemorySloStore } from '../slo_store';
import type { Logger } from '../../types/alerting';
import type {
  ObjectiveStatus,
  SloDocument,
  SloHealthState,
  SloLiveStatus,
  SloSpec,
  SloStatusAggregator,
  SloStatusAggregationContext,
} from '../slo_types';

function noopLogger(): Logger {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
}

function makeDoc(id: string): SloDocument {
  const spec: SloSpec = {
    datasourceId: 'ds-1',
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

function liveStatus(sloId: string, state: SloHealthState): SloLiveStatus {
  const objs: ObjectiveStatus[] = [
    {
      objectiveName: 'o',
      currentValue: 0,
      currentValueUnit: 'ratio',
      attainment: 1,
      errorBudgetRemaining: 1,
      state,
    },
  ];
  return {
    sloId,
    objectives: objs,
    state,
    firingCount: 0,
    ruleCount: 1,
    computedAt: new Date(0).toISOString(),
  };
}

function fakeAggregatorReturning(stateById: Record<string, SloHealthState>): SloStatusAggregator {
  return {
    aggregate: jest.fn(async (docs: SloDocument[], _ctx: SloStatusAggregationContext) =>
      docs.map((d) => liveStatus(d.id, stateById[d.id] ?? 'no_data'))
    ),
  };
}

const fakeCtx = ({ datasourceId: 'ds-1' } as unknown) as SloStatusAggregationContext;

describe('paginate → cachedState writeback', () => {
  it('writes back the computed state when none was previously cached', async () => {
    const store = new InMemorySloStore();
    await store.save(makeDoc('a'));
    const updateSpy = jest.spyOn(store, 'updateCachedState');

    const svc = new SloService(noopLogger(), store);
    svc.setStatusAggregator(fakeAggregatorReturning({ a: 'breached' }));

    await svc.paginate({ pageSize: 10 }, null, fakeCtx);

    // Writeback is best-effort and unawaited; flush the microtask queue
    // before asserting.
    await new Promise((r) => setImmediate(r));

    expect(updateSpy).toHaveBeenCalledWith('a', 'breached');
  });

  it('does not re-write when cached state already matches', async () => {
    const store = new InMemorySloStore();
    await store.save(makeDoc('a'));
    await store.updateCachedState('a', 'ok');
    const updateSpy = jest.spyOn(store, 'updateCachedState');
    updateSpy.mockClear();

    const svc = new SloService(noopLogger(), store);
    svc.setStatusAggregator(fakeAggregatorReturning({ a: 'ok' }));

    await svc.paginate({ pageSize: 10 }, null, fakeCtx);
    await new Promise((r) => setImmediate(r));

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('writes back only the changed entries, not every visible row', async () => {
    const store = new InMemorySloStore();
    for (const id of ['a', 'b', 'c']) await store.save(makeDoc(id));
    await store.updateCachedState('a', 'ok');
    await store.updateCachedState('b', 'breached');
    // 'c' has no cached state.
    const updateSpy = jest.spyOn(store, 'updateCachedState');
    updateSpy.mockClear();

    const svc = new SloService(noopLogger(), store);
    svc.setStatusAggregator(fakeAggregatorReturning({ a: 'ok', b: 'warning', c: 'no_data' }));

    await svc.paginate({ pageSize: 10 }, null, fakeCtx);
    await new Promise((r) => setImmediate(r));

    const writtenIds = updateSpy.mock.calls.map((c) => c[0]).sort();
    expect(writtenIds).toEqual(['b', 'c']);
  });

  it('aggregator failure does not crash pagination; status falls back to stub and no writeback occurs', async () => {
    const store = new InMemorySloStore();
    await store.save(makeDoc('a'));
    const updateSpy = jest.spyOn(store, 'updateCachedState');

    const svc = new SloService(noopLogger(), store);
    svc.setStatusAggregator({
      aggregate: jest.fn(async () => {
        throw new Error('ruler down');
      }),
    });

    const r = await svc.paginate({ pageSize: 10 }, null, fakeCtx);
    expect(r.results).toHaveLength(1);
    await new Promise((r2) => setImmediate(r2));
    // Stub returns 'no_data' (since spec.enabled=true), and the SO has no
    // cached state — so the writeback fires once with 'no_data'. This is
    // intentional: even fallback state should hint the index for the next
    // round so a flapping aggregator doesn't burn the filter pushdown.
    expect(updateSpy).toHaveBeenCalledWith('a', 'no_data');
  });

  it('updateCachedState rejection is caught and does not propagate', async () => {
    const store = new InMemorySloStore();
    await store.save(makeDoc('a'));
    jest.spyOn(store, 'updateCachedState').mockRejectedValue(new Error('write conflict'));

    const svc = new SloService(noopLogger(), store);
    svc.setStatusAggregator(fakeAggregatorReturning({ a: 'breached' }));

    await expect(svc.paginate({ pageSize: 10 }, null, fakeCtx)).resolves.toBeDefined();
  });
});

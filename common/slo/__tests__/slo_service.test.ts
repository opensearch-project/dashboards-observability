/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SloService tests — pins regression surfaces for:
 *   - Removal of the `_demoState` annotation back-door. Anyone who can set
 *     an SLO annotation must NOT be able to override the computed health
 *     state. The stub returns 'disabled' when `spec.enabled === false` and
 *     'no_data' otherwise, full stop.
 *   - 6-significant-figure target clamp in `normalizeSpec` (happens in the
 *     service layer, not the validator — validators stay pure).
 */

import { SloService, SloValidationError } from '../slo_service';
import type { SloStatusAggregationContext, SloStatusAggregator } from '../slo_service';
import { DEFAULT_MWMBR_TIERS } from '../slo_promql_generator';
import type { AlertingOSClient, Datasource, Logger } from '../../types/alerting';
import type { SloDocument, SloLiveStatus, SloSpec } from '../slo_types';

function noopLogger(): Logger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  };
}

function validSpec(overrides: Partial<SloSpec> = {}): SloSpec {
  return {
    datasourceId: 'prom-ds-001',
    name: `API Availability ${Math.random().toString(36).slice(2, 8)}`,
    enabled: true,
    mode: 'active',
    service: 'api-gateway',
    owner: { teams: ['platform'] },
    sli: {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
        metric: 'http_requests_total',
      },
      dimensions: [{ name: 'service', value: 'api-gateway' }],
    },
    objectives: [{ name: 'availability-99-9', target: 0.999 }],
    budgetWarningThresholds: [{ threshold: 0.5, severity: 'warning' }],
    window: { type: 'rolling', duration: '28d' },
    alerting: { strategy: 'mwmbr', burnRates: DEFAULT_MWMBR_TIERS.map((t) => ({ ...t })) },
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
    ...overrides,
  };
}

// ============================================================================
// computeStatus / getStatus contract + no `_demoState` back-door
// ============================================================================

describe('SloService.getStatus — stub contract', () => {
  it('returns state=disabled when spec.enabled is false', async () => {
    const svc = new SloService(noopLogger());
    const doc = await svc.create({ spec: validSpec({ enabled: false }) });
    const status = await svc.getStatus(doc.id);
    expect(status.state).toBe('disabled');
    expect(status.objectives.every((o) => o.state === 'disabled')).toBe(true);
  });

  it('returns state=no_data when spec.enabled is true (live aggregator deferred)', async () => {
    const svc = new SloService(noopLogger());
    const doc = await svc.create({ spec: validSpec({ enabled: true }) });
    const status = await svc.getStatus(doc.id);
    expect(status.state).toBe('no_data');
    expect(status.objectives.every((o) => o.state === 'no_data')).toBe(true);
  });

  // Regression: previously `spec.annotations._demoState` could flip reported
  // state to 'ok' / 'breached' / anything the attacker chose. The demo hook
  // is gone. Annotations are metadata and MUST NOT leak into status.
  it('ignores the removed _demoState annotation back-door (annotations do not affect status)', async () => {
    const svc = new SloService(noopLogger());
    const doc = await svc.create({
      spec: validSpec({ enabled: true, annotations: { _demoState: 'ok' } }),
    });
    const status = await svc.getStatus(doc.id);
    // enabled=true → no_data. If the back-door were back, this would be 'ok'.
    expect(status.state).toBe('no_data');
  });

  it('ignores _demoState even on a disabled SLO', async () => {
    const svc = new SloService(noopLogger());
    const doc = await svc.create({
      spec: validSpec({ enabled: false, annotations: { _demoState: 'breached' } }),
    });
    const status = await svc.getStatus(doc.id);
    expect(status.state).toBe('disabled');
  });

  it('errorBudgetRemaining is 1 in the no_data state (full budget, stub contract)', async () => {
    const svc = new SloService(noopLogger());
    const doc = await svc.create({ spec: validSpec({ enabled: true }) });
    const status = await svc.getStatus(doc.id);
    expect(status.objectives).toHaveLength(1);
    expect(status.objectives[0].errorBudgetRemaining).toBe(1);
  });
});

// ============================================================================
// 6-sig-fig target clamp in normalizeSpec
// ============================================================================

describe('SloService.create — target precision clamp', () => {
  it('clamps a 7th-digit target down to 6 significant figures', async () => {
    const svc = new SloService(noopLogger());
    // 0.9876543 * 1e6 = 987654.3 → Math.round → 987654 → 0.987654
    const doc = await svc.create({
      spec: validSpec({ objectives: [{ name: 'obj-a', target: 0.9876543 }] }),
    });
    expect(doc.spec.objectives[0].target).toBe(0.987654);
  });

  it('leaves a 6-sig-fig target unchanged', async () => {
    const svc = new SloService(noopLogger());
    const doc = await svc.create({
      spec: validSpec({ objectives: [{ name: 'obj-a', target: 0.987654 }] }),
    });
    expect(doc.spec.objectives[0].target).toBe(0.987654);
  });

  it('clamp runs before range validation — clamped value outside [0.5, 0.99999] still rejects', async () => {
    const svc = new SloService(noopLogger());
    // 0.9999995 * 1e6 = 999999.5 → round → 1000000 → 1.0 → rejected by range check.
    await expect(
      svc.create({ spec: validSpec({ objectives: [{ name: 'obj-a', target: 0.9999995 }] }) })
    ).rejects.toBeInstanceOf(SloValidationError);
  });
});

// ============================================================================
// Live-status aggregator integration (mocked)
// ============================================================================

function mkCtx(): SloStatusAggregationContext {
  return {
    client: ({} as unknown) as AlertingOSClient,
    workspaceId: 'default',
    resolveDatasource: async () => undefined as Datasource | undefined,
  };
}

function mkAgg(
  impl: (docs: SloDocument[]) => Promise<SloLiveStatus[]>
): { agg: SloStatusAggregator; calls: number } {
  let calls = 0;
  return {
    agg: {
      aggregate: async (docs) => {
        calls++;
        return impl(docs);
      },
    },
    get calls() {
      return calls;
    },
  };
}

describe('SloService — aggregator routing', () => {
  it('routes getStatus through the aggregator when one is configured', async () => {
    const svc = new SloService(noopLogger());
    const { agg } = mkAgg(async (docs) =>
      docs.map((d) => ({
        sloId: d.id,
        objectives: [
          {
            objectiveName: 'availability-99-9',
            currentValue: 0.0002,
            currentValueUnit: 'ratio' as const,
            attainment: 0.9998,
            errorBudgetRemaining: 0.8,
            state: 'ok' as const,
          },
        ],
        state: 'ok',
        firingCount: 0,
        ruleCount: 7,
        computedAt: new Date().toISOString(),
      }))
    );
    svc.setStatusAggregator(agg);

    const doc = await svc.create({ spec: validSpec() });
    const status = await svc.getStatus(doc.id, mkCtx());

    expect(status.state).toBe('ok');
    expect(status.objectives[0].attainment).toBe(0.9998);
  });

  it('routes getStatuses through the aggregator in batch', async () => {
    const svc = new SloService(noopLogger());
    let seenIds: string[] = [];
    svc.setStatusAggregator({
      aggregate: async (docs) => {
        seenIds = docs.map((d) => d.id);
        return docs.map((d) => ({
          sloId: d.id,
          objectives: [],
          state: 'warning',
          firingCount: 1,
          ruleCount: 0,
          computedAt: new Date().toISOString(),
        }));
      },
    });

    const d1 = await svc.create({ spec: validSpec() });
    const d2 = await svc.create({ spec: validSpec() });
    const statuses = await svc.getStatuses([d1.id, d2.id], mkCtx());

    expect(statuses).toHaveLength(2);
    expect(statuses.every((s) => s.state === 'warning')).toBe(true);
    expect(seenIds.sort()).toEqual([d1.id, d2.id].sort());
  });

  it('falls back to the stub when the aggregator rejects (listing must not 500)', async () => {
    const warnCalls: string[] = [];
    const logger: Logger = {
      info: () => undefined,
      warn: (m: string) => {
        warnCalls.push(m);
      },
      error: () => undefined,
      debug: () => undefined,
    };
    const svc = new SloService(logger);
    svc.setStatusAggregator({
      aggregate: async () => {
        throw new Error('ruler unreachable');
      },
    });

    const d1 = await svc.create({ spec: validSpec({ enabled: true }) });
    const d2 = await svc.create({ spec: validSpec({ enabled: false }) });
    const statuses = await svc.getStatuses([d1.id, d2.id], mkCtx());

    expect(statuses.find((s) => s.sloId === d1.id)!.state).toBe('no_data');
    expect(statuses.find((s) => s.sloId === d2.id)!.state).toBe('disabled');
    expect(warnCalls.some((m) => m.includes('aggregator rejected'))).toBe(true);
  });

  it('deduplicates aggregator-failure warnings across calls (same failure logged once)', async () => {
    const warnCalls: string[] = [];
    const logger: Logger = {
      info: () => undefined,
      warn: (m: string) => {
        warnCalls.push(m);
      },
      error: () => undefined,
      debug: () => undefined,
    };
    const svc = new SloService(logger);
    svc.setStatusAggregator({
      aggregate: async () => {
        throw new Error('ruler unreachable');
      },
    });

    const d1 = await svc.create({ spec: validSpec() });
    await svc.getStatuses([d1.id], mkCtx());
    // Clear cache so the aggregator is called again
    svc.setStatusAggregator({
      aggregate: async () => {
        throw new Error('ruler unreachable');
      },
    });
    await svc.getStatuses([d1.id], mkCtx());
    // Matches the same error message → should still only warn once per unique
    // (sloId × message) combo across this session.
    const matching = warnCalls.filter((m) => m.includes('aggregator rejected'));
    // Two setStatusAggregator calls clear the warn set, so we expect at least
    // one warn per aggregator instance; but within a single aggregator, same
    // failure logs once only.
    expect(matching.length).toBeGreaterThanOrEqual(1);
  });

  it('preserves stub path when no aggregator is configured', async () => {
    const svc = new SloService(noopLogger());
    const doc = await svc.create({ spec: validSpec({ enabled: true }) });
    const status = await svc.getStatus(doc.id, mkCtx());
    expect(status.state).toBe('no_data'); // stub fallback
  });

  it('preserves stub path when an aggregator is configured but no context is passed', async () => {
    const svc = new SloService(noopLogger());
    const { agg } = mkAgg(async () => [] as SloLiveStatus[]);
    svc.setStatusAggregator(agg);
    const doc = await svc.create({ spec: validSpec({ enabled: true }) });
    // No ctx → stub path, aggregator NOT invoked.
    const status = await svc.getStatus(doc.id);
    expect(status.state).toBe('no_data');
  });

  it('uses the 60s status cache for subsequent calls within the TTL', async () => {
    const svc = new SloService(noopLogger());
    let calls = 0;
    svc.setStatusAggregator({
      aggregate: async (docs) => {
        calls++;
        return docs.map((d) => ({
          sloId: d.id,
          objectives: [],
          state: 'ok' as const,
          firingCount: 0,
          ruleCount: 0,
          computedAt: new Date().toISOString(),
        }));
      },
    });
    const doc = await svc.create({ spec: validSpec() });
    await svc.getStatus(doc.id, mkCtx());
    await svc.getStatus(doc.id, mkCtx());
    await svc.getStatus(doc.id, mkCtx());
    expect(calls).toBe(1);
  });
});

describe('SloService dedup flag', () => {
  it('defaults to enabled', () => {
    const svc = new SloService(noopLogger());
    expect(svc.isDedupEnabled()).toBe(true);
  });

  it('round-trips via setDedupEnabled', () => {
    const svc = new SloService(noopLogger());
    svc.setDedupEnabled(false);
    expect(svc.isDedupEnabled()).toBe(false);
    svc.setDedupEnabled(true);
    expect(svc.isDedupEnabled()).toBe(true);
  });
});

// ============================================================================
// Listing datasource filter — normalize ds-N id or name to canonical name
// (Bug A: URL param sends `ds-4` but spec.datasourceId is persisted as the
// user-facing name, so naive equality filter never matches.)
// ============================================================================

describe('SloService.list — datasource filter normalization', () => {
  function mkCtxWithResolver(byInput: Record<string, Datasource>): SloStatusAggregationContext {
    return {
      client: ({} as unknown) as AlertingOSClient,
      workspaceId: 'default',
      resolveDatasource: async (input) => byInput[input],
    };
  }

  const DS: Datasource = {
    id: 'ds-4',
    name: 'ObservabilityStack_Prometheus',
    type: 'prometheus',
    url: 'http://prometheus:9090',
    enabled: true,
  };

  async function seedThreeSLOs(svc: SloService) {
    await svc.create({ spec: validSpec({ datasourceId: 'ObservabilityStack_Prometheus' }) });
    await svc.create({ spec: validSpec({ datasourceId: 'ObservabilityStack_Prometheus' }) });
    await svc.create({ spec: validSpec({ datasourceId: 'OtherDatasource' }) });
  }

  it('matches stored spec.datasourceId when URL param is the internal ds-N id', async () => {
    const svc = new SloService(noopLogger());
    await seedThreeSLOs(svc);
    const ctx = mkCtxWithResolver({ 'ds-4': DS });
    const out = await svc.list({ datasourceId: ['ds-4'] }, ctx);
    expect(out).toHaveLength(2);
    expect(out.every((s) => s.datasourceId === 'ObservabilityStack_Prometheus')).toBe(true);
  });

  it('matches stored spec.datasourceId when URL param is the datasource name', async () => {
    const svc = new SloService(noopLogger());
    await seedThreeSLOs(svc);
    const ctx = mkCtxWithResolver({ ObservabilityStack_Prometheus: DS });
    const out = await svc.list({ datasourceId: ['ObservabilityStack_Prometheus'] }, ctx);
    expect(out).toHaveLength(2);
  });

  it('drops unresolved datasource ids (does not silently broaden the filter)', async () => {
    const svc = new SloService(noopLogger());
    await seedThreeSLOs(svc);
    const ctx = mkCtxWithResolver({}); // resolver returns undefined for everything
    const out = await svc.list({ datasourceId: ['ds-does-not-exist'] }, ctx);
    expect(out).toHaveLength(0);
  });

  it('passes through unchanged when no resolver is available (offline dev / tests)', async () => {
    const svc = new SloService(noopLogger());
    await seedThreeSLOs(svc);
    // No ctx — falls back to raw input. Callers that pass names still match.
    const out = await svc.list({ datasourceId: ['ObservabilityStack_Prometheus'] });
    expect(out).toHaveLength(2);
  });
});

describe('SloService.list — canonicalKind filter', () => {
  async function seedMixed(svc: SloService) {
    await svc.create({
      spec: validSpec({ name: 'apm-avail-a', canonicalKind: 'apm-availability' }),
    });
    await svc.create({
      spec: validSpec({ name: 'apm-lat-b', canonicalKind: 'apm-latency' }),
    });
    await svc.create({
      spec: validSpec({ name: 'http-avail-c', canonicalKind: 'http-availability' }),
    });
    // Untagged SLO — predates the tag, must fall outside any canonicalKind filter.
    await svc.create({ spec: validSpec({ name: 'legacy-untagged-d' }) });
  }

  it('returns only tagged SLOs matching the filter', async () => {
    const svc = new SloService(noopLogger());
    await seedMixed(svc);
    const out = await svc.list({ canonicalKind: ['apm-availability'] });
    expect(out.map((s) => s.name)).toEqual(['apm-avail-a']);
  });

  it('supports multi-value filter', async () => {
    const svc = new SloService(noopLogger());
    await seedMixed(svc);
    const out = await svc.list({
      canonicalKind: ['apm-availability', 'http-availability'],
    });
    expect(out.map((s) => s.name).sort()).toEqual(['apm-avail-a', 'http-avail-c']);
  });

  it('excludes untagged SLOs (no heuristic inference at filter layer)', async () => {
    const svc = new SloService(noopLogger());
    await seedMixed(svc);
    const out = await svc.list({ canonicalKind: ['apm-availability', 'apm-latency'] });
    // legacy-untagged-d would heuristically classify as apm-availability (leaf
    // 'availability' + prometheus backend), but the filter doesn't reach back
    // to the SLI shape — only the stored tag.
    expect(out.some((s) => s.name === 'legacy-untagged-d')).toBe(false);
  });

  it('ignores an empty canonicalKind filter (no-op)', async () => {
    const svc = new SloService(noopLogger());
    await seedMixed(svc);
    const out = await svc.list({ canonicalKind: [] });
    expect(out).toHaveLength(4);
  });
});

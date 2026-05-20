/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable max-classes-per-file */

/**
 * Phase 3 W3.11 — reconciler dedup extensions.
 *
 *   - Dangling-ref detection: a refcount>0 entry in the registry that no SO
 *     currently claims surfaces in `result.danglingRefs` and bumps the
 *     `danglingRefs` metric. The refcount is NOT auto-decremented — the
 *     reconciler is observational for this signal.
 *   - Grace-period sweep: a zero-ref entry whose `zeroSinceAt` is older than
 *     `recordingGraceMs` gets its recording group + ref SO deleted. Newly-
 *     zero entries within the grace window are left alone.
 */

import { createSloReconciler } from '../reconciler';
import { createReconcilerMetrics } from '../reconciler_metrics';
import { InMemorySloStore } from '../../../../common/slo/slo_store';
import { InMemoryDatasourceService } from '../../alerting/datasource_service';
import type { RulerClient } from '../ruler_client';
import type { SloRuleRefStore, SloRuleRefDoc } from '../slo_rule_ref_store';
import type { AlertingOSClient, Datasource, Logger } from '../../../../common/types/alerting/types';
import type { GeneratedRuleGroup, SloDocument, SloSpec } from '../../../../common/slo/slo_types';
import type { RuleHealthChecker } from '../rule_health_checker';

function noopLogger(): Logger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  };
}

class FakeRuler implements RulerClient {
  public deletes: Array<{ namespace: string; groupName: string }> = [];
  public groups = new Map<string, GeneratedRuleGroup>();
  async upsertRuleGroup(
    _c: AlertingOSClient,
    _ds: Datasource,
    namespace: string,
    group: GeneratedRuleGroup
  ): Promise<void> {
    this.groups.set(`${namespace}|${group.groupName}`, group);
  }
  async deleteRuleGroup(
    _c: AlertingOSClient,
    _ds: Datasource,
    namespace: string,
    groupName: string
  ): Promise<void> {
    this.deletes.push({ namespace, groupName });
    this.groups.delete(`${namespace}|${groupName}`);
  }
  async getRuleGroup(): Promise<GeneratedRuleGroup | null> {
    return null;
  }
  async listRuleGroups(
    _c: AlertingOSClient,
    _ds: Datasource,
    namespace: string
  ): Promise<GeneratedRuleGroup[]> {
    const prefix = `${namespace}|`;
    const out: GeneratedRuleGroup[] = [];
    for (const [k, v] of this.groups.entries()) {
      if (k.startsWith(prefix)) out.push(v);
    }
    return out;
  }
  hasGroup(namespace: string, groupName: string): boolean {
    return this.groups.has(`${namespace}|${groupName}`);
  }
  seed(namespace: string, group: GeneratedRuleGroup): void {
    this.groups.set(`${namespace}|${group.groupName}`, group);
  }
}

class FakeRefStore {
  private readonly entries = new Map<string, SloRuleRefDoc>();
  private key(ws: string, ds: string, fp: string) {
    return `rule-ref:${ws}:${ds}:${fp}`;
  }
  seed(input: {
    workspaceId: string;
    datasourceId: string;
    fingerprint: string;
    refcount: number;
    groupName?: string;
    zeroSinceAt?: string;
  }) {
    const id = this.key(input.workspaceId, input.datasourceId, input.fingerprint);
    this.entries.set(id, {
      id,
      attributes: {
        workspaceId: input.workspaceId,
        datasourceId: input.datasourceId,
        fingerprint: input.fingerprint,
        fingerprintVersion: 'v1',
        refcount: input.refcount,
        groupName: input.groupName ?? `slo:rec:${input.fingerprint}`,
        namespace: `slo-generated-${input.workspaceId}`,
        zeroSinceAt: input.zeroSinceAt,
        createdAt: '2026-04-01T00:00:00Z',
        updatedAt: '2026-04-01T00:00:00Z',
      },
    });
  }
  async get(ws: string, ds: string, fp: string) {
    return this.entries.get(this.key(ws, ds, fp)) ?? null;
  }
  async listByDatasource(workspaceId: string, datasourceId: string) {
    const out: SloRuleRefDoc[] = [];
    for (const entry of this.entries.values()) {
      const a = entry.attributes;
      if (a.workspaceId === workspaceId && a.datasourceId === datasourceId) out.push(entry);
    }
    return out;
  }
  async listStaleZero() {
    return [];
  }
  async remove(ws: string, ds: string, fp: string) {
    return this.entries.delete(this.key(ws, ds, fp));
  }
  async incrementRef() {
    throw new Error('not implemented');
  }
  async decrementRef() {
    throw new Error('not implemented');
  }
  has(ws: string, ds: string, fp: string) {
    return this.entries.has(this.key(ws, ds, fp));
  }
}

function validSpec(overrides: Partial<SloSpec> = {}): SloSpec {
  return {
    datasourceId: 'prom-ds-001',
    name: 'API Availability',
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
    ...overrides,
  };
}

function doc(
  id: string,
  spec: SloSpec,
  recordingFingerprints: Record<string, string>
): SloDocument {
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
        rulerNamespace: `slo-generated-${spec.datasourceId}`,
        recordingFingerprints,
        alertGroupName: `slo:alerts:${id}`,
        needsRedeploy: false,
      },
    },
  };
}

async function makeHarness(nowMs: number = Date.UTC(2026, 4, 1)) {
  const logger = noopLogger();
  const store = new InMemorySloStore();
  const ruler = new FakeRuler();
  const refStore = new FakeRefStore();
  const datasourceService = new InMemoryDatasourceService(logger);
  const ds = await datasourceService.create({
    name: 'prom',
    type: 'prometheus',
    url: '',
    enabled: true,
    directQueryName: 'prom-connection',
  });
  const client = ({
    transport: { request: () => Promise.resolve({}) },
  } as unknown) as AlertingOSClient;
  const metrics = createReconcilerMetrics(logger);
  const health: jest.Mocked<Pick<RuleHealthChecker, 'invalidate' | 'check'>> = {
    invalidate: jest.fn(),
    check: jest.fn(),
  };
  const reconciler = createSloReconciler({
    store,
    ruler,
    healthChecker: (health as unknown) as RuleHealthChecker,
    datasourceService,
    logger,
    metrics,
    buildClient: () => client,
    refStore: (refStore as unknown) as SloRuleRefStore,
    // Use a fake clock so `zeroSinceAt` math is deterministic.
    now: () => new Date(nowMs),
    recordingGraceMs: 24 * 60 * 60_000,
    intervalMs: 60_000_000,
  });
  return { store, ruler, refStore, metrics, reconciler, ds };
}

describe('SloReconciler — dedup extensions (W3.11)', () => {
  it('dangling ref: refcount > 0 with no SO claims surfaces, refcount unchanged', async () => {
    const { refStore, reconciler, metrics, ds } = await makeHarness();
    // Seed a registry entry but no SO referencing it.
    refStore.seed({
      workspaceId: ds.id,
      datasourceId: ds.id,
      fingerprint: 'aaaaaaaaaaaaaaaa',
      refcount: 1,
    });
    const result = await reconciler.reconcileOnce({ datasourceIds: [ds.id] });
    expect(result.danglingRefs).toHaveLength(1);
    expect(result.danglingRefs[0]).toMatchObject({
      workspaceId: ds.id,
      datasourceId: ds.id,
      fingerprint: 'aaaaaaaaaaaaaaaa',
      refcount: 1,
    });
    expect(metrics.snapshot().danglingRefs).toBe(1);
    // Ref SO still present.
    expect(refStore.has(ds.id, ds.id, 'aaaaaaaaaaaaaaaa')).toBe(true);
    // No grace deletion.
    expect(result.graceDeletions).toEqual([]);
  });

  it('zero-ref INSIDE grace window: not deleted', async () => {
    const nowMs = Date.UTC(2026, 4, 1, 12);
    const zeroSinceAt = new Date(nowMs - 60 * 60_000).toISOString(); // 1h ago, < 24h
    const { refStore, ruler, reconciler, metrics, ds } = await makeHarness(nowMs);
    ruler.seed(`slo-generated-${ds.id}`, {
      groupName: 'slo:rec:aaaaaaaaaaaaaaaa',
      interval: 60,
      rules: [],
      yaml: '',
    });
    refStore.seed({
      workspaceId: ds.id,
      datasourceId: ds.id,
      fingerprint: 'aaaaaaaaaaaaaaaa',
      refcount: 0,
      zeroSinceAt,
    });
    const result = await reconciler.reconcileOnce({ datasourceIds: [ds.id] });
    expect(result.graceDeletions).toEqual([]);
    expect(metrics.snapshot().graceDeletions).toBe(0);
    expect(refStore.has(ds.id, ds.id, 'aaaaaaaaaaaaaaaa')).toBe(true);
    expect(ruler.hasGroup(`slo-generated-${ds.id}`, 'slo:rec:aaaaaaaaaaaaaaaa')).toBe(true);
  });

  it('zero-ref PAST grace window: recording group + ref SO deleted, counter ticks', async () => {
    const nowMs = Date.UTC(2026, 4, 1, 12);
    const zeroSinceAt = new Date(nowMs - 25 * 60 * 60_000).toISOString(); // 25h ago
    const { refStore, ruler, reconciler, metrics, ds } = await makeHarness(nowMs);
    ruler.seed(`slo-generated-${ds.id}`, {
      groupName: 'slo:rec:aaaaaaaaaaaaaaaa',
      interval: 60,
      rules: [],
      yaml: '',
    });
    refStore.seed({
      workspaceId: ds.id,
      datasourceId: ds.id,
      fingerprint: 'aaaaaaaaaaaaaaaa',
      refcount: 0,
      zeroSinceAt,
    });
    const result = await reconciler.reconcileOnce({ datasourceIds: [ds.id] });
    expect(result.graceDeletions).toHaveLength(1);
    expect(result.graceDeletions[0]).toMatchObject({
      workspaceId: ds.id,
      datasourceId: ds.id,
      fingerprint: 'aaaaaaaaaaaaaaaa',
      namespace: `slo-generated-${ds.id}`,
      groupName: 'slo:rec:aaaaaaaaaaaaaaaa',
    });
    expect(metrics.snapshot().graceDeletions).toBe(1);
    expect(refStore.has(ds.id, ds.id, 'aaaaaaaaaaaaaaaa')).toBe(false);
    expect(ruler.hasGroup(`slo-generated-${ds.id}`, 'slo:rec:aaaaaaaaaaaaaaaa')).toBe(false);
  });

  it('claimed fingerprint is NOT flagged as dangling or grace-deleted', async () => {
    const { store, refStore, ruler, reconciler, ds } = await makeHarness();
    const spec = validSpec({ datasourceId: ds.id });
    // SO references fingerprint X.
    await store.save(doc('slo-a', spec, { [spec.objectives[0].name]: 'aaaaaaaaaaaaaaaa' }));
    // Registry: refcount 1 for that same fingerprint — matches the SO.
    refStore.seed({
      workspaceId: ds.id,
      datasourceId: ds.id,
      fingerprint: 'aaaaaaaaaaaaaaaa',
      refcount: 1,
    });
    ruler.seed(`slo-generated-${ds.id}`, {
      groupName: 'slo:rec:aaaaaaaaaaaaaaaa',
      interval: 60,
      rules: [],
      yaml: '',
    });
    ruler.seed(`slo-generated-${ds.id}`, {
      groupName: 'slo:alerts:slo-a',
      interval: 60,
      rules: [],
      yaml: '',
    });
    const result = await reconciler.reconcileOnce({ datasourceIds: [ds.id] });
    expect(result.danglingRefs).toEqual([]);
    expect(result.graceDeletions).toEqual([]);
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 3 W3.8 — SloService dedup-aware create/update/delete.
 *
 * Pins the registry+ruler contract the plan calls out:
 *   - First create: increments ref from 0→1 and upserts the shared recording
 *     group; per-SLO alert group gets upserted too.
 *   - Second create sharing the same SLI fingerprint: ref goes 1→2, recording
 *     group is NOT re-upserted, alert group is upserted (separate group).
 *   - Second create with a different SLI: new ref created, new recording group.
 *   - Update without fingerprint change: refs unchanged, recording group NOT
 *     upserted, alert group re-upserted (spec fields like budget thresholds
 *     can change).
 *   - Update that moves one SLO to a new fingerprint: refcount for the old fp
 *     drops; refcount for the new fp rises; recording-group upserts track.
 *     The legacy recording group is NOT deleted synchronously.
 *   - Convergence: A edits to match B's fingerprint → refcount 1→2, no new
 *     recording group ever written.
 *   - Delete with shared fp: ref decrements, recording group preserved.
 *   - Delete last user: ref drops to 0 (no synchronous recording delete).
 *   - SO save failure rolls back refs + recording group(s) we just wrote.
 *
 * Uses a minimal in-memory refstore implementing the `SloRuleRefStoreLite`
 * surface the service consumes — no OSD SavedObjectsClient required.
 */

/* eslint-disable max-classes-per-file */
import { SloDeployContext, SloRulerClient, SloRuleRefStoreLite, SloService } from '../slo_service';
import { InMemorySloStore } from '../slo_store';
import {
  DEFAULT_MWMBR_TIERS,
  dedupAlertGroupName,
  dedupRecordingGroupName,
} from '../slo_promql_generator';
import { computeSliFingerprint } from '../slo_sli_fingerprint';
import type { AlertingOSClient, Datasource, Logger } from '../../types/alerting/types';
import type { GeneratedRuleGroup, ISloStore, SloSpec } from '../slo_types';

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

/**
 * Minimal in-memory ref store. Keeps the tuple → refcount in a Map so tests
 * can assert transitions directly.
 */
class FakeRefStore implements SloRuleRefStoreLite {
  public readonly refs = new Map<string, { refcount: number; zeroSinceAt?: string }>();
  private key(ws: string, ds: string, fp: string): string {
    return `${ws}|${ds}|${fp}`;
  }
  async get(ws: string, ds: string, fp: string) {
    const doc = this.refs.get(this.key(ws, ds, fp));
    if (!doc) return null;
    return { attributes: { refcount: doc.refcount } };
  }
  async incrementRef(input: {
    workspaceId: string;
    datasourceId: string;
    fingerprint: string;
    fingerprintVersion: string;
    groupName: string;
    namespace: string;
  }): Promise<{ wasZero: boolean }> {
    const k = this.key(input.workspaceId, input.datasourceId, input.fingerprint);
    const existing = this.refs.get(k);
    if (!existing) {
      this.refs.set(k, { refcount: 1 });
      return { wasZero: true };
    }
    const wasZero = existing.refcount === 0;
    existing.refcount += 1;
    existing.zeroSinceAt = undefined;
    return { wasZero };
  }
  async decrementRef(input: {
    workspaceId: string;
    datasourceId: string;
    fingerprint: string;
  }): Promise<{ droppedToZero: boolean; underflow: boolean }> {
    const k = this.key(input.workspaceId, input.datasourceId, input.fingerprint);
    const existing = this.refs.get(k);
    if (!existing) return { droppedToZero: false, underflow: true };
    if (existing.refcount <= 0) return { droppedToZero: false, underflow: true };
    existing.refcount -= 1;
    const droppedToZero = existing.refcount === 0;
    if (droppedToZero) existing.zeroSinceAt = new Date().toISOString();
    return { droppedToZero, underflow: false };
  }
  refcount(ws: string, ds: string, fp: string): number {
    return this.refs.get(this.key(ws, ds, fp))?.refcount ?? 0;
  }
}

class FakeRuler implements SloRulerClient {
  public upserts: Array<{ namespace: string; group: GeneratedRuleGroup }> = [];
  public deletes: Array<{ namespace: string; groupName: string }> = [];
  private groups = new Map<string, GeneratedRuleGroup>();
  public upsertError: Error | null = null;
  public deleteError: Error | null = null;
  private key(ns: string, name: string): string {
    return `${ns}|${name}`;
  }
  async upsertRuleGroup(
    _c: AlertingOSClient,
    _ds: Datasource,
    namespace: string,
    group: GeneratedRuleGroup
  ): Promise<void> {
    if (this.upsertError) throw this.upsertError;
    this.upserts.push({ namespace, group });
    this.groups.set(this.key(namespace, group.groupName), group);
  }
  async deleteRuleGroup(
    _c: AlertingOSClient,
    _ds: Datasource,
    namespace: string,
    groupName: string
  ): Promise<void> {
    if (this.deleteError) throw this.deleteError;
    this.deletes.push({ namespace, groupName });
    this.groups.delete(this.key(namespace, groupName));
  }
  hasGroup(namespace: string, groupName: string): boolean {
    return this.groups.has(this.key(namespace, groupName));
  }
  upsertsOfName(groupName: string): number {
    return this.upserts.filter((u) => u.group.groupName === groupName).length;
  }
}

function makeHarness() {
  const store = new InMemorySloStore();
  const ruler = new FakeRuler();
  const refStore = new FakeRefStore();
  const svc = new SloService(noopLogger(), store);
  svc.setDedupEnabled(true);
  svc.setRuleRefStore(refStore);
  const datasource: Datasource = {
    id: 'prom-ds-001',
    name: 'prom',
    type: 'prometheus',
    url: '',
    enabled: true,
    directQueryName: 'prom-connection',
  };
  const client = ({
    transport: { request: () => Promise.resolve({}) },
  } as unknown) as AlertingOSClient;
  const deploy: SloDeployContext = { ruler, client, datasource, workspaceId: 'ws-001' };
  return { store, ruler, refStore, svc, deploy, namespace: 'slo-generated-ws-001' };
}

// ============================================================================
// Tests
// ============================================================================

describe('SloService dedup — create (W3.8)', () => {
  it('first create with prometheus SLI upserts 1 recording group + 1 alert group; ref goes 0→1', async () => {
    const { svc, ruler, refStore, deploy, namespace } = makeHarness();
    const spec = validSpec();
    const doc = await svc.create({ spec }, 'alice', deploy);
    const fp = computeSliFingerprint(spec.datasourceId, spec.sli, spec.objectives[0]);
    expect(fp).not.toBeNull();
    const recGroupName = dedupRecordingGroupName(fp!);
    const alertGroupName = dedupAlertGroupName(spec.name, 'ws-001', doc.id);
    expect(ruler.upsertsOfName(recGroupName)).toBe(1);
    expect(ruler.upsertsOfName(alertGroupName)).toBe(1);
    expect(refStore.refcount('ws-001', spec.datasourceId, fp!)).toBe(1);
    expect(ruler.hasGroup(namespace, recGroupName)).toBe(true);
    expect(ruler.hasGroup(namespace, alertGroupName)).toBe(true);
    // SO carries the dedup fields
    const prov = doc.status.provisioning;
    expect(prov.backend).toBe('prometheus');
    const promProv = prov.backend === 'prometheus' ? prov : undefined;
    expect(promProv?.recordingFingerprints).toEqual({
      [spec.objectives[0].name]: fp,
    });
    expect(promProv?.alertGroupName).toBe(alertGroupName);
    expect(promProv?.needsRedeploy).toBe(false);
  });

  it('second create sharing the same fingerprint: ref 1→2, recording NOT re-upserted', async () => {
    const { svc, ruler, refStore, deploy } = makeHarness();
    const spec = validSpec();
    await svc.create({ spec }, 'alice', deploy);
    const fp = computeSliFingerprint(spec.datasourceId, spec.sli, spec.objectives[0])!;
    const recGroupName = dedupRecordingGroupName(fp);
    const upsertsBefore = ruler.upsertsOfName(recGroupName);
    // Second create: different name so name-uniqueness passes, same SLI.
    await svc.create({ spec: { ...spec, name: 'API Availability 2' } }, 'alice', deploy);
    expect(refStore.refcount('ws-001', spec.datasourceId, fp)).toBe(2);
    expect(ruler.upsertsOfName(recGroupName)).toBe(upsertsBefore);
  });

  it('second create with a different SLI: creates new ref + new recording group', async () => {
    const { svc, ruler, refStore, deploy } = makeHarness();
    const specA = validSpec({ name: 'A' });
    const specB = validSpec({
      name: 'B',
      sli: {
        type: 'single',
        definition: {
          backend: 'prometheus',
          type: 'availability',
          calcMethod: 'events',
          metric: 'other_requests_total',
        },
        dimensions: [{ name: 'service', value: 'api-gateway' }],
      },
    });
    await svc.create({ spec: specA }, 'alice', deploy);
    await svc.create({ spec: specB }, 'alice', deploy);
    const fpA = computeSliFingerprint(specA.datasourceId, specA.sli, specA.objectives[0])!;
    const fpB = computeSliFingerprint(specB.datasourceId, specB.sli, specB.objectives[0])!;
    expect(fpA).not.toBe(fpB);
    expect(refStore.refcount('ws-001', specA.datasourceId, fpA)).toBe(1);
    expect(refStore.refcount('ws-001', specB.datasourceId, fpB)).toBe(1);
    expect(ruler.upsertsOfName(dedupRecordingGroupName(fpA))).toBe(1);
    expect(ruler.upsertsOfName(dedupRecordingGroupName(fpB))).toBe(1);
  });

  it('concurrent create same fingerprint: final refcount is 2, only one recording upsert happens', async () => {
    const { svc, ruler, refStore, deploy } = makeHarness();
    const specA = validSpec({ name: 'A' });
    const specB = validSpec({ name: 'B' }); // same SLI
    await Promise.all([
      svc.create({ spec: specA }, 'alice', deploy),
      svc.create({ spec: specB }, 'alice', deploy),
    ]);
    const fp = computeSliFingerprint(specA.datasourceId, specA.sli, specA.objectives[0])!;
    expect(refStore.refcount('ws-001', specA.datasourceId, fp)).toBe(2);
    // Byte-equal output means re-upsert is a no-op; we still skip when wasZero=false.
    expect(ruler.upsertsOfName(dedupRecordingGroupName(fp))).toBe(1);
  });
});

describe('SloService dedup — update (W3.8)', () => {
  it('no-op update (same fingerprint): refs unchanged, recording group NOT re-upserted; alert group re-upserted', async () => {
    const { svc, ruler, refStore, deploy } = makeHarness();
    const spec = validSpec();
    const created = await svc.create({ spec }, 'alice', deploy);
    const fp = computeSliFingerprint(spec.datasourceId, spec.sli, spec.objectives[0])!;
    const recGroupName = dedupRecordingGroupName(fp);
    const alertGroupName =
      created.status.provisioning.backend === 'prometheus'
        ? created.status.provisioning.alertGroupName!
        : '';
    const recBefore = ruler.upsertsOfName(recGroupName);
    const alertBefore = ruler.upsertsOfName(alertGroupName);
    await svc.update(
      created.id,
      { spec: { description: 'updated' }, version: created.status.version },
      'alice',
      deploy
    );
    expect(refStore.refcount('ws-001', spec.datasourceId, fp)).toBe(1);
    expect(ruler.upsertsOfName(recGroupName)).toBe(recBefore);
    expect(ruler.upsertsOfName(alertGroupName)).toBe(alertBefore + 1);
  });

  it('fingerprint-changing update: old ref decrements, new ref increments, old recording preserved', async () => {
    const { svc, ruler, refStore, deploy } = makeHarness();
    const specA = validSpec({ name: 'A' });
    const specB = validSpec({ name: 'B' }); // shares SLI with A
    const docA = await svc.create({ spec: specA }, 'alice', deploy);
    await svc.create({ spec: specB }, 'alice', deploy);
    const fpOld = computeSliFingerprint(specA.datasourceId, specA.sli, specA.objectives[0])!;
    expect(refStore.refcount('ws-001', specA.datasourceId, fpOld)).toBe(2);

    // Edit A's SLI: new fingerprint, B still shares the old one.
    const nextSpec: Partial<SloSpec> = {
      sli: {
        type: 'single',
        definition: {
          backend: 'prometheus',
          type: 'availability',
          calcMethod: 'events',
          metric: 'different_requests_total',
        },
        dimensions: specA.sli.type === 'single' ? specA.sli.dimensions : [],
      },
    };
    await svc.update(docA.id, { spec: nextSpec, version: docA.status.version }, 'alice', deploy);
    const fpNew = computeSliFingerprint(specA.datasourceId, nextSpec.sli!, specA.objectives[0])!;
    expect(fpNew).not.toBe(fpOld);
    expect(refStore.refcount('ws-001', specA.datasourceId, fpOld)).toBe(1);
    expect(refStore.refcount('ws-001', specA.datasourceId, fpNew)).toBe(1);
    // No synchronous deletion of the old recording group.
    expect(ruler.deletes.some((d) => d.groupName === dedupRecordingGroupName(fpOld))).toBe(false);
    expect(ruler.hasGroup('slo-generated-ws-001', dedupRecordingGroupName(fpOld))).toBe(true);
    expect(ruler.hasGroup('slo-generated-ws-001', dedupRecordingGroupName(fpNew))).toBe(true);
  });

  it('convergence: A edits to match B → refcount 1→2, no new recording group ever written', async () => {
    const { svc, ruler, refStore, deploy } = makeHarness();
    const specA = validSpec({
      name: 'A',
      sli: {
        type: 'single',
        definition: {
          backend: 'prometheus',
          type: 'availability',
          calcMethod: 'events',
          metric: 'a_metric',
        },
        dimensions: [{ name: 'service', value: 'api-gateway' }],
      },
    });
    const specB = validSpec({
      name: 'B',
      sli: {
        type: 'single',
        definition: {
          backend: 'prometheus',
          type: 'availability',
          calcMethod: 'events',
          metric: 'b_metric',
        },
        dimensions: [{ name: 'service', value: 'api-gateway' }],
      },
    });
    const docA = await svc.create({ spec: specA }, 'alice', deploy);
    await svc.create({ spec: specB }, 'alice', deploy);

    const fpB = computeSliFingerprint(specB.datasourceId, specB.sli, specB.objectives[0])!;
    const recB = dedupRecordingGroupName(fpB);
    const recBUpsertsBefore = ruler.upsertsOfName(recB);

    // A edits its SLI to match B's — should converge on fpB.
    await svc.update(
      docA.id,
      { spec: { sli: specB.sli }, version: docA.status.version },
      'alice',
      deploy
    );
    expect(refStore.refcount('ws-001', specB.datasourceId, fpB)).toBe(2);
    // B's recording group should NOT have been re-upserted (refcount 1→2,
    // so wasZero is false on the second increment).
    expect(ruler.upsertsOfName(recB)).toBe(recBUpsertsBefore);
  });
});

describe('SloService dedup — delete (W3.8)', () => {
  it('delete with peer sharing fp: ref decrements, recording group preserved (never synchronously deleted)', async () => {
    const { svc, ruler, refStore, deploy } = makeHarness();
    const specA = validSpec({ name: 'A' });
    const specB = validSpec({ name: 'B' });
    const docA = await svc.create({ spec: specA }, 'alice', deploy);
    await svc.create({ spec: specB }, 'alice', deploy);
    const fp = computeSliFingerprint(specA.datasourceId, specA.sli, specA.objectives[0])!;
    expect(refStore.refcount('ws-001', specA.datasourceId, fp)).toBe(2);
    await svc.delete(docA.id, deploy);
    expect(refStore.refcount('ws-001', specA.datasourceId, fp)).toBe(1);
    expect(ruler.hasGroup('slo-generated-ws-001', dedupRecordingGroupName(fp))).toBe(true);
    expect(ruler.deletes.some((d) => d.groupName === dedupRecordingGroupName(fp))).toBe(false);
  });

  it('delete last user: ref drops to 0, recording group preserved for grace sweep, alert group deleted', async () => {
    const { svc, ruler, refStore, deploy, namespace } = makeHarness();
    const spec = validSpec();
    const doc = await svc.create({ spec }, 'alice', deploy);
    const fp = computeSliFingerprint(spec.datasourceId, spec.sli, spec.objectives[0])!;
    const alertGroupName = dedupAlertGroupName(spec.name, 'ws-001', doc.id);
    await svc.delete(doc.id, deploy);
    expect(refStore.refcount('ws-001', spec.datasourceId, fp)).toBe(0);
    // Alert group deleted synchronously.
    expect(ruler.deletes.some((d) => d.groupName === alertGroupName)).toBe(true);
    // Recording group survives.
    expect(ruler.hasGroup(namespace, dedupRecordingGroupName(fp))).toBe(true);
  });
});

describe('SloService dedup — rollback on SO save failure (W3.8)', () => {
  it('create: SO save failure rolls back refs + recording group we just wrote', async () => {
    const { ruler, refStore, deploy } = makeHarness();
    const store: ISloStore = {
      get: async () => null,
      list: async () => [],
      save: async () => {
        throw new Error('SO write failed: index rate limited');
      },
      delete: async () => true,
    };
    const svc = new SloService(noopLogger(), store);
    svc.setDedupEnabled(true);
    svc.setRuleRefStore(refStore);
    const spec = validSpec();
    await expect(svc.create({ spec }, 'alice', deploy)).rejects.toThrow(/SO write failed/);
    const fp = computeSliFingerprint(spec.datasourceId, spec.sli, spec.objectives[0])!;
    expect(refStore.refcount('ws-001', spec.datasourceId, fp)).toBe(0);
    // Rollback should delete both the recording group (since ref dropped back
    // to 0 and we created it this call) and the alert group.
    const recGroup = dedupRecordingGroupName(fp);
    expect(ruler.deletes.some((d) => d.groupName === recGroup)).toBe(true);
  });
});

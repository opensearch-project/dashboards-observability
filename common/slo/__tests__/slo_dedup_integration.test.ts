/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 3 W3.15 — dedup integration test.
 *
 * Exercises the dedup path end-to-end:
 *   - SloService (W3.8) + FakeRulerClient + FakeRefStore wired together with
 *     the real generator + provenance modules.
 *   - Reconciler (W3.11) is driven through `reconcileOnce` to verify the
 *     grace-period sweep deletes zero-ref recording groups + their ref SOs
 *     after `observability.slo.recordingGraceMs` has elapsed.
 *
 * Scenarios:
 *   1. 10 SLOs with controlled SLI overlap → Cortex sees exactly
 *      `uniqueFingerprints + 10` upserts (one shared recording group per
 *      fp, one alert group per SLO).
 *   2. Update flow: moving one SLO to a new SLI increments the new fp,
 *      decrements the old fp. The old recording group stays on Cortex
 *      until the grace sweep.
 *   3. Grace deletion under a virtual clock — delete every SLO sharing an
 *      fp, advance the clock past `recordingGraceMs`, reconcile, assert
 *      the recording group + ref SO are gone.
 */

import { SloDeployContext, SloRuleRefStoreLite, SloService } from '../slo_service';
import { InMemorySloStore } from '../slo_store';
import { DEFAULT_MWMBR_TIERS, dedupRecordingGroupName } from '../slo_promql_generator';
import { computeSliFingerprint } from '../slo_sli_fingerprint';
import { ALERT_PROVENANCE_ANNOTATION_KEY, parseAlertProvenance } from '../slo_rule_provenance';
import { FakeRulerClient } from './fake_ruler_client';
import { createSloReconciler } from '../../../server/services/slo/reconciler';
import { createReconcilerMetrics } from '../../../server/services/slo/reconciler_metrics';
import { createRuleHealthChecker } from '../../../server/services/slo/rule_health_checker';
import { InMemoryDatasourceService } from '../../../server/services/alerting/datasource_service';
import type {
  SloRuleRefStore,
  SloRuleRefDoc,
} from '../../../server/services/slo/slo_rule_ref_store';
import type { AlertingOSClient, Logger } from '../../types/alerting/types';
import type { SloSpec } from '../slo_types';

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
 * Reconciler-compatible FakeRefStore. The common SloRuleRefStoreLite surface
 * is a subset of the server SloRuleRefStore — this class satisfies both so
 * the service and reconciler share one instance.
 */
class FakeRefStore implements SloRuleRefStoreLite {
  public readonly entries = new Map<
    string,
    {
      refcount: number;
      zeroSinceAt?: string;
      groupName: string;
      namespace: string;
      workspaceId: string;
      datasourceId: string;
      fingerprint: string;
    }
  >();
  private clock: () => Date;

  constructor(clock: () => Date = () => new Date()) {
    this.clock = clock;
  }

  setClock(clock: () => Date): void {
    this.clock = clock;
  }

  private key(ws: string, ds: string, fp: string): string {
    return `${ws}|${ds}|${fp}`;
  }

  async get(ws: string, ds: string, fp: string) {
    const e = this.entries.get(this.key(ws, ds, fp));
    if (!e) return null;
    return { attributes: { refcount: e.refcount } };
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
    const existing = this.entries.get(k);
    if (!existing) {
      this.entries.set(k, {
        refcount: 1,
        groupName: input.groupName,
        namespace: input.namespace,
        workspaceId: input.workspaceId,
        datasourceId: input.datasourceId,
        fingerprint: input.fingerprint,
      });
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
    const existing = this.entries.get(k);
    if (!existing) return { droppedToZero: false, underflow: true };
    if (existing.refcount <= 0) return { droppedToZero: false, underflow: true };
    existing.refcount -= 1;
    const droppedToZero = existing.refcount === 0;
    if (droppedToZero) existing.zeroSinceAt = this.clock().toISOString();
    return { droppedToZero, underflow: false };
  }

  // Reconciler-facing surface
  async listByDatasource(ws: string, ds: string): Promise<SloRuleRefDoc[]> {
    const out: SloRuleRefDoc[] = [];
    for (const [k, e] of this.entries.entries()) {
      if (!k.startsWith(`${ws}|${ds}|`)) continue;
      out.push({
        id: `rule-ref:${ws}:${ds}:${e.fingerprint}`,
        attributes: {
          refcount: e.refcount,
          workspaceId: e.workspaceId,
          datasourceId: e.datasourceId,
          fingerprint: e.fingerprint,
          fingerprintVersion: 'v1',
          groupName: e.groupName,
          namespace: e.namespace,
          zeroSinceAt: e.zeroSinceAt,
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
      });
    }
    return out;
  }
  async listStaleZero() {
    return [];
  }
  async remove(ws: string, ds: string, fp: string): Promise<boolean> {
    return this.entries.delete(this.key(ws, ds, fp));
  }

  refcount(ws: string, ds: string, fp: string): number {
    return this.entries.get(this.key(ws, ds, fp))?.refcount ?? 0;
  }
  has(ws: string, ds: string, fp: string): boolean {
    return this.entries.has(this.key(ws, ds, fp));
  }
}

async function makeHarness() {
  const logger = noopLogger();
  const store = new InMemorySloStore();
  const ruler = new FakeRulerClient();
  const clock = { now: new Date('2026-05-01T00:00:00Z') };
  const refStore = new FakeRefStore(() => clock.now);
  const svc = new SloService(logger, store);
  svc.setDedupEnabled(true);
  svc.setRuleRefStore(refStore);
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
  const deploy: SloDeployContext = { ruler, client, datasource: ds, workspaceId: ds.id };
  const metrics = createReconcilerMetrics(logger);
  const health = createRuleHealthChecker(ruler, logger, { ttlMs: 0 });
  const reconciler = createSloReconciler({
    store,
    ruler,
    healthChecker: health,
    datasourceService,
    logger,
    metrics,
    buildClient: () => client,
    refStore: (refStore as unknown) as SloRuleRefStore,
    recordingGraceMs: 24 * 60 * 60_000,
    now: () => clock.now,
    intervalMs: 60_000_000,
  });
  return { store, ruler, refStore, svc, deploy, ds, clock, reconciler, metrics };
}

// ============================================================================
// Scenarios
// ============================================================================

describe('SloService dedup integration (W3.15)', () => {
  it('10 SLOs with 3 distinct fingerprints: exactly 3 recording-group upserts + 10 alert-group upserts', async () => {
    const { svc, ruler, refStore, deploy, ds } = await makeHarness();
    // Three distinct SLI shapes; each backing three or four SLOs.
    const metrics = ['metric_a', 'metric_b', 'metric_c'];
    const plan = [
      'metric_a',
      'metric_a',
      'metric_a',
      'metric_a',
      'metric_b',
      'metric_b',
      'metric_b',
      'metric_c',
      'metric_c',
      'metric_c',
    ];
    let nIdx = 0;
    for (const m of plan) {
      const spec = validSpec({
        name: `SLO ${nIdx++}`,
        datasourceId: ds.id,
        sli: {
          type: 'single',
          definition: {
            backend: 'prometheus',
            type: 'availability',
            calcMethod: 'events',
            metric: m,
          },
          dimensions: [{ name: 'service', value: 'api-gateway' }],
        },
      });
      await svc.create({ spec }, 'alice', deploy);
    }

    const fps = metrics.map(
      (m) =>
        computeSliFingerprint(
          ds.id,
          {
            type: 'single',
            definition: {
              backend: 'prometheus',
              type: 'availability',
              calcMethod: 'events',
              metric: m,
            },
            dimensions: [{ name: 'service', value: 'api-gateway' }],
          },
          { name: 'availability-99-9', target: 0.999 }
        )!
    );
    expect(new Set(fps).size).toBe(3);

    // Each recording group upserted exactly once.
    for (const fp of fps) {
      expect(ruler.upsertsOfName(dedupRecordingGroupName(fp))).toBe(1);
    }
    // Alert groups upserted once per SLO = 10.
    const alertUpserts = ruler.upserts.filter((u) => u.group.groupName.startsWith('slo:alerts:'));
    expect(alertUpserts).toHaveLength(10);

    // Refcounts follow the plan: 4 / 3 / 3.
    expect(refStore.refcount(ds.id, ds.id, fps[0])).toBe(4);
    expect(refStore.refcount(ds.id, ds.id, fps[1])).toBe(3);
    expect(refStore.refcount(ds.id, ds.id, fps[2])).toBe(3);
  });

  it('update moves one SLO to a new fingerprint: refs rebalance, old recording group preserved for grace', async () => {
    const { svc, ruler, refStore, deploy, ds } = await makeHarness();
    const oldSli: SloSpec['sli'] = {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
        metric: 'metric_a',
      },
      dimensions: [{ name: 'service', value: 'api-gateway' }],
    };
    const newSli: SloSpec['sli'] = {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
        metric: 'metric_b',
      },
      dimensions: [{ name: 'service', value: 'api-gateway' }],
    };
    const docA = await svc.create(
      { spec: validSpec({ name: 'A', sli: oldSli, datasourceId: ds.id }) },
      'alice',
      deploy
    );
    await svc.create(
      { spec: validSpec({ name: 'B', sli: oldSli, datasourceId: ds.id }) },
      'alice',
      deploy
    );

    const fpOld = computeSliFingerprint(ds.id, oldSli, {
      name: 'availability-99-9',
      target: 0.999,
    })!;
    const fpNew = computeSliFingerprint(ds.id, newSli, {
      name: 'availability-99-9',
      target: 0.999,
    })!;
    expect(refStore.refcount(ds.id, ds.id, fpOld)).toBe(2);

    // Move A to the new SLI.
    await svc.update(
      docA.id,
      { spec: { sli: newSli }, version: docA.status.version },
      'alice',
      deploy
    );

    expect(refStore.refcount(ds.id, ds.id, fpOld)).toBe(1);
    expect(refStore.refcount(ds.id, ds.id, fpNew)).toBe(1);

    // Neither old nor new recording group was deleted synchronously.
    expect(ruler.deletes.some((d) => d.groupName === dedupRecordingGroupName(fpOld))).toBe(false);
    expect(ruler.hasGroup(`slo-generated-${ds.id}`, dedupRecordingGroupName(fpOld))).toBe(true);
  });

  it('grace deletion under virtual clock: delete all users → wait 25h → reconcile → recording group + ref SO gone', async () => {
    const { svc, ruler, refStore, reconciler, deploy, ds, clock } = await makeHarness();
    const docA = await svc.create(
      { spec: validSpec({ name: 'A', datasourceId: ds.id }) },
      'alice',
      deploy
    );
    const docB = await svc.create(
      { spec: validSpec({ name: 'B', datasourceId: ds.id }) },
      'alice',
      deploy
    );

    const fp = computeSliFingerprint(ds.id, docA.spec.sli, docA.spec.objectives[0])!;
    const namespace = `slo-generated-${ds.id}`;
    const recGroupName = dedupRecordingGroupName(fp);

    expect(refStore.refcount(ds.id, ds.id, fp)).toBe(2);

    await svc.delete(docA.id, deploy);
    await svc.delete(docB.id, deploy);

    // Refcount is 0 and zeroSinceAt is stamped at the current clock.
    expect(refStore.refcount(ds.id, ds.id, fp)).toBe(0);
    expect(ruler.hasGroup(namespace, recGroupName)).toBe(true);

    // First reconcile: within grace, no deletion.
    clock.now = new Date(clock.now.getTime() + 60 * 60_000); // +1h
    let result = await reconciler.reconcileOnce({ datasourceIds: [ds.id] });
    expect(result.graceDeletions).toEqual([]);
    expect(ruler.hasGroup(namespace, recGroupName)).toBe(true);
    expect(refStore.has(ds.id, ds.id, fp)).toBe(true);

    // Advance past 24h grace and reconcile again.
    clock.now = new Date(clock.now.getTime() + 25 * 60 * 60_000); // +25h more → ~26h total
    result = await reconciler.reconcileOnce({ datasourceIds: [ds.id] });
    expect(result.graceDeletions).toHaveLength(1);
    expect(result.graceDeletions[0].fingerprint).toBe(fp);
    expect(ruler.hasGroup(namespace, recGroupName)).toBe(false);
    expect(refStore.has(ds.id, ds.id, fp)).toBe(false);
  });

  // ==========================================================================
  // Follow-up #4 — provenance.datasourceId canonicalizes to the datasource
  // name (matches spec.datasourceId). Previously the write-side recorded
  // `deploy.datasource.id` (the internal `ds-N`), forcing every consumer to
  // straddle both forms. These pins guard the new contract on create + update.
  // ==========================================================================

  it('create writes provenance.datasourceId as the datasource NAME (not ds-N)', async () => {
    const { svc, ruler, deploy, ds } = await makeHarness();
    const spec = validSpec({ name: 'canon-create', datasourceId: ds.id });
    const doc = await svc.create({ spec }, 'alice', deploy);

    const namespace = `slo-generated-${ds.id}`;
    const alertGroupName =
      doc.status.provisioning.backend === 'prometheus'
        ? doc.status.provisioning.alertGroupName!
        : '';
    const alertGroup = ruler.getGroup(namespace, alertGroupName);
    expect(alertGroup).toBeDefined();
    const raw = alertGroup!.rules[0].annotations?.[ALERT_PROVENANCE_ANNOTATION_KEY];
    expect(typeof raw).toBe('string');
    const parsed = parseAlertProvenance(raw!);
    expect(parsed).not.toBeNull();
    // Canonical: provenance datasourceId is the name. The raw `ds-N` internal
    // id must not leak. (This harness decouples workspaceId from ds.name — in
    // prod they're both the datasource name, but the assertion we care about
    // here is just the datasourceId shape.)
    expect(parsed!.datasourceId).toBe(ds.name);
    expect(parsed!.datasourceId).not.toBe(ds.id);
  });

  it('update re-writes provenance.datasourceId as the datasource NAME', async () => {
    const { svc, ruler, deploy, ds } = await makeHarness();
    const doc = await svc.create(
      { spec: validSpec({ name: 'canon-update', datasourceId: ds.id }) },
      'alice',
      deploy
    );
    await svc.update(
      doc.id,
      { spec: { service: 'api-v2' }, version: doc.status.version },
      'alice',
      deploy
    );
    const namespace = `slo-generated-${ds.id}`;
    // Take the most recent upsert for the alert group — `update` re-upserts.
    const alertUpserts = ruler.upserts.filter(
      (u) => u.namespace === namespace && u.group.groupName.startsWith('slo:alerts:')
    );
    const latest = alertUpserts[alertUpserts.length - 1];
    const raw = latest.group.rules[0].annotations?.[ALERT_PROVENANCE_ANNOTATION_KEY];
    const parsed = parseAlertProvenance(raw!);
    expect(parsed).not.toBeNull();
    expect(parsed!.datasourceId).toBe(ds.name);
    expect(parsed!.datasourceId).not.toBe(ds.id);
  });

  it('resurrection inside grace: recreate an SLO with the same SLI → refcount flips 0→1, zeroSinceAt cleared', async () => {
    const { svc, refStore, deploy, ds, clock } = await makeHarness();
    const docA = await svc.create(
      { spec: validSpec({ name: 'A', datasourceId: ds.id }) },
      'alice',
      deploy
    );
    const fp = computeSliFingerprint(ds.id, docA.spec.sli, docA.spec.objectives[0])!;
    await svc.delete(docA.id, deploy);
    expect(refStore.refcount(ds.id, ds.id, fp)).toBe(0);

    clock.now = new Date(clock.now.getTime() + 60 * 60_000);
    // New SLO with the same SLI; name is different so uniqueness passes.
    await svc.create(
      { spec: validSpec({ name: 'A reborn', datasourceId: ds.id }) },
      'alice',
      deploy
    );
    expect(refStore.refcount(ds.id, ds.id, fp)).toBe(1);
    // zeroSinceAt cleared by the increment.
    expect(refStore.entries.get(`${ds.id}|${ds.id}|${fp}`)?.zeroSinceAt).toBeUndefined();
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable max-classes-per-file */

/**
 * Phase 4 W4.10 — SLO adoption integration test.
 *
 * End-to-end coverage of the service-layer recovery surface. Exercises:
 *   A. Lost-SO recovery round-trip: backdoor-delete the saved objects, call
 *      `recover()` for each, assert SOs materialize, `getStatuses` resumes,
 *      and the ruler was NOT re-upserted (idempotent adoption).
 *   D. Tamper test: drop the expected recording group → `ORPHAN_SPEC_DRIFT`.
 *   E. Schema-forward: mutate provenance `schemaVersion` to 2 → recover()
 *      surfaces `ORPHAN_UNSUPPORTED_SCHEMA` so the UI can render an
 *      "upgrade plugin" affordance rather than "SLO not found".
 *   F. Tombstone path: happy `delete` then `recover` surfaces
 *      `ORPHAN_TOMBSTONED`; `acknowledgeTombstone: true` clears it.
 *
 * The ruler + ref-store + tombstone store are all in-memory fakes; the SO
 * store is `InMemorySloStore`. No HTTP, no OSD core — the route layer is
 * covered separately by W4.6.
 */

import {
  SloAdoptionError,
  SloDeployContext,
  SloRuleRefStoreLite,
  SloService,
  SloStatusAggregator,
  SloStatusAggregationContext,
  SloTombstoneAttributesLite,
  SloTombstoneStoreLite,
} from '../slo_service';
import { InMemorySloStore } from '../slo_store';
import {
  DEFAULT_MWMBR_TIERS,
  dedupAlertGroupName,
  dedupRecordingGroupName,
} from '../slo_promql_generator';
import { computeSliFingerprint } from '../slo_sli_fingerprint';
import {
  ALERT_PROVENANCE_ANNOTATION_KEY,
  PROVENANCE_SCHEMA_VERSION,
  annotateAlertGroup,
  buildAlertProvenance,
} from '../slo_rule_provenance';
import { FakeRulerClient } from './fake_ruler_client';
import {
  generateAlertGroupFor,
  generateRecordingGroupForFingerprint,
} from '../slo_promql_generator';
import type { AlertingOSClient, Datasource, Logger } from '../../types/alerting/types';
import type { SloDocument, SloLiveStatus, SloSpec } from '../slo_types';

// ============================================================================
// Fixtures
// ============================================================================

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
 * Shared ref-store fake. Shape mirrors the one in `slo_dedup_integration.test.ts`
 * (keyed by workspace|datasource|fingerprint) — local copy by design (see W4.10
 * harness guidance: tests are allowed small duplication so the integration
 * harness doesn't take a dep on sibling test-file internals).
 */
class FakeRefStore implements SloRuleRefStoreLite {
  public readonly entries = new Map<string, { refcount: number }>();
  private key(ws: string, ds: string, fp: string): string {
    return `${ws}|${ds}|${fp}`;
  }
  async get(ws: string, ds: string, fp: string) {
    const e = this.entries.get(this.key(ws, ds, fp));
    return e ? { attributes: { refcount: e.refcount } } : null;
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
      this.entries.set(k, { refcount: 1 });
      return { wasZero: true };
    }
    const wasZero = existing.refcount === 0;
    existing.refcount += 1;
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
    return { droppedToZero: existing.refcount === 0, underflow: false };
  }
  refcount(ws: string, ds: string, fp: string): number {
    return this.entries.get(this.key(ws, ds, fp))?.refcount ?? 0;
  }
}

class FakeTombstoneStore implements SloTombstoneStoreLite {
  public readonly entries = new Map<string, SloTombstoneAttributesLite>();
  async write(attrs: SloTombstoneAttributesLite): Promise<void> {
    this.entries.set(attrs.sloId, attrs);
  }
  async get(sloId: string) {
    const a = this.entries.get(sloId);
    return a ? { attributes: a } : null;
  }
  async remove(sloId: string): Promise<boolean> {
    return this.entries.delete(sloId);
  }
}

/**
 * Build a permissive status-aggregator that returns an 'ok' status for every
 * SLO the service passes in. Used to assert `getStatuses` resumes after the
 * recover flows materialize SOs.
 */
function okAggregator(): SloStatusAggregator {
  return {
    aggregate: async (docs: SloDocument[]): Promise<SloLiveStatus[]> =>
      docs.map((d) => ({
        sloId: d.id,
        objectives: d.spec.objectives.map((obj) => ({
          objectiveName: obj.name,
          currentValue: 0.9995,
          currentValueUnit: 'ratio' as const,
          attainment: 0.9995,
          errorBudgetRemaining: 0.9,
          state: 'ok' as const,
        })),
        state: 'ok' as const,
        firingCount: 0,
        ruleCount: 0,
        computedAt: new Date().toISOString(),
      })),
  };
}

function mkAggregationCtx(datasource?: Datasource): SloStatusAggregationContext {
  return {
    client: ({} as unknown) as AlertingOSClient,
    workspaceId: 'default',
    resolveDatasource: async () => datasource,
    ruleDedupEnabled: true,
  };
}

interface Harness {
  store: InMemorySloStore;
  ruler: FakeRulerClient;
  refStore: FakeRefStore;
  tombstones: FakeTombstoneStore;
  svc: SloService;
  datasourceD1: Datasource;
  client: AlertingOSClient;
  /** Deploy for workspace W1 / datasource D1 — the most common call. */
  deployW1D1: SloDeployContext;
}

function buildHarness(): Harness {
  const store = new InMemorySloStore();
  const ruler = new FakeRulerClient();
  const refStore = new FakeRefStore();
  const tombstones = new FakeTombstoneStore();
  const svc = new SloService(noopLogger(), store);
  svc.setDedupEnabled(true);
  svc.setRuleRefStore(refStore);
  svc.setTombstoneStore(tombstones);
  svc.setPluginVersion('9.9.9');

  const datasourceD1: Datasource = {
    id: 'prom-ds-001',
    name: 'prom-d1',
    type: 'prometheus',
    url: '',
    enabled: true,
    directQueryName: 'prom-d1',
  };
  const client = ({
    transport: { request: () => Promise.resolve({}) },
  } as unknown) as AlertingOSClient;
  const deployW1D1: SloDeployContext = {
    ruler,
    client,
    datasource: datasourceD1,
    workspaceId: 'W1',
  };
  return {
    store,
    ruler,
    refStore,
    tombstones,
    svc,
    datasourceD1,
    client,
    deployW1D1,
  };
}

// Local helper: produce a spec with a specific Prometheus metric, sharing the
// rest of the SLI shape so two SLOs hit the same fingerprint.
function specWithMetric(name: string, metric: string, datasourceId: string): SloSpec {
  return validSpec({
    name,
    datasourceId,
    sli: {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
        metric,
      },
      dimensions: [{ name: 'service', value: 'api-gateway' }],
    },
  });
}

// ============================================================================
// Scenarios
// ============================================================================

describe('Phase 4 adoption integration (W4.10)', () => {
  // --------------------------------------------------------------------------
  // Scenario A — Lost-SO recovery round-trip
  // --------------------------------------------------------------------------
  it('Scenario A: recovers two lost SOs that share a fingerprint with a surviving peer, status queries resume', async () => {
    const { svc, ruler, refStore, store, deployW1D1, datasourceD1 } = buildHarness();

    // Two SLOs share the same SLI shape (metric_a) → same fingerprint; one
    // other SLO uses a different metric.
    const sloA = await svc.create(
      { spec: specWithMetric('slo-a', 'metric_a', datasourceD1.id) },
      'alice',
      deployW1D1
    );
    const sloB = await svc.create(
      { spec: specWithMetric('slo-b', 'metric_a', datasourceD1.id) },
      'alice',
      deployW1D1
    );
    const sloC = await svc.create(
      { spec: specWithMetric('slo-c', 'metric_b', datasourceD1.id) },
      'alice',
      deployW1D1
    );

    const fpShared = computeSliFingerprint(
      datasourceD1.id,
      sloA.spec.sli,
      sloA.spec.objectives[0]
    )!;
    const fpSolo = computeSliFingerprint(datasourceD1.id, sloC.spec.sli, sloC.spec.objectives[0])!;

    expect(refStore.refcount('W1', datasourceD1.id, fpShared)).toBe(2);
    expect(refStore.refcount('W1', datasourceD1.id, fpSolo)).toBe(1);

    // The ruler has all three alert groups + two distinct recording groups.
    const namespace = `slo-generated-W1`;
    expect(ruler.hasGroup(namespace, dedupRecordingGroupName(fpShared))).toBe(true);
    expect(ruler.hasGroup(namespace, dedupRecordingGroupName(fpSolo))).toBe(true);
    const alertUpsertsBefore = ruler.upserts.filter((u) =>
      u.group.groupName.startsWith('slo:alerts:')
    ).length;
    expect(alertUpsertsBefore).toBe(3);

    // Backdoor-delete SOs for B and C via the store directly — bypasses the
    // service's delete hook entirely (no tombstone, no refcount decrement,
    // ruler untouched). This is the "lost saved objects" scenario.
    expect(await store.delete(sloB.id)).toBe(true);
    expect(await store.delete(sloC.id)).toBe(true);
    expect(await store.get(sloB.id)).toBeNull();
    expect(await store.get(sloC.id)).toBeNull();

    // Refcounts are unchanged since the service-layer delete hook was bypassed.
    expect(refStore.refcount('W1', datasourceD1.id, fpShared)).toBe(2);
    expect(refStore.refcount('W1', datasourceD1.id, fpSolo)).toBe(1);

    const upsertCountBeforeRecover = ruler.upsertCalls;

    // Recover B.
    const recoverB = await svc.recover(
      { sloId: sloB.id, datasourceId: datasourceD1.id, workspaceId: 'W1' },
      deployW1D1
    );
    expect(recoverB.slo.id).toBe(sloB.id);
    expect(recoverB.tombstoneCleared).toBe(false);
    const bPersisted = await store.get(sloB.id);
    expect(bPersisted).not.toBeNull();
    const bProv = bPersisted!.status.provisioning;
    expect(bProv.backend).toBe('prometheus');
    const bAdoption = bProv.backend === 'prometheus' ? bProv.adoptionSource : undefined;
    expect(bAdoption?.source).toBe('recover');
    // recover() increments the ref again (bypass-delete left it at 2) → 3.
    expect(refStore.refcount('W1', datasourceD1.id, fpShared)).toBe(3);

    // Recover C.
    const recoverC = await svc.recover(
      { sloId: sloC.id, datasourceId: datasourceD1.id, workspaceId: 'W1' },
      deployW1D1
    );
    expect(recoverC.slo.id).toBe(sloC.id);
    expect(recoverC.tombstoneCleared).toBe(false);
    const cPersisted = await store.get(sloC.id);
    expect(cPersisted).not.toBeNull();
    const cProv = cPersisted!.status.provisioning;
    const cAdoption = cProv.backend === 'prometheus' ? cProv.adoptionSource : undefined;
    expect(cAdoption?.source).toBe('recover');
    expect(refStore.refcount('W1', datasourceD1.id, fpSolo)).toBe(2);

    // Critical assertion: recover() must NOT re-upsert the alert group — the
    // group is already live and idempotency saves a ruler round-trip.
    expect(ruler.upsertCalls).toBe(upsertCountBeforeRecover);

    // Status queries resume. Wire the aggregator and verify every id resolves
    // to a populated status (not the `no_data` stub).
    svc.setStatusAggregator(okAggregator());
    const statuses = await svc.getStatuses(
      [sloA.id, sloB.id, sloC.id],
      mkAggregationCtx(datasourceD1)
    );
    expect(statuses).toHaveLength(3);
    for (const s of statuses) {
      expect(s.state).toBe('ok');
      expect(s.objectives[0].attainment).toBeGreaterThan(0);
    }
  });

  // --------------------------------------------------------------------------
  // Scenario D — Tamper test (ORPHAN_SPEC_DRIFT)
  // --------------------------------------------------------------------------
  it('Scenario D: dropping the expected recording group surfaces ORPHAN_SPEC_DRIFT on recover', async () => {
    const { svc, ruler, store, deployW1D1, datasourceD1 } = buildHarness();

    const slo = await svc.create(
      { spec: specWithMetric('drift-target', 'metric_drift', datasourceD1.id) },
      'alice',
      deployW1D1
    );
    const fp = computeSliFingerprint(datasourceD1.id, slo.spec.sli, slo.spec.objectives[0])!;
    const namespace = `slo-generated-W1`;

    // Backdoor-delete the SO so recover() has something to adopt.
    await store.delete(slo.id);

    // Tamper: remove the expected recording group from the ruler. The alert
    // group is still there carrying intact provenance, but the fingerprint
    // coverage check in recover() will fail with "Expected recording group
    // slo:rec:<fp> missing on ruler" — surfaced as ORPHAN_SPEC_DRIFT.
    ruler.dropGroup(namespace, dedupRecordingGroupName(fp));
    expect(ruler.hasGroup(namespace, dedupRecordingGroupName(fp))).toBe(false);

    const err = await svc
      .recover({ sloId: slo.id, datasourceId: datasourceD1.id, workspaceId: 'W1' }, deployW1D1)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SloAdoptionError);
    expect((err as SloAdoptionError).code).toBe('ORPHAN_SPEC_DRIFT');
  });

  // --------------------------------------------------------------------------
  // Scenario E — Schema-forward provenance (v2)
  // --------------------------------------------------------------------------
  it('Scenario E: schemaVersion=2 provenance surfaces ORPHAN_UNSUPPORTED_SCHEMA', async () => {
    const { ruler, svc, deployW1D1, datasourceD1 } = buildHarness();

    // Hand-build an alert + recording group carrying a v2 provenance
    // annotation, then seed the ruler directly (bypassing service.create so
    // the schemaVersion stays non-v1).
    const sloId = 'slo-schema-v2';
    const workspaceId = 'W1';
    const spec = specWithMetric('schema-forward', 'schema_metric', datasourceD1.id);
    const namespace = `slo-generated-${workspaceId}`;
    const fp = computeSliFingerprint(datasourceD1.id, spec.sli, spec.objectives[0])!;

    const stubDoc: SloDocument = {
      id: sloId,
      spec,
      status: {
        version: 1,
        createdAt: '2026-04-01T00:00:00Z',
        createdBy: 'alice',
        updatedAt: '2026-04-01T00:00:00Z',
        updatedBy: 'alice',
        provisioning: {
          backend: 'prometheus',
          rulerNamespace: namespace,
          recordingFingerprints: { [spec.objectives[0].name]: fp },
          alertGroupName: dedupAlertGroupName(spec.name, workspaceId, sloId),
        },
      },
    };
    const rawAlert = generateAlertGroupFor(
      stubDoc,
      { [spec.objectives[0].name]: fp },
      { workspaceId }
    );
    // Build a v1 provenance first, then mutate schemaVersion to 2 *after*
    // JSON.stringify so the string carries schemaVersion: 2.
    // parseAlertProvenance rejects the schemaVersion mismatch; Session B
    // (Item 1) closed the gap so `svc.recover` still disambiguates this
    // from "no such SLO" — a loose scan keyed on sloId + mismatched
    // schemaVersion now promotes the failure to ORPHAN_UNSUPPORTED_SCHEMA.
    const v1Provenance = buildAlertProvenance({
      pluginVersion: '9.9.9',
      sloId,
      workspaceId,
      datasourceId: datasourceD1.id,
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-01T00:00:00Z',
      spec,
    });
    let annotatedAlert = annotateAlertGroup(rawAlert, v1Provenance);
    // Re-stringify with schemaVersion bumped to 2.
    const forwardProvenance = { ...v1Provenance, schemaVersion: PROVENANCE_SCHEMA_VERSION + 1 };
    const firstRule = annotatedAlert.rules[0];
    annotatedAlert = {
      ...annotatedAlert,
      rules: [
        {
          ...firstRule,
          annotations: {
            ...firstRule.annotations,
            [ALERT_PROVENANCE_ANNOTATION_KEY]: JSON.stringify(forwardProvenance),
          },
        },
        ...annotatedAlert.rules.slice(1),
      ],
    };
    ruler.seedGroup(namespace, annotatedAlert);

    // Also seed the recording group so we don't trip the separate
    // fingerprint-coverage check (SPEC_DRIFT) and muddy this scenario.
    if (spec.sli.type === 'single') {
      const recording = generateRecordingGroupForFingerprint({
        fingerprint: fp,
        sli: spec.sli,
        objectiveLatencyThreshold: spec.objectives[0].latencyThreshold,
      });
      if (recording) {
        // Recording groups are NOT annotated — Cortex forbids annotations on
        // recording rules. Detector recognizes them by slo:rec:<fp> name.
        ruler.seedGroup(namespace, recording);
      }
    }

    const err = await svc
      .recover({ sloId, datasourceId: datasourceD1.id, workspaceId }, deployW1D1)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SloAdoptionError);
    expect((err as SloAdoptionError).code).toBe('ORPHAN_UNSUPPORTED_SCHEMA');
  });

  // --------------------------------------------------------------------------
  // Scenario F — Tombstone path
  //
  // `svc.delete` (dedup path) removes the per-SLO alert group from the ruler.
  // To keep the adoption path reachable for this test, we pair the deleted
  // SLO with a second SLO that shares the same fingerprint — the shared
  // recording group survives (refcount > 0), and we re-seed the deleted
  // SLO's alert group on the ruler to mirror the "operator put the rules
  // back but the SO never returned" case that orphan-adoption was designed
  // for. Then the tombstone-gate assertions can run.
  // --------------------------------------------------------------------------
  it('Scenario F: tombstoned SLO rejects recover without acknowledgement, succeeds + clears with it', async () => {
    const { svc, tombstones, deployW1D1, datasourceD1 } = buildHarness();

    // Two SLOs share a fingerprint → the recording group survives deletion
    // of one of them.
    const sloA = await svc.create(
      { spec: specWithMetric('tomb-a', 'metric_tomb_shared', datasourceD1.id) },
      'alice',
      deployW1D1
    );
    await svc.create(
      { spec: specWithMetric('tomb-b', 'metric_tomb_shared', datasourceD1.id) },
      'alice',
      deployW1D1
    );

    // Normal delete of sloA — writes a tombstone, removes its alert group.
    await svc.delete(sloA.id, deployW1D1);
    expect(await tombstones.get(sloA.id)).not.toBeNull();

    // Reconstruct sloA's alert group on the ruler with valid provenance.
    const namespace = `slo-generated-W1`;
    const fp = computeSliFingerprint(datasourceD1.id, sloA.spec.sli, sloA.spec.objectives[0])!;
    const stubDoc: SloDocument = {
      id: sloA.id,
      spec: sloA.spec,
      status: {
        version: 1,
        createdAt: '2026-04-01T00:00:00Z',
        createdBy: 'alice',
        updatedAt: '2026-04-01T00:00:00Z',
        updatedBy: 'alice',
        provisioning: {
          backend: 'prometheus',
          rulerNamespace: namespace,
          recordingFingerprints: { [sloA.spec.objectives[0].name]: fp },
          alertGroupName: dedupAlertGroupName(sloA.spec.name, 'W1', sloA.id),
        },
      },
    };
    const rawAlert = generateAlertGroupFor(
      stubDoc,
      { [sloA.spec.objectives[0].name]: fp },
      { workspaceId: 'W1' }
    );
    const provenance = buildAlertProvenance({
      pluginVersion: '9.9.9',
      sloId: sloA.id,
      workspaceId: 'W1',
      datasourceId: datasourceD1.id,
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-01T00:00:00Z',
      spec: sloA.spec,
    });
    const annotatedAlert = annotateAlertGroup(rawAlert, provenance);
    await deployW1D1.ruler.upsertRuleGroup(
      deployW1D1.client,
      deployW1D1.datasource,
      namespace,
      annotatedAlert
    );

    // Without acknowledgement → ORPHAN_TOMBSTONED, tombstone stays in place.
    const err1 = await svc
      .recover({ sloId: sloA.id, datasourceId: datasourceD1.id, workspaceId: 'W1' }, deployW1D1)
      .catch((e: unknown) => e);
    expect(err1).toBeInstanceOf(SloAdoptionError);
    expect((err1 as SloAdoptionError).code).toBe('ORPHAN_TOMBSTONED');
    expect(await tombstones.get(sloA.id)).not.toBeNull();

    // With acknowledgement → tombstone cleared, recover succeeds.
    const result = await svc.recover(
      {
        sloId: sloA.id,
        datasourceId: datasourceD1.id,
        workspaceId: 'W1',
        acknowledgeTombstone: true,
      },
      deployW1D1
    );
    expect(result.tombstoneCleared).toBe(true);
    expect(await tombstones.get(sloA.id)).toBeNull();
  });
});

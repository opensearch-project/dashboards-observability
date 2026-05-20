/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SloReconciler — integration tests (W2.7).
 *
 * Wires the real pieces together, end-to-end:
 *   - `createSloReconciler` from `server/services/slo/reconciler.ts`.
 *   - `createRuleHealthChecker` from `server/services/slo/rule_health_checker.ts`
 *     (TTL 0 so invalidation assertions are deterministic).
 *   - `createReconcilerMetrics` from `server/services/slo/reconciler_metrics.ts`.
 *   - `detectOrphanDiff` transitively through the reconciler (NOT mocked).
 *   - The real `InMemoryDatasourceService`.
 *   - The real `SloService` backed by `InMemorySloStore`, seeded via
 *     `SloService.create(...)` so `status.provisioning.alertGroupName` matches
 *     what `deriveExpectedGroups` returns inside the reconciler.
 *   - A `FakeRulerClient` backed by a per-namespace in-memory Map with
 *     error-injection hooks — modelled on the class in
 *     `slo_service_repair_integration.test.ts`. Minor W2.7 enhancement:
 *     `setListError` so scenario 5 can flip `listRuleGroups` into a 5xx
 *     posture without affecting other datasources. The original fake in the
 *     repair integration test file only has `setGetError` because it never
 *     needed a list-path error.
 *
 * Each test drives `reconcileOnce()` directly rather than letting the
 * interval fire; we pass `intervalMs: 60_000_000` so the scheduled timer
 * never runs inside a test body.
 */

import { SloDeployContext, SloService, sloRulerNamespaceFor } from '../slo_service';
import { InMemorySloStore } from '../slo_store';
import { DEFAULT_MWMBR_TIERS } from '../slo_promql_generator';
import { SloRulerError } from '../slo_errors';
import { createRuleHealthChecker } from '../../../server/services/slo/rule_health_checker';
import { createReconcilerMetrics } from '../../../server/services/slo/reconciler_metrics';
import { createSloReconciler, SloReconciler } from '../../../server/services/slo/reconciler';
import { InMemoryDatasourceService } from '../../../server/services/alerting/datasource_service';
import type { AlertingOSClient, Logger } from '../../types/alerting/types';
import type { SloSpec } from '../slo_types';
import { FakeRulerClient } from './fake_ruler_client';

// ============================================================================
// Test doubles
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
    datasourceId: 'unused-will-be-overridden',
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

interface Harness {
  store: InMemorySloStore;
  ruler: FakeRulerClient;
  svc: SloService;
  datasourceService: InMemoryDatasourceService;
  health: ReturnType<typeof createRuleHealthChecker>;
  metrics: ReturnType<typeof createReconcilerMetrics>;
  reconciler: SloReconciler;
  client: AlertingOSClient;
  logger: Logger;
  /** Per-datasource deploy contexts keyed by datasource id. */
  deploys: Map<string, SloDeployContext>;
  /** Datasource id → workspace id mapping used everywhere. */
  workspaceFor: (datasourceId: string) => string;
  /** Convenience: ruler namespace for a given datasource id. */
  namespaceFor: (datasourceId: string) => string;
}

/**
 * Wire the harness. Each registered datasource gets its *own* workspace id
 * and therefore its *own* ruler namespace — that's what lets scenario 4
 * (multi-datasource isolation) assert that a drop in ds-A never appears in
 * ds-B's namespace.
 */
async function makeHarness(
  datasourceInputs: Array<{ name: string; directQueryName: string }>
): Promise<Harness> {
  const logger = noopLogger();
  const store = new InMemorySloStore();
  const ruler = new FakeRulerClient();
  const svc = new SloService(logger, store);
  // Pin Phase-1/2 (single-group) contract — the reconciler's Phase-3
  // extensions (dangling refs, grace deletions) are covered in W3.11 tests.
  svc.setDedupEnabled(false);
  // TTL 0 so the post-sweep probe recomputes — any nonzero TTL would let a
  // freshly-cached `ok` report mask the underlying ruler state change in
  // scenario 2.
  const health = createRuleHealthChecker(ruler, logger, { ttlMs: 0 });
  const metrics = createReconcilerMetrics(logger);
  const datasourceService = new InMemoryDatasourceService(logger);
  const client = ({
    transport: { request: () => Promise.resolve({}) },
  } as unknown) as AlertingOSClient;

  const deploys = new Map<string, SloDeployContext>();
  for (const input of datasourceInputs) {
    const ds = await datasourceService.create({
      name: input.name,
      type: 'prometheus',
      url: '',
      enabled: true,
      directQueryName: input.directQueryName,
    });
    deploys.set(ds.id, {
      ruler,
      client,
      datasource: ds,
      // 1-to-1 workspace per datasource — matches the reconciler's default
      // `workspaceIdForDatasource` (identity), so the namespaces line up.
      workspaceId: ds.id,
    });
  }

  const workspaceFor = (datasourceId: string) => datasourceId;
  const namespaceFor = (datasourceId: string) => sloRulerNamespaceFor(workspaceFor(datasourceId));

  const reconciler = createSloReconciler({
    store,
    ruler,
    healthChecker: health,
    datasourceService,
    logger,
    metrics,
    buildClient: () => client,
    // Very long interval — we never want the timer to fire during a test.
    intervalMs: 60_000_000,
  });

  return {
    store,
    ruler,
    svc,
    datasourceService,
    health,
    metrics,
    reconciler,
    client,
    logger,
    deploys,
    workspaceFor,
    namespaceFor,
  };
}

/** Convenience: create an SLO under a specific datasource via the real service. */
async function seedSlo(h: Harness, datasourceId: string, specOverrides: Partial<SloSpec> = {}) {
  const deploy = h.deploys.get(datasourceId);
  if (!deploy) throw new Error(`No deploy context for datasource ${datasourceId}`);
  const spec = validSpec({ datasourceId, ...specOverrides });
  const doc = await h.svc.create({ spec }, 'alice', deploy);
  const groupName =
    doc.status.provisioning.backend === 'prometheus' && doc.status.provisioning.alertGroupName
      ? doc.status.provisioning.alertGroupName
      : '';
  return { doc, groupName, deploy };
}

// ============================================================================
// Tests
// ============================================================================

describe('SloReconciler — integration (W2.7)', () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    if (harness) {
      await harness.reconciler.stop();
      harness = undefined;
    }
  });

  it('happy path: 2 SLOs under 1 datasource, all groups present — empty diff, sweeps=1, all other counters 0', async () => {
    harness = await makeHarness([{ name: 'prom-a', directQueryName: 'prom-a-connection' }]);
    const dsId = Array.from(harness.deploys.keys())[0];

    const { groupName: g1 } = await seedSlo(harness, dsId, { name: 'slo-one' });
    const { groupName: g2 } = await seedSlo(harness, dsId, { name: 'slo-two' });

    const ns = harness.namespaceFor(dsId);
    expect(harness.ruler.hasGroup(ns, g1)).toBe(true);
    expect(harness.ruler.hasGroup(ns, g2)).toBe(true);

    const before = harness.metrics.snapshot();

    const result = await harness.reconciler.reconcileOnce();

    expect(result.datasourceIds).toEqual([dsId]);
    expect(result.missingBySlo).toEqual([]);
    expect(result.orphans).toEqual([]);
    expect(result.adoptableOrphans).toEqual([]);
    expect(result.unknownOrphans).toEqual([]);
    expect(result.errors).toEqual([]);

    const after = harness.metrics.snapshot();
    expect(after.sweeps - before.sweeps).toBe(1);
    expect(after.missingRuleGroups - before.missingRuleGroups).toBe(0);
    expect(after.orphans - before.orphans).toBe(0);
    expect(after.errors - before.errors).toBe(0);
  });

  it('missing detection → invalidate → next probe sees rules_missing (end-to-end W2.3 verification)', async () => {
    harness = await makeHarness([{ name: 'prom-a', directQueryName: 'prom-a-connection' }]);
    const dsId = Array.from(harness.deploys.keys())[0];
    const deploy = harness.deploys.get(dsId)!;

    const { doc: docA, groupName: gA } = await seedSlo(harness, dsId, { name: 'slo-alpha' });
    const { doc: docB, groupName: gB } = await seedSlo(harness, dsId, { name: 'slo-beta' });
    const ns = harness.namespaceFor(dsId);

    // Pre-warm the health cache. With TTL 0 this doesn't actually persist
    // between calls, so we're really just asserting "the probe reads the
    // current ruler state as ok, before anything drops".
    const preA = await harness.health.check({
      workspaceId: deploy.workspaceId,
      datasource: deploy.datasource,
      client: harness.client,
      sloId: docA.id,
      namespace: ns,
      expectedGroups: [gA],
    });
    expect(preA.state).toBe('ok');

    // Out-of-band drop of SLO A's rule group — the SO still claims it.
    harness.ruler.dropGroup(ns, gA);
    expect(harness.ruler.hasGroup(ns, gA)).toBe(false);
    expect(harness.ruler.hasGroup(ns, gB)).toBe(true);

    const before = harness.metrics.snapshot();
    const result = await harness.reconciler.reconcileOnce();

    expect(result.missingBySlo).toHaveLength(1);
    expect(result.missingBySlo[0]).toMatchObject({
      sloId: docA.id,
      datasourceId: dsId,
      namespace: ns,
      missingGroups: [gA],
    });
    expect(result.orphans).toEqual([]);
    expect(result.errors).toEqual([]);

    const after = harness.metrics.snapshot();
    expect(after.sweeps - before.sweeps).toBe(1);
    expect(after.missingRuleGroups - before.missingRuleGroups).toBe(1);
    expect(after.orphans - before.orphans).toBe(0);
    expect(after.errors - before.errors).toBe(0);

    // The reconciler invalidated SLO A's cache entry; with TTL 0 the next
    // probe recomputes and sees `rules_missing` against the live ruler.
    const postA = await harness.health.check({
      workspaceId: deploy.workspaceId,
      datasource: deploy.datasource,
      client: harness.client,
      sloId: docA.id,
      namespace: ns,
      expectedGroups: [gA],
    });
    expect(postA.state).toBe('rules_missing');
    expect(postA.missingGroups).toEqual([gA]);

    // SLO B is untouched — its probe still returns ok.
    const postB = await harness.health.check({
      workspaceId: deploy.workspaceId,
      datasource: deploy.datasource,
      client: harness.client,
      sloId: docB.id,
      namespace: ns,
      expectedGroups: [gB],
    });
    expect(postB.state).toBe('ok');
  });

  it('orphan detection: a stray ruler group with no owning SLO shows up in unknownOrphans; adoptable stays empty (Phase 4 pre-Phase-3-layout path)', async () => {
    harness = await makeHarness([{ name: 'prom-a', directQueryName: 'prom-a-connection' }]);
    const dsId = Array.from(harness.deploys.keys())[0];
    await seedSlo(harness, dsId, { name: 'slo-real' });
    const ns = harness.namespaceFor(dsId);

    // Inject a stray group directly into the ruler — not owned by any SLO SO.
    const strayGroupName = 'stray-group';
    harness.ruler.seedGroup(ns, {
      groupName: strayGroupName,
      interval: 60,
      rules: [
        {
          type: 'recording',
          name: 'stray:rec',
          expr: 'vector(0)',
          labels: {},
          description: 'Orphan recording rule seeded by test.',
        },
      ],
      yaml: '',
    });

    const before = harness.metrics.snapshot();
    const result = await harness.reconciler.reconcileOnce();

    expect(result.missingBySlo).toEqual([]);
    expect(result.orphans).toHaveLength(1);
    // Phase 4 (W4.2) — the orphan is tagged with the "pre-Phase-3 rule
    // layout" diagnostic because it carries no provenance annotation.
    // Legacy-group adoption is out of scope per orchestrator decision D2.
    expect(result.orphans[0]).toMatchObject({
      datasourceId: dsId,
      namespace: ns,
      groupName: strayGroupName,
      diagnostic: 'pre-Phase-3 rule layout; not eligible for adoption',
    });
    expect(result.unknownOrphans).toEqual(result.orphans);
    expect(result.adoptableOrphans).toEqual([]);
    expect(result.errors).toEqual([]);

    const after = harness.metrics.snapshot();
    expect(after.sweeps - before.sweeps).toBe(1);
    expect(after.orphans - before.orphans).toBe(1);
    expect(after.missingRuleGroups - before.missingRuleGroups).toBe(0);
    expect(after.errors - before.errors).toBe(0);
    // Phase 4 — new counters parallel the adoptable/unknown split.
    expect(after.adoptableOrphans - before.adoptableOrphans).toBe(0);
    expect(after.unknownOrphans - before.unknownOrphans).toBe(1);
  });

  it("multi-workspace isolation: dropping ds-A's group does not produce a missing entry under ds-B", async () => {
    harness = await makeHarness([
      { name: 'prom-a', directQueryName: 'prom-a-connection' },
      { name: 'prom-b', directQueryName: 'prom-b-connection' },
    ]);
    const [dsA, dsB] = Array.from(harness.deploys.keys());

    const { groupName: gA } = await seedSlo(harness, dsA, { name: 'slo-a-side' });
    const { groupName: gB } = await seedSlo(harness, dsB, { name: 'slo-b-side' });

    const nsA = harness.namespaceFor(dsA);
    const nsB = harness.namespaceFor(dsB);
    expect(nsA).not.toBe(nsB);
    expect(harness.ruler.hasGroup(nsA, gA)).toBe(true);
    expect(harness.ruler.hasGroup(nsB, gB)).toBe(true);

    // Drop only ds-A's group. ds-B should be unaffected.
    harness.ruler.dropGroup(nsA, gA);

    const before = harness.metrics.snapshot();
    const result = await harness.reconciler.reconcileOnce();

    // Result covers both datasources — order is map-iteration-order, so
    // don't rely on it.
    expect(new Set(result.datasourceIds)).toEqual(new Set([dsA, dsB]));
    expect(result.missingBySlo).toHaveLength(1);
    expect(result.missingBySlo[0]).toMatchObject({
      datasourceId: dsA,
      namespace: nsA,
      missingGroups: [gA],
    });
    // ds-B's namespace is not referenced in any diff entry.
    for (const entry of result.missingBySlo) {
      expect(entry.namespace).not.toBe(nsB);
      expect(entry.datasourceId).not.toBe(dsB);
    }
    expect(result.orphans).toEqual([]);
    expect(result.errors).toEqual([]);

    const after = harness.metrics.snapshot();
    expect(after.sweeps - before.sweeps).toBe(1);
    expect(after.missingRuleGroups - before.missingRuleGroups).toBe(1);
    expect(after.errors - before.errors).toBe(0);
  });

  it('5xx on ds-A list does not prevent ds-B from sweeping: errors=1, sweeps=1, ds-B diff still clean', async () => {
    harness = await makeHarness([
      { name: 'prom-a', directQueryName: 'prom-a-connection' },
      { name: 'prom-b', directQueryName: 'prom-b-connection' },
    ]);
    const [dsA, dsB] = Array.from(harness.deploys.keys());
    await seedSlo(harness, dsA, { name: 'slo-a' });
    await seedSlo(harness, dsB, { name: 'slo-b' });

    const nsA = harness.namespaceFor(dsA);

    // Flip ds-A's listRuleGroups into a 5xx posture; ds-B's namespace stays
    // healthy. The reconciler should record the error for ds-A and continue.
    harness.ruler.setListErrorForNamespace(
      nsA,
      new SloRulerError('RULER_UNREACHABLE', 503, 'upstream')
    );

    const before = harness.metrics.snapshot();
    const result = await harness.reconciler.reconcileOnce();

    // The failed datasource is NOT in `datasourceIds` — the reconciler only
    // pushes once the list call has succeeded.
    expect(result.datasourceIds).toEqual([dsB]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      datasourceId: dsA,
      namespace: nsA,
    });
    expect(result.errors[0].message).toContain('RULER_UNREACHABLE');
    expect(result.missingBySlo).toEqual([]);
    expect(result.orphans).toEqual([]);

    const after = harness.metrics.snapshot();
    expect(after.sweeps - before.sweeps).toBe(1);
    expect(after.errors - before.errors).toBe(1);
    expect(after.missingRuleGroups - before.missingRuleGroups).toBe(0);
    expect(after.orphans - before.orphans).toBe(0);
  });

  it('empty state: no SLOs and no rule groups → empty diff, sweeps=1, no error entries', async () => {
    harness = await makeHarness([{ name: 'prom-a', directQueryName: 'prom-a-connection' }]);

    const before = harness.metrics.snapshot();
    const result = await harness.reconciler.reconcileOnce();

    // Phase 4: the unfiltered sweep-all path enumerates every registered
    // enabled Prometheus datasource so a datasource whose SOs were all lost
    // still surfaces its orphans. With one fixture datasource and no rule
    // groups, the sweep visits it and finds nothing — no missing, no orphans.
    expect(result.datasourceIds).toHaveLength(1);
    expect(result.missingBySlo).toEqual([]);
    expect(result.orphans).toEqual([]);
    expect(result.adoptableOrphans).toEqual([]);
    expect(result.unknownOrphans).toEqual([]);
    expect(result.errors).toEqual([]);

    const after = harness.metrics.snapshot();
    expect(after.sweeps - before.sweeps).toBe(1);
    expect(after.missingRuleGroups - before.missingRuleGroups).toBe(0);
    expect(after.orphans - before.orphans).toBe(0);
    expect(after.errors - before.errors).toBe(0);
  });
});

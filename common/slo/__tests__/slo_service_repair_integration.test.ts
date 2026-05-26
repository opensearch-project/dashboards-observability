/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SloService.repair — integration tests.
 *
 * Wires the real `SloService` against:
 *   - `InMemorySloStore` (no SO-layer mocks)
 *   - A `FakeRulerClient` we control (simulates out-of-band group deletion,
 *     5xx, and 4xx upsert failures)
 *   - The production `createRuleHealthChecker` (unmocked) pointed at the same
 *     fake ruler
 *
 * Unlike the unit-level `slo_service_repair.test.ts`, these tests exercise
 * multiple subsystems stitched together: the probe actually runs against the
 * fake ruler's state, and repair's upsert flips the probe's next answer. That
 * lets us pin end-to-end semantics (restore after out-of-band delete,
 * idempotence, error-propagation) that no single unit test covers.
 */

import {
  deriveExpectedGroups,
  SloDeployContext,
  SloNotFoundError,
  SloRepairContext,
  SloRuleRefStoreLite,
  SloRulerError,
  SloService,
  sloRulerNamespaceFor,
} from '../slo_service';
import { InMemorySloStore } from '../slo_store';
import {
  DEFAULT_MWMBR_TIERS,
  dedupAlertGroupName,
  dedupRecordingGroupName,
} from '../slo_promql_generator';
import { ALERT_PROVENANCE_ANNOTATION_KEY } from '../slo_rule_provenance';
import { computeSliFingerprint } from '../slo_sli_fingerprint';
import { createRuleHealthChecker } from '../../../server/services/slo/rule_health_checker';
import type { AlertingOSClient, Datasource, Logger } from '../../types/alerting';
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

function makeHarness() {
  const store = new InMemorySloStore();
  const ruler = new FakeRulerClient();
  const logger = noopLogger();
  const svc = new SloService(logger, store);
  // Pin the single-group contract — dedup behavior has its own integration test.
  svc.setDedupEnabled(false);
  const health = createRuleHealthChecker(ruler, logger, { ttlMs: 0 });

  const datasource: Datasource = {
    id: 'ds-1',
    name: 'prom-ds-001',
    type: 'prometheus',
    url: '',
    enabled: true,
    directQueryName: 'prom-connection',
  };
  const client = ({
    transport: { request: () => Promise.resolve({}) },
  } as unknown) as AlertingOSClient;

  const deploy: SloDeployContext = {
    ruler,
    client,
    datasource,
    workspaceId: 'ws-int',
    OSDWorkspaceId: 'ws-int',
  };
  const repairCtx: SloRepairContext = { health, deploy };
  const namespace = sloRulerNamespaceFor(deploy.workspaceId);

  return { store, ruler, svc, deploy, repairCtx, namespace, health };
}

// ============================================================================
// Tests
// ============================================================================

describe('SloService.repair — integration', () => {
  it('restores an out-of-band deleted rule group: repaired=true, state=ok, two upserts total, group back on ruler', async () => {
    const { svc, ruler, deploy, repairCtx, namespace } = makeHarness();
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);

    const groupName =
      doc.status.provisioning.backend === 'prometheus' && doc.status.provisioning.alertGroupName
        ? doc.status.provisioning.alertGroupName
        : '';

    // Sanity: create wrote the group to the fake ruler.
    expect(ruler.hasGroup(namespace, groupName)).toBe(true);
    expect(ruler.upsertCalls).toBe(1);
    // Pin the exact rule-name set create emitted so we can re-compare after
    // repair and catch any accidental rule-shape drift.
    const originalRuleNames = ruler.groupByName(namespace, groupName)!.rules.map((r) => r.name);

    // Out-of-band delete: somebody ran `DELETE /api/v1/rules/{ns}/{group}` directly
    // on Cortex. The SO still thinks the group is there; repair should notice.
    ruler.dropGroup(namespace, groupName);
    expect(ruler.hasGroup(namespace, groupName)).toBe(false);

    const result = await svc.repair(doc.id, repairCtx);

    expect(result.sloId).toBe(doc.id);
    expect(result.repaired).toBe(true);
    expect(result.health.state).toBe('ok');
    expect(result.health.missingGroups).toEqual([]);
    expect(result.health.presentGroups).toEqual([groupName]);
    // create + repair = 2 upserts total; no other writes happen along the way.
    expect(ruler.upsertCalls).toBe(2);
    expect(ruler.hasGroup(namespace, groupName)).toBe(true);

    // Exact-shape assertion: post-repair ruler state matches
    // `deriveExpectedGroups(doc)` AND the rule-name set is byte-identical to
    // what create emitted. "Upsert was called" isn't enough — this is the
    // assertion that would have caught the dedup-path repair bug.
    const expected = deriveExpectedGroups(doc);
    expect(ruler.listGroupNames(namespace).sort()).toEqual([...expected].sort());
    expect(ruler.groupByName(namespace, groupName)!.rules.map((r) => r.name)).toEqual(
      originalRuleNames
    );
  });

  it('idempotent on a healthy SLO: zero extra upserts across two back-to-back repairs', async () => {
    const { svc, ruler, deploy, repairCtx } = makeHarness();
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);

    const upsertsAfterCreate = ruler.upsertCalls;

    const first = await svc.repair(doc.id, repairCtx);
    expect(first.repaired).toBe(false);
    expect(first.health.state).toBe('ok');
    expect(ruler.upsertCalls).toBe(upsertsAfterCreate);

    const second = await svc.repair(doc.id, repairCtx);
    expect(second.repaired).toBe(false);
    expect(second.health.state).toBe('ok');
    expect(ruler.upsertCalls).toBe(upsertsAfterCreate);
  });

  it('propagates ruler 5xx as SloRulerError("RULER_UNREACHABLE", …) without upserting', async () => {
    const { svc, ruler, deploy, repairCtx, namespace } = makeHarness();
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);

    const groupName =
      doc.status.provisioning.backend === 'prometheus' && doc.status.provisioning.alertGroupName
        ? doc.status.provisioning.alertGroupName
        : '';
    ruler.dropGroup(namespace, groupName);

    // Flip the fake into a 5xx posture — the probe should translate this into
    // state='ruler_unreachable', which repair re-throws as SloRulerError.
    ruler.setGetError(new SloRulerError('RULER_UNREACHABLE', 503, 'upstream'));

    const upsertsBefore = ruler.upsertCalls;
    await expect(svc.repair(doc.id, repairCtx)).rejects.toBeInstanceOf(SloRulerError);

    ruler.setGetError(new SloRulerError('RULER_UNREACHABLE', 503, 'upstream'));
    await expect(svc.repair(doc.id, repairCtx)).rejects.toMatchObject({
      name: 'SloRulerError',
      code: 'RULER_UNREACHABLE',
    });

    // No upsert attempted; repair bailed before reaching the write.
    expect(ruler.upsertCalls).toBe(upsertsBefore);
  });

  it('propagates ruler 4xx on upsert during repair and leaves the SO unchanged', async () => {
    const { svc, store, ruler, deploy, repairCtx, namespace } = makeHarness();
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);

    const groupName =
      doc.status.provisioning.backend === 'prometheus' && doc.status.provisioning.alertGroupName
        ? doc.status.provisioning.alertGroupName
        : '';
    ruler.dropGroup(namespace, groupName);

    // Probe sees the missing group, repair moves to upsert — upsert rejects.
    ruler.setUpsertError(new SloRulerError('RULER_VALIDATION_FAILED', 400, 'bad rule'));

    const storedBefore = await store.get(doc.id);

    await expect(svc.repair(doc.id, repairCtx)).rejects.toMatchObject({
      name: 'SloRulerError',
      code: 'RULER_VALIDATION_FAILED',
    });

    // SO is unchanged (repair never mutates the store; only the ruler).
    const storedAfter = await store.get(doc.id);
    expect(storedAfter).toEqual(storedBefore);
  });

  it('rules_partial branch: probe first returns null then the group; repair upserts once and re-probes to ok', async () => {
    // Single-group SLOs persist exactly one rule group, so the on-disk partial
    // case and the all-missing case collapse to the same `expectedGroups` set
    // of size 1. We exercise the `rules_partial`-style wiring by scripting the
    // fake ruler's `getRuleGroup` to return null on the *first* call for the
    // SLO's group and the real stored group on subsequent calls — which makes
    // the pre-repair probe see 'missing' (1 of 1 absent) and the post-repair
    // probe see 'ok'. The branch under test is "repair upserts, then the
    // post-probe re-reads as healthy"; whether the pre-state was
    // rules_missing or rules_partial is structurally equivalent for the
    // single-group shape.
    const { svc, ruler, deploy, repairCtx, namespace } = makeHarness();
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);

    const groupName =
      doc.status.provisioning.backend === 'prometheus' && doc.status.provisioning.alertGroupName
        ? doc.status.provisioning.alertGroupName
        : '';
    expect(ruler.hasGroup(namespace, groupName)).toBe(true);

    // Pre-probe answers 'missing'; after repair re-upserts and re-probes, the
    // fake has the group back and the post-probe answers 'ok'.
    ruler.setNullOnceForGroup(groupName);

    const result = await svc.repair(doc.id, repairCtx);
    expect(result.repaired).toBe(true);
    expect(result.health.state).toBe('ok');
    expect(result.health.presentGroups).toEqual([groupName]);
    expect(ruler.hasGroup(namespace, groupName)).toBe(true);
  });

  it('throws SloNotFoundError when the SLO id is unknown', async () => {
    const { svc, repairCtx } = makeHarness();
    await expect(svc.repair('no-such-slo', repairCtx)).rejects.toBeInstanceOf(SloNotFoundError);
  });
});

// ============================================================================
// Dedup-shape repair
//
// Pins the shape contract a dedup-shape `repair()` must honor. An earlier
// `repair()` called `generateSloRuleGroup` unconditionally and emitted a
// single-group `slo:<slug>_<suffix>` group carrying identity labels on
// recording rules. These tests fail against that code: (a) exact-shape
// assertion rejects the wrong group name, (b) recording-rule annotation
// assertion rejects the identity labels bundled with no-annotation invariant,
// (c) the alert group provenance assertion rejects the fact the single-group
// path never calls `annotateAlertGroup`.
// ============================================================================

class FakeRefStore implements SloRuleRefStoreLite {
  public readonly refs = new Map<string, { refcount: number }>();
  private key(ws: string, ds: string, fp: string): string {
    return `${ws}|${ds}|${fp}`;
  }
  async get(ws: string, ds: string, fp: string) {
    const doc = this.refs.get(this.key(ws, ds, fp));
    return doc ? { attributes: { refcount: doc.refcount } } : null;
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
    existing.refcount -= 1;
    return { droppedToZero: existing.refcount === 0, underflow: false };
  }
}

function makeDedupHarness() {
  const store = new InMemorySloStore();
  const ruler = new FakeRulerClient();
  const logger = noopLogger();
  const svc = new SloService(logger, store);
  svc.setDedupEnabled(true);
  svc.setRuleRefStore(new FakeRefStore());
  const health = createRuleHealthChecker(ruler, logger, { ttlMs: 0 });
  const datasource: Datasource = {
    id: 'ds-1',
    name: 'prom-ds-001',
    type: 'prometheus',
    url: '',
    enabled: true,
    directQueryName: 'prom-connection',
  };
  const client = ({
    transport: { request: () => Promise.resolve({}) },
  } as unknown) as AlertingOSClient;
  const deploy: SloDeployContext = {
    ruler,
    client,
    datasource,
    workspaceId: 'ws-dedup',
    OSDWorkspaceId: 'ws-dedup',
  };
  const repairCtx: SloRepairContext = { health, deploy };
  const namespace = sloRulerNamespaceFor(deploy.workspaceId);
  return { store, ruler, svc, deploy, repairCtx, namespace, health };
}

describe('SloService.repair — dedup integration', () => {
  it('restores a dropped recording group with the dedup shape: slo:rec:<fp> + slo:alerts:<...>, no single-group slo:<slug>_<suffix> garbage group', async () => {
    const { svc, ruler, deploy, repairCtx, namespace } = makeDedupHarness();
    const spec = validSpec();
    const doc = await svc.create({ spec }, 'alice', deploy);

    // Establish the dedup-shape ruler state create just wrote.
    const fp = computeSliFingerprint(spec.datasourceId, spec.sli, spec.objectives[0]);
    expect(fp).not.toBeNull();
    const recGroup = dedupRecordingGroupName(fp!);
    const alertGroup = dedupAlertGroupName(spec.name, 'ws-dedup', doc.id);
    expect(ruler.listGroupNames(namespace).sort()).toEqual([alertGroup, recGroup].sort());

    // Out-of-band DELETE /api/v1/rules/{ns}/slo:rec:<fp>.
    ruler.dropGroup(namespace, recGroup);

    const result = await svc.repair(doc.id, repairCtx);

    expect(result.repaired).toBe(true);
    expect(result.health.state).toBe('ok');

    // Exact shape: the ruler has only the two expected groups. No legacy
    // monolithic group anywhere. This is the assertion that fails against
    // the pre-fix `repair()`: it would have produced a third group named
    // `slo:<slug>_<suffix>` carrying identity-labeled recording rules.
    expect(ruler.listGroupNames(namespace).sort()).toEqual([alertGroup, recGroup].sort());
    expect(ruler.hasGroup(namespace, recGroup)).toBe(true);
    expect(ruler.hasGroup(namespace, alertGroup)).toBe(true);

    // Recording group: rules are recording-only, no identity labels (slo_id,
    // slo_name, etc.), and no annotations. Dedup invariant — if the rules
    // carried identity labels the group wouldn't be reusable across SLOs
    // sharing a fingerprint.
    const rec = ruler.groupByName(namespace, recGroup)!;
    for (const rule of rec.rules) {
      expect(rule.type).toBe('recording');
      expect(rule.labels?.slo_id).toBeUndefined();
      expect(rule.labels?.slo_name).toBeUndefined();
      // Annotations on a recording rule are a Cortex 400 (the fake ruler
      // also enforces this now).
      expect(rule.annotations ? Object.keys(rule.annotations).length : 0).toBe(0);
    }

    // Alert group: first rule carries the provenance annotation so the
    // adoption path can re-classify this group after the SO gets lost.
    const alert = ruler.groupByName(namespace, alertGroup)!;
    expect(alert.rules[0].annotations?.[ALERT_PROVENANCE_ANNOTATION_KEY]).toBeDefined();
  });

  it('re-upserts BOTH groups when both were deleted out-of-band', async () => {
    const { svc, ruler, deploy, repairCtx, namespace } = makeDedupHarness();
    const spec = validSpec();
    const doc = await svc.create({ spec }, 'alice', deploy);

    const fp = computeSliFingerprint(spec.datasourceId, spec.sli, spec.objectives[0])!;
    const recGroup = dedupRecordingGroupName(fp);
    const alertGroup = dedupAlertGroupName(spec.name, 'ws-dedup', doc.id);

    ruler.dropGroup(namespace, recGroup);
    ruler.dropGroup(namespace, alertGroup);
    expect(ruler.listGroupNames(namespace)).toEqual([]);

    const result = await svc.repair(doc.id, repairCtx);

    expect(result.repaired).toBe(true);
    expect(result.health.state).toBe('ok');
    expect(ruler.listGroupNames(namespace).sort()).toEqual([alertGroup, recGroup].sort());
  });

  it('idempotent on a healthy dedup SLO: repeat repair does not re-upsert', async () => {
    const { svc, ruler, deploy, repairCtx } = makeDedupHarness();
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);
    const upsertsAfterCreate = ruler.upsertCalls;

    const first = await svc.repair(doc.id, repairCtx);
    expect(first.repaired).toBe(false);
    expect(first.health.state).toBe('ok');
    expect(ruler.upsertCalls).toBe(upsertsAfterCreate);

    const second = await svc.repair(doc.id, repairCtx);
    expect(second.repaired).toBe(false);
    expect(second.health.state).toBe('ok');
    expect(ruler.upsertCalls).toBe(upsertsAfterCreate);
  });
});

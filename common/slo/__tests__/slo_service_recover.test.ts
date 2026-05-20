/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable max-classes-per-file */

/**
 * Phase 4 W4.4 — SloService.recover() unit tests.
 *
 * The fixture seeds the ruler with a fully-formed dedup-shape alert group
 * (annotated with `osd_slo_provenance`) plus the matching recording group.
 * Each test mutates one precondition (spec drift, workspace mismatch,
 * tombstone, etc.) and asserts the expected `SloAdoptionError.code`.
 *
 * The harness reuses `SloService` + a Map-backed tombstone fake + a
 * Map-backed ref store (mirrors `slo_service_dedup.test.ts`).
 */

import {
  SloAdoptionError,
  SloDeployContext,
  SloNotFoundError,
  SloRuleRefStoreLite,
  SloRulerClient,
  SloService,
  SloTombstoneAttributesLite,
  SloTombstoneStoreLite,
  SloValidationError,
} from '../slo_service';
import { InMemorySloStore } from '../slo_store';
import {
  DEFAULT_MWMBR_TIERS,
  dedupAlertGroupName,
  dedupRecordingGroupName,
  generateAlertGroupFor,
  generateRecordingGroupForFingerprint,
} from '../slo_promql_generator';
import { computeSliFingerprint } from '../slo_sli_fingerprint';
import {
  ALERT_PROVENANCE_ANNOTATION_KEY,
  annotateAlertGroup,
  buildAlertProvenance,
} from '../slo_rule_provenance';
import type { AlertingOSClient, Datasource, Logger } from '../../types/alerting/types';
import type { GeneratedRuleGroup, SloDocument, SloSpec } from '../slo_types';

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
 * Full-surface ruler fake — implements the extended `SloRulerClient` plus
 * `listRuleGroups` (used by recover/clone). The dedup-test `FakeRuler`
 * doesn't expose list, so we maintain a local copy here.
 */
class FakeRuler implements SloRulerClient {
  public upsertCalls = 0;
  public upsertsByGroup = new Map<string, number>();
  public deleteCalls = 0;
  public listCalls = 0;
  private groups = new Map<string, GeneratedRuleGroup>();
  public upsertError: Error | null = null;
  public listError: Error | null = null;

  private key(ns: string, name: string): string {
    return `${ns}|${name}`;
  }

  seed(namespace: string, group: GeneratedRuleGroup): void {
    this.groups.set(this.key(namespace, group.groupName), group);
  }
  drop(namespace: string, groupName: string): void {
    this.groups.delete(this.key(namespace, groupName));
  }
  hasGroup(namespace: string, groupName: string): boolean {
    return this.groups.has(this.key(namespace, groupName));
  }
  getGroup(namespace: string, groupName: string): GeneratedRuleGroup | undefined {
    return this.groups.get(this.key(namespace, groupName));
  }

  async upsertRuleGroup(
    _c: AlertingOSClient,
    _ds: Datasource,
    namespace: string,
    group: GeneratedRuleGroup
  ): Promise<void> {
    this.upsertCalls += 1;
    if (this.upsertError) throw this.upsertError;
    this.upsertsByGroup.set(group.groupName, (this.upsertsByGroup.get(group.groupName) ?? 0) + 1);
    this.groups.set(this.key(namespace, group.groupName), group);
  }
  async deleteRuleGroup(
    _c: AlertingOSClient,
    _ds: Datasource,
    namespace: string,
    groupName: string
  ): Promise<void> {
    this.deleteCalls += 1;
    this.groups.delete(this.key(namespace, groupName));
  }
  async listRuleGroups(
    _c: AlertingOSClient,
    _ds: Datasource,
    namespace: string
  ): Promise<GeneratedRuleGroup[]> {
    this.listCalls += 1;
    if (this.listError) throw this.listError;
    const prefix = `${namespace}|`;
    const out: GeneratedRuleGroup[] = [];
    for (const [k, v] of this.groups.entries()) {
      if (k.startsWith(prefix)) out.push(v);
    }
    return out;
  }
}

class FakeRefStore implements SloRuleRefStoreLite {
  public readonly refs = new Map<string, { refcount: number }>();
  public incrementError: Error | null = null;
  public incrementFailOnFp: string | null = null;
  private key(ws: string, ds: string, fp: string): string {
    return `${ws}|${ds}|${fp}`;
  }
  async get(ws: string, ds: string, fp: string) {
    const r = this.refs.get(this.key(ws, ds, fp));
    return r ? { attributes: { refcount: r.refcount } } : null;
  }
  async incrementRef(input: {
    workspaceId: string;
    datasourceId: string;
    fingerprint: string;
    fingerprintVersion: string;
    groupName: string;
    namespace: string;
  }): Promise<{ wasZero: boolean }> {
    if (this.incrementError) throw this.incrementError;
    if (this.incrementFailOnFp && this.incrementFailOnFp === input.fingerprint) {
      throw new Error(`synthetic increment failure for ${input.fingerprint}`);
    }
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
    if (existing.refcount <= 0) return { droppedToZero: false, underflow: true };
    existing.refcount -= 1;
    return { droppedToZero: existing.refcount === 0, underflow: false };
  }
  refcount(ws: string, ds: string, fp: string): number {
    return this.refs.get(this.key(ws, ds, fp))?.refcount ?? 0;
  }
  seed(ws: string, ds: string, fp: string, count: number): void {
    this.refs.set(this.key(ws, ds, fp), { refcount: count });
  }
}

class FakeTombstoneStore implements SloTombstoneStoreLite {
  public readonly entries = new Map<string, SloTombstoneAttributesLite>();
  public removeCalls: string[] = [];
  async write(attrs: SloTombstoneAttributesLite): Promise<void> {
    this.entries.set(attrs.sloId, attrs);
  }
  async get(sloId: string) {
    const a = this.entries.get(sloId);
    return a ? { attributes: a } : null;
  }
  async remove(sloId: string): Promise<boolean> {
    this.removeCalls.push(sloId);
    return this.entries.delete(sloId);
  }
}

/**
 * Seed a dedup-shape rule set on the ruler matching the given SLO identity.
 * Returns everything a test might need to probe after.
 */
function seedRuler(
  ruler: FakeRuler,
  opts: {
    spec: SloSpec;
    sloId: string;
    workspaceId: string;
    datasourceId: string;
    pluginVersion?: string;
    createdAt?: string;
    updatedAt?: string;
    // Optional mutations to the annotation before it's written — lets tests
    // craft drift / schema-mismatch payloads without round-tripping to JSON.
    mutateProvenanceValue?: (value: string) => string;
    // When set, suppress the recording group upsert — simulates a ruler-side
    // partial where the alert group survives but its shared recording group
    // was swept.
    omitRecordingGroup?: boolean;
  }
): {
  alertGroupName: string;
  recordingGroupName: string;
  fingerprint: string;
  namespace: string;
} {
  const createdAt = opts.createdAt ?? '2026-04-01T00:00:00Z';
  const updatedAt = opts.updatedAt ?? createdAt;
  const namespace = `slo-generated-${opts.workspaceId}`;

  const objective = opts.spec.objectives[0];
  const fp = computeSliFingerprint(opts.datasourceId, opts.spec.sli, objective);
  if (fp === null) {
    throw new Error('test seed: SLI produced null fingerprint');
  }
  const fingerprints = { [objective.name]: fp };

  // Recording group.
  if (!opts.omitRecordingGroup) {
    if (opts.spec.sli.type !== 'single') throw new Error('single SLI required');
    const recording = generateRecordingGroupForFingerprint({
      fingerprint: fp,
      sli: opts.spec.sli,
      objectiveLatencyThreshold: objective.latencyThreshold,
    });
    if (recording) {
      // Recording groups are NOT annotated — Cortex forbids annotations on
      // recording rules. The detector relies on the slo:rec:<fp> name pattern.
      ruler.seed(namespace, recording);
    }
  }

  // Alert group. We build it against a minimal stand-in doc to reuse the
  // real generator — mirrors what `createDedup` does in production.
  const stubDoc: SloDocument = {
    id: opts.sloId,
    spec: opts.spec,
    status: {
      version: 1,
      createdAt,
      createdBy: 'alice',
      updatedAt,
      updatedBy: 'alice',
      provisioning: {
        backend: 'prometheus',
        rulerNamespace: namespace,
        recordingFingerprints: fingerprints,
        alertGroupName: dedupAlertGroupName(opts.spec.name, opts.workspaceId, opts.sloId),
      },
    },
  };
  const rawAlert = generateAlertGroupFor(stubDoc, fingerprints, {
    workspaceId: opts.workspaceId,
  });
  const provenance = buildAlertProvenance({
    pluginVersion: opts.pluginVersion ?? '9.9.9',
    sloId: opts.sloId,
    workspaceId: opts.workspaceId,
    datasourceId: opts.datasourceId,
    createdAt,
    updatedAt,
    spec: opts.spec,
  });
  let annotatedAlert = annotateAlertGroup(rawAlert, provenance);
  if (opts.mutateProvenanceValue) {
    const first = annotatedAlert.rules[0];
    const current = first.annotations![ALERT_PROVENANCE_ANNOTATION_KEY];
    const mutated = opts.mutateProvenanceValue(current);
    annotatedAlert = {
      ...annotatedAlert,
      rules: [
        {
          ...first,
          annotations: { ...first.annotations, [ALERT_PROVENANCE_ANNOTATION_KEY]: mutated },
        },
        ...annotatedAlert.rules.slice(1),
      ],
    };
  }
  ruler.seed(namespace, annotatedAlert);

  return {
    alertGroupName: annotatedAlert.groupName,
    recordingGroupName: dedupRecordingGroupName(fp),
    fingerprint: fp,
    namespace,
  };
}

function makeHarness() {
  const store = new InMemorySloStore();
  const ruler = new FakeRuler();
  const refStore = new FakeRefStore();
  const tombstones = new FakeTombstoneStore();
  const svc = new SloService(noopLogger(), store);
  svc.setDedupEnabled(true);
  svc.setRuleRefStore(refStore);
  svc.setTombstoneStore(tombstones);
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
  const deploy: SloDeployContext = {
    ruler,
    client,
    datasource,
    workspaceId: 'ws-001',
  };
  return { store, ruler, refStore, tombstones, svc, deploy };
}

// ============================================================================
// Tests
// ============================================================================

describe('SloService.recover (W4.4)', () => {
  it('happy path: materializes SO, increments refs, skips alert-group re-upsert, reports refcountChanges', async () => {
    const { svc, ruler, refStore, store, deploy } = makeHarness();
    const spec = validSpec();
    const seeded = seedRuler(ruler, {
      spec,
      sloId: 'slo-happy',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001',
    });
    // Seed the ref store so the fingerprint is already claimed by two
    // sibling SLOs — the refcount should go 2 → 3.
    refStore.seed('ws-001', 'prom-ds-001', seeded.fingerprint, 2);
    const upsertsBefore = ruler.upsertCalls;

    const result = await svc.recover(
      { sloId: 'slo-happy', datasourceId: 'prom-ds-001', workspaceId: 'ws-001' },
      deploy
    );

    expect(result.slo.id).toBe('slo-happy');
    expect(result.tombstoneCleared).toBe(false);
    expect(result.refcountChanges).toEqual([
      { fingerprint: seeded.fingerprint, previousRefcount: 2, newRefcount: 3 },
    ]);
    // SO was persisted.
    const persisted = await store.get('slo-happy');
    expect(persisted).not.toBeNull();
    const persistedProv = persisted!.status.provisioning;
    expect(persistedProv.backend).toBe('prometheus');
    const adoptionSource =
      persistedProv.backend === 'prometheus' ? persistedProv.adoptionSource : undefined;
    const alertGroupName =
      persistedProv.backend === 'prometheus' ? persistedProv.alertGroupName : undefined;
    expect(adoptionSource?.source).toBe('recover');
    expect(alertGroupName).toBe(seeded.alertGroupName);
    // Refcount bumped.
    expect(refStore.refcount('ws-001', 'prom-ds-001', seeded.fingerprint)).toBe(3);
    // No re-upsert to the ruler — alert group was already present and we skip.
    expect(ruler.upsertCalls).toBe(upsertsBefore);
  });

  it('ORPHAN_CLAIM_CONFLICT when an SO already exists for sloId', async () => {
    const { svc, ruler, deploy, store } = makeHarness();
    const spec = validSpec();
    seedRuler(ruler, {
      spec,
      sloId: 'slo-dup',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001',
    });
    // Seed a live SO.
    await store.save({
      id: 'slo-dup',
      spec,
      status: {
        version: 1,
        createdAt: '2026-01-01T00:00:00Z',
        createdBy: 'alice',
        updatedAt: '2026-01-01T00:00:00Z',
        updatedBy: 'alice',
        provisioning: {
          backend: 'prometheus',
          rulerNamespace: 'slo-generated-ws-001',
        },
      },
    });

    await expect(
      svc.recover({ sloId: 'slo-dup', datasourceId: 'prom-ds-001', workspaceId: 'ws-001' }, deploy)
    ).rejects.toMatchObject({
      name: 'SloAdoptionError',
      code: 'ORPHAN_CLAIM_CONFLICT',
    });
  });

  it('SloNotFoundError when no alert group with matching provenance is found', async () => {
    const { svc, deploy } = makeHarness();
    await expect(
      svc.recover(
        { sloId: 'slo-missing', datasourceId: 'prom-ds-001', workspaceId: 'ws-001' },
        deploy
      )
    ).rejects.toBeInstanceOf(SloNotFoundError);
  });

  it('ORPHAN_UNSUPPORTED_SCHEMA when provenance schemaVersion is v99', async () => {
    const { svc, ruler, deploy } = makeHarness();
    const spec = validSpec();
    seedRuler(ruler, {
      spec,
      sloId: 'slo-v99',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001',
      mutateProvenanceValue: (value) => {
        const parsed = JSON.parse(value);
        parsed.schemaVersion = 99;
        return JSON.stringify(parsed);
      },
    });
    // Session B Item 1: the service disambiguates "schemaVersion we can't
    // parse" from "no matching group" by scanning annotations with a loose
    // parse when `findAdoptableAlertGroup` returned null. The orphan here
    // has the caller's sloId but schemaVersion=99; recover surfaces
    // `ORPHAN_UNSUPPORTED_SCHEMA` so the UI can render "upgrade plugin"
    // instead of "SLO not found".
    await expect(
      svc.recover({ sloId: 'slo-v99', datasourceId: 'prom-ds-001', workspaceId: 'ws-001' }, deploy)
    ).rejects.toMatchObject({
      name: 'SloAdoptionError',
      code: 'ORPHAN_UNSUPPORTED_SCHEMA',
      context: expect.objectContaining({ sloId: 'slo-v99', schemaVersion: '99' }),
    });
  });

  it('SloNotFoundError when no alert group with matching sloId is present (legacy-layout fallthrough)', async () => {
    const { svc, ruler, deploy } = makeHarness();
    // Seed an adoptable orphan under a different sloId — the recover call
    // below asks for `slo-other`, which is not present at all. Neither the
    // strict scanner nor the loose unsupported-schema scanner should match.
    seedRuler(ruler, {
      spec: validSpec(),
      sloId: 'slo-present',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001',
    });
    await expect(
      svc.recover(
        { sloId: 'slo-other', datasourceId: 'prom-ds-001', workspaceId: 'ws-001' },
        deploy
      )
    ).rejects.toBeInstanceOf(SloNotFoundError);
  });

  it('ORPHAN_WORKSPACE_MISMATCH when the provenance datasourceId differs', async () => {
    const { svc, ruler, deploy } = makeHarness();
    const spec = validSpec();
    seedRuler(ruler, {
      spec,
      sloId: 'slo-ws1',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001',
      // Patch the provenance to claim a different datasource; the sha256
      // stays valid because we only mutate after computeSpecSha256.
      mutateProvenanceValue: (value) => {
        const parsed = JSON.parse(value);
        parsed.datasourceId = 'prom-ds-DIFFERENT';
        return JSON.stringify(parsed);
      },
    });
    await expect(
      svc.recover({ sloId: 'slo-ws1', datasourceId: 'prom-ds-001', workspaceId: 'ws-001' }, deploy)
    ).rejects.toMatchObject({
      name: 'SloAdoptionError',
      code: 'ORPHAN_WORKSPACE_MISMATCH',
    });
  });

  it('ORPHAN_WORKSPACE_MISMATCH when the provenance workspaceId differs', async () => {
    const { svc, ruler, deploy } = makeHarness();
    const spec = validSpec();
    seedRuler(ruler, {
      spec,
      sloId: 'slo-ws2',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001',
      mutateProvenanceValue: (value) => {
        const parsed = JSON.parse(value);
        parsed.workspaceId = 'ws-OTHER';
        return JSON.stringify(parsed);
      },
    });
    await expect(
      svc.recover({ sloId: 'slo-ws2', datasourceId: 'prom-ds-001', workspaceId: 'ws-001' }, deploy)
    ).rejects.toMatchObject({
      name: 'SloAdoptionError',
      code: 'ORPHAN_WORKSPACE_MISMATCH',
    });
  });

  it('ORPHAN_SPEC_DRIFT when the specSha256 no longer matches', async () => {
    const { svc, ruler, deploy } = makeHarness();
    const spec = validSpec();
    seedRuler(ruler, {
      spec,
      sloId: 'slo-drift',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001',
      mutateProvenanceValue: (value) => {
        const parsed = JSON.parse(value);
        // Mutate the spec after sha256 is computed → sha256 no longer matches.
        parsed.spec.name = 'Tampered';
        return JSON.stringify(parsed);
      },
    });
    await expect(
      svc.recover(
        { sloId: 'slo-drift', datasourceId: 'prom-ds-001', workspaceId: 'ws-001' },
        deploy
      )
    ).rejects.toMatchObject({
      name: 'SloAdoptionError',
      code: 'ORPHAN_SPEC_DRIFT',
    });
  });

  it('ORPHAN_SPEC_DRIFT when a recording group is missing from the ruler', async () => {
    const { svc, ruler, deploy } = makeHarness();
    const spec = validSpec();
    seedRuler(ruler, {
      spec,
      sloId: 'slo-nofp',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001',
      omitRecordingGroup: true,
    });
    await expect(
      svc.recover({ sloId: 'slo-nofp', datasourceId: 'prom-ds-001', workspaceId: 'ws-001' }, deploy)
    ).rejects.toMatchObject({
      name: 'SloAdoptionError',
      code: 'ORPHAN_SPEC_DRIFT',
    });
  });

  it('ORPHAN_SPEC_DRIFT when the embedded spec fails current validation', async () => {
    const { svc, ruler, deploy } = makeHarness();
    const spec = validSpec();
    // Replace the spec with one missing a required field. We have to keep
    // the sha256 intact, so mutate both spec and specSha256 together.
    seedRuler(ruler, {
      spec,
      sloId: 'slo-invalid',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001',
      mutateProvenanceValue: (value) => {
        const parsed = JSON.parse(value);
        // Strip the required `service` field; re-hash so sha256 stays consistent.
        delete parsed.spec.service;
        // Recompute sha256 inline to isolate the "invalid spec" failure from
        // the "sha256 drift" failure. Use the same canonicalization as
        // `computeSpecSha256`.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { createHash } = require('crypto') as typeof import('crypto');
        const sortKeys = (v: unknown): unknown => {
          if (Array.isArray(v)) return v.map(sortKeys);
          if (v === null || typeof v !== 'object') return v;
          const o = v as Record<string, unknown>;
          const out: Record<string, unknown> = {};
          for (const k of Object.keys(o).sort()) out[k] = sortKeys(o[k]);
          return out;
        };
        parsed.specSha256 = createHash('sha256')
          .update(JSON.stringify(sortKeys(parsed.spec)))
          .digest('hex');
        return JSON.stringify(parsed);
      },
    });
    await expect(
      svc.recover(
        { sloId: 'slo-invalid', datasourceId: 'prom-ds-001', workspaceId: 'ws-001' },
        deploy
      )
    ).rejects.toMatchObject({
      name: 'SloAdoptionError',
      code: 'ORPHAN_SPEC_DRIFT',
    });
  });

  it('ORPHAN_TOMBSTONED when a tombstone exists and the caller did not acknowledge', async () => {
    const { svc, ruler, deploy, tombstones } = makeHarness();
    const spec = validSpec();
    seedRuler(ruler, {
      spec,
      sloId: 'slo-tomb',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001',
    });
    await tombstones.write({
      sloId: 'slo-tomb',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001',
      name: spec.name,
      reason: 'user_delete',
      createdAt: '2026-04-15T12:00:00Z',
    });

    await expect(
      svc.recover({ sloId: 'slo-tomb', datasourceId: 'prom-ds-001', workspaceId: 'ws-001' }, deploy)
    ).rejects.toMatchObject({
      name: 'SloAdoptionError',
      code: 'ORPHAN_TOMBSTONED',
    });
  });

  it('tombstone acknowledged: returns tombstoneCleared: true and the tombstone is removed', async () => {
    const { svc, ruler, deploy, tombstones } = makeHarness();
    const spec = validSpec();
    seedRuler(ruler, {
      spec,
      sloId: 'slo-tomb-ack',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001',
    });
    await tombstones.write({
      sloId: 'slo-tomb-ack',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001',
      name: spec.name,
      reason: 'user_delete',
      createdAt: '2026-04-15T12:00:00Z',
    });

    const result = await svc.recover(
      {
        sloId: 'slo-tomb-ack',
        datasourceId: 'prom-ds-001',
        workspaceId: 'ws-001',
        acknowledgeTombstone: true,
      },
      deploy
    );

    expect(result.tombstoneCleared).toBe(true);
    expect(tombstones.removeCalls).toContain('slo-tomb-ack');
    expect(tombstones.entries.has('slo-tomb-ack')).toBe(false);
  });

  it('ref-increment failure rolls back prior increments and surfaces ORPHAN_CLAIM_CONFLICT', async () => {
    // A single-objective spec produces one fingerprint. We inject a
    // synthetic increment failure on that fingerprint; no SO should be
    // saved and no refs should leak. (For multi-fp rollback coverage, the
    // dedup-integration tests in Batch 2 exercise the full update path.)
    const { svc, ruler, refStore, deploy, store } = makeHarness();
    const spec = validSpec();
    const seeded = seedRuler(ruler, {
      spec,
      sloId: 'slo-rollback',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001',
    });
    refStore.incrementFailOnFp = seeded.fingerprint;

    await expect(
      svc.recover(
        { sloId: 'slo-rollback', datasourceId: 'prom-ds-001', workspaceId: 'ws-001' },
        deploy
      )
    ).rejects.toMatchObject({
      name: 'SloAdoptionError',
      code: 'ORPHAN_CLAIM_CONFLICT',
    });
    // No refs left behind, no SO saved.
    expect(refStore.refcount('ws-001', 'prom-ds-001', seeded.fingerprint)).toBe(0);
    expect(await store.get('slo-rollback')).toBeNull();
  });

  it('dedup off throws SloValidationError mentioning ruleDedup', async () => {
    const { svc, ruler, deploy } = makeHarness();
    svc.setDedupEnabled(false);
    const spec = validSpec();
    seedRuler(ruler, {
      spec,
      sloId: 'slo-nodup',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001',
    });
    await expect(
      svc.recover(
        { sloId: 'slo-nodup', datasourceId: 'prom-ds-001', workspaceId: 'ws-001' },
        deploy
      )
    ).rejects.toBeInstanceOf(SloValidationError);

    let caught: SloValidationError | null = null;
    try {
      await svc.recover(
        { sloId: 'slo-nodup', datasourceId: 'prom-ds-001', workspaceId: 'ws-001' },
        deploy
      );
    } catch (err) {
      caught = err as SloValidationError;
    }
    expect(caught).toBeInstanceOf(SloValidationError);
    expect(JSON.stringify(caught!.errors)).toMatch(/ruleDedup/);
  });

  it('refcountChanges reflects before/after for every unique fingerprint', async () => {
    const { svc, ruler, refStore, deploy } = makeHarness();
    const spec = validSpec();
    const seeded = seedRuler(ruler, {
      spec,
      sloId: 'slo-counts',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001',
    });
    const result = await svc.recover(
      { sloId: 'slo-counts', datasourceId: 'prom-ds-001', workspaceId: 'ws-001' },
      deploy
    );
    expect(result.refcountChanges).toHaveLength(1);
    expect(result.refcountChanges[0]).toEqual({
      fingerprint: seeded.fingerprint,
      previousRefcount: 0,
      newRefcount: 1,
    });
    expect(refStore.refcount('ws-001', 'prom-ds-001', seeded.fingerprint)).toBe(1);
  });

  it('concurrent recover: second caller sees CLAIM_CONFLICT once the first finishes', async () => {
    // Simulate the race by running recover twice back-to-back; the second
    // call discovers the SO written by the first and rejects.
    const { svc, ruler, deploy } = makeHarness();
    const spec = validSpec();
    seedRuler(ruler, {
      spec,
      sloId: 'slo-race',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001',
    });

    await svc.recover(
      { sloId: 'slo-race', datasourceId: 'prom-ds-001', workspaceId: 'ws-001' },
      deploy
    );
    await expect(
      svc.recover({ sloId: 'slo-race', datasourceId: 'prom-ds-001', workspaceId: 'ws-001' }, deploy)
    ).rejects.toMatchObject({
      name: 'SloAdoptionError',
      code: 'ORPHAN_CLAIM_CONFLICT',
    });
  });

  it('SO save failure rolls back ref increments', async () => {
    const { svc, ruler, refStore, deploy, store } = makeHarness();
    const spec = validSpec();
    const seeded = seedRuler(ruler, {
      spec,
      sloId: 'slo-save-fail',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001',
    });
    const orig = store.save.bind(store);
    const spy = jest.spyOn(store, 'save').mockRejectedValueOnce(new Error('boom SO write'));
    await expect(
      svc.recover(
        { sloId: 'slo-save-fail', datasourceId: 'prom-ds-001', workspaceId: 'ws-001' },
        deploy
      )
    ).rejects.toThrow('boom SO write');
    // Ref count rolled back to 0.
    expect(refStore.refcount('ws-001', 'prom-ds-001', seeded.fingerprint)).toBe(0);
    spy.mockRestore();
    // Restore passthrough for any future save calls.
    store.save = orig;
  });

  it('SloAdoptionError has a stable constructor shape (code + message + context)', () => {
    const err = new SloAdoptionError('ORPHAN_SPEC_DRIFT', 'bad', { sloId: 'x' });
    expect(err.code).toBe('ORPHAN_SPEC_DRIFT');
    expect(err.message).toBe('bad');
    expect(err.context).toEqual({ sloId: 'x' });
  });

  // ==========================================================================
  // Bug E (S17.1) regression: id-or-name equivalence
  // ==========================================================================
  //
  // Provenance annotations written before the name-canonicalization clean-up
  // carry `datasourceId: "ds-N"` while the current UI calls the recover route
  // with the user-facing name. `deploy.datasource` resolves to the same
  // record either way, so recover accepts either form.

  it('accepts the datasource NAME in input even though provenance records the ds-N id', async () => {
    const { svc, ruler, deploy } = makeHarness();
    const spec = validSpec();
    seedRuler(ruler, {
      spec,
      sloId: 'slo-name-input',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001', // provenance gets the internal id
    });
    // Caller passes the user-facing NAME — no longer rejects as workspace mismatch.
    const result = await svc.recover(
      { sloId: 'slo-name-input', datasourceId: 'prom', workspaceId: 'ws-001' },
      deploy
    );
    expect(result.slo.id).toBe('slo-name-input');
  });

  // Follow-up #4 backward-compat pin: new plugin writes canonicalize the
  // provenance datasourceId to the datasource NAME, but Cortex still holds
  // alert groups written before the canonicalization landed — those carry
  // `datasourceId: "ds-N"`. `recover()` must keep parsing them via the
  // id-or-name equivalence fallback in `SloService.findAdoptableAlertGroup`.
  // If this test starts failing, that fallback was removed prematurely.
  it('still adopts pre-follow-up-4 alert groups whose provenance carries ds-N (id form)', async () => {
    const { svc, ruler, deploy, store } = makeHarness();
    const spec = validSpec();
    // Seed with the legacy id form in provenance — this is what Cortex
    // already has on disk from any plugin version older than follow-up #4.
    const seeded = seedRuler(ruler, {
      spec,
      sloId: 'slo-legacy-id-provenance',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001', // deploy.datasource.id
    });
    // Caller passes the canonical NAME (what the UI sends today).
    const result = await svc.recover(
      {
        sloId: 'slo-legacy-id-provenance',
        datasourceId: 'prom', // deploy.datasource.name
        workspaceId: 'ws-001',
      },
      deploy
    );
    expect(result.slo.id).toBe('slo-legacy-id-provenance');
    // SO materialized from the embedded spec; alert group was already on
    // the ruler, so no re-upsert. The alert group name came from seed.
    const persisted = await store.get('slo-legacy-id-provenance');
    expect(persisted).not.toBeNull();
    const prov = persisted!.status.provisioning;
    const alertGroupName = prov.backend === 'prometheus' ? prov.alertGroupName : undefined;
    expect(prov.backend).toBe('prometheus');
    expect(alertGroupName).toBe(seeded.alertGroupName);
  });

  it('falls back to deploy.workspaceId when input.workspaceId is omitted', async () => {
    const { svc, ruler, deploy } = makeHarness();
    const spec = validSpec();
    seedRuler(ruler, {
      spec,
      sloId: 'slo-no-ws',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001',
    });
    // Route-adapter type lets workspaceId be omitted — the Lite interface
    // declares it optional while the service declares it required. Cast so
    // the test exercises the service path that previously produced a
    // namespace of `slo-generated-undefined`.
    const result = await svc.recover(
      ({ sloId: 'slo-no-ws', datasourceId: 'prom-ds-001' } as unknown) as Parameters<
        typeof svc.recover
      >[0],
      deploy
    );
    expect(result.slo.id).toBe('slo-no-ws');
  });

  it('rejects with WORKSPACE_MISMATCH when input names a completely different datasource', async () => {
    const { svc, ruler, deploy } = makeHarness();
    const spec = validSpec();
    seedRuler(ruler, {
      spec,
      sloId: 'slo-wrong-ds',
      workspaceId: 'ws-001',
      datasourceId: 'prom-ds-001',
    });
    // Deploy context's datasource is {id: prom-ds-001, name: prom}; input
    // names neither. Should still be rejected rather than accepted.
    await expect(
      svc.recover(
        { sloId: 'slo-wrong-ds', datasourceId: 'other-ds-999', workspaceId: 'ws-001' },
        deploy
      )
    ).rejects.toMatchObject({
      name: 'SloAdoptionError',
      code: 'ORPHAN_WORKSPACE_MISMATCH',
    });
  });
});

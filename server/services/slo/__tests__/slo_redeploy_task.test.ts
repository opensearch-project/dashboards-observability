/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable max-classes-per-file */

/**
 * Phase 3 W3.10 — SloRedeployTask tests.
 */

import { createSloRedeployTask } from '../slo_redeploy_task';
import { InMemorySloStore } from '../../../../common/slo/slo_store';
import { computeSliFingerprint } from '../../../../common/slo/slo_sli_fingerprint';
import {
  dedupAlertGroupName,
  dedupRecordingGroupName,
  DEFAULT_MWMBR_TIERS,
  ruleSuffix,
  slugifySloObjective,
} from '../../../../common/slo/slo_promql_generator';
import type { RulerClient } from '../ruler_client';
import type { SloRuleRefStore } from '../slo_rule_ref_store';
import type { AlertingOSClient, Datasource, Logger } from '../../../../common/types/alerting/types';
import type { GeneratedRuleGroup, SloDocument, SloSpec } from '../../../../common/slo/slo_types';
import { InMemoryDatasourceService } from '../../alerting/datasource_service';

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
 * Build a migrated-but-not-yet-redeployed SO. Mirrors the shape `slo_v2`
 * leaves behind: dedup fields populated, `needsRedeploy: true`. The
 * redeploy task still targets the legacy monolithic group for deletion;
 * the group name is recomputed inside the task from spec + workspaceId +
 * sloId (no explicit field carries it).
 */
function migratedDoc(id: string, spec: SloSpec, workspaceId: string): SloDocument {
  const fingerprints: Record<string, string> = {};
  for (const obj of spec.objectives) {
    const fp = computeSliFingerprint(spec.datasourceId, spec.sli, obj);
    if (fp) fingerprints[obj.name] = fp;
  }
  const slug = slugifySloObjective(spec.name, 'group');
  const suffix = ruleSuffix(workspaceId, id, 'group');
  return {
    id,
    spec,
    status: {
      version: 2,
      createdAt: '2026-04-01T00:00:00Z',
      createdBy: 'migrate',
      updatedAt: '2026-04-23T00:00:00Z',
      updatedBy: 'migrate',
      provisioning: {
        backend: 'prometheus',
        rulerNamespace: `slo-generated-${workspaceId}`,
        recordingFingerprints: fingerprints,
        alertGroupName: `slo:alerts:${slug}_${suffix}`,
        needsRedeploy: true,
      },
    },
  };
}

class FakeRuler implements RulerClient {
  public upserts: Array<{ namespace: string; group: GeneratedRuleGroup }> = [];
  public deletes: Array<{ namespace: string; groupName: string }> = [];
  private groups = new Map<string, GeneratedRuleGroup>();
  async upsertRuleGroup(
    _c: AlertingOSClient,
    _ds: Datasource,
    namespace: string,
    group: GeneratedRuleGroup
  ): Promise<void> {
    this.upserts.push({ namespace, group });
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
  async listRuleGroups(): Promise<GeneratedRuleGroup[]> {
    return [];
  }
  hasGroup(namespace: string, groupName: string): boolean {
    return this.groups.has(`${namespace}|${groupName}`);
  }
}

class FakeRefStore {
  public refs = new Map<string, { refcount: number }>();
  async get(ws: string, ds: string, fp: string) {
    const e = this.refs.get(`${ws}|${ds}|${fp}`);
    return e
      ? {
          id: `rule-ref:${ws}:${ds}:${fp}`,
          attributes: {
            refcount: e.refcount,
            workspaceId: ws,
            datasourceId: ds,
            fingerprint: fp,
            fingerprintVersion: 'v1',
            groupName: '',
            namespace: '',
            createdAt: '',
            updatedAt: '',
          },
        }
      : null;
  }
  async listByDatasource() {
    return [];
  }
  async listStaleZero() {
    return [];
  }
  async remove() {
    return false;
  }
  async incrementRef(input: {
    workspaceId: string;
    datasourceId: string;
    fingerprint: string;
    fingerprintVersion: string;
    groupName: string;
    namespace: string;
  }) {
    const k = `${input.workspaceId}|${input.datasourceId}|${input.fingerprint}`;
    const e = this.refs.get(k);
    if (!e) {
      this.refs.set(k, { refcount: 1 });
      return {
        doc: {
          id: k,
          attributes: {
            refcount: 1,
            workspaceId: input.workspaceId,
            datasourceId: input.datasourceId,
            fingerprint: input.fingerprint,
            fingerprintVersion: 'v1',
            groupName: input.groupName,
            namespace: input.namespace,
            createdAt: '',
            updatedAt: '',
          },
        },
        wasZero: true,
      };
    }
    const wasZero = e.refcount === 0;
    e.refcount += 1;
    return {
      doc: {
        id: k,
        attributes: {
          refcount: e.refcount,
          workspaceId: input.workspaceId,
          datasourceId: input.datasourceId,
          fingerprint: input.fingerprint,
          fingerprintVersion: 'v1',
          groupName: input.groupName,
          namespace: input.namespace,
          createdAt: '',
          updatedAt: '',
        },
      },
      wasZero,
    };
  }
  async decrementRef(input: { workspaceId: string; datasourceId: string; fingerprint: string }) {
    const k = `${input.workspaceId}|${input.datasourceId}|${input.fingerprint}`;
    const e = this.refs.get(k);
    if (!e) return { doc: null, droppedToZero: false, underflow: true };
    if (e.refcount <= 0) return { doc: null, droppedToZero: false, underflow: true };
    e.refcount -= 1;
    return {
      doc: {
        id: k,
        attributes: {
          refcount: e.refcount,
          workspaceId: input.workspaceId,
          datasourceId: input.datasourceId,
          fingerprint: input.fingerprint,
          fingerprintVersion: 'v1',
          groupName: '',
          namespace: '',
          createdAt: '',
          updatedAt: '',
        },
      },
      droppedToZero: e.refcount === 0,
      underflow: false,
    };
  }
  refcount(ws: string, ds: string, fp: string): number {
    return this.refs.get(`${ws}|${ds}|${fp}`)?.refcount ?? 0;
  }
}

async function makeHarness() {
  const logger = noopLogger();
  const store = new InMemorySloStore();
  const ruler = new FakeRuler();
  const refStore = new FakeRefStore();
  const datasourceService = new InMemoryDatasourceService(logger);
  await datasourceService.create({
    name: 'prom',
    type: 'prometheus',
    url: '',
    enabled: true,
    directQueryName: 'prom-connection',
  });
  // Datasource id comes back as `ds-<n>` or similar; align spec to this.
  const allDs = await datasourceService.list();
  const ds = allDs[0];
  const client = ({
    transport: { request: () => Promise.resolve({}) },
  } as unknown) as AlertingOSClient;
  const task = createSloRedeployTask({
    store,
    ruler,
    refStore: (refStore as unknown) as SloRuleRefStore,
    datasourceService,
    buildClient: () => client,
    logger,
  });
  return { store, ruler, refStore, datasourceService, task, ds };
}

describe('SloRedeployTask (W3.10)', () => {
  it('redeploys a needsRedeploy=true SO: upserts shared recording + alert, deletes old monolithic group, clears flag', async () => {
    const { store, ruler, refStore, task, ds } = await makeHarness();
    const workspaceId = ds.id;
    const spec = validSpec({ datasourceId: ds.id });
    const doc = migratedDoc('slo-a', spec, workspaceId);
    await store.save(doc);

    const result = await task.redeployOnce();
    expect(result.candidates).toBe(1);
    expect(result.redeployed).toBe(1);
    expect(result.errors).toEqual([]);

    const fp = computeSliFingerprint(spec.datasourceId, spec.sli, spec.objectives[0])!;
    const recGroupName = dedupRecordingGroupName(fp);
    const alertGroupName = dedupAlertGroupName(spec.name, workspaceId, 'slo-a');
    const namespace = `slo-generated-${workspaceId}`;
    expect(ruler.hasGroup(namespace, recGroupName)).toBe(true);
    expect(ruler.hasGroup(namespace, alertGroupName)).toBe(true);

    // Old monolithic group was deleted.
    const slug = slugifySloObjective(spec.name, 'group');
    const suffix = ruleSuffix(workspaceId, 'slo-a', 'group');
    const legacyName = `slo:${slug}_${suffix}`;
    expect(ruler.deletes.some((d) => d.groupName === legacyName)).toBe(true);

    // needsRedeploy cleared on SO.
    const after = await store.get('slo-a');
    expect(
      after?.status.provisioning.backend === 'prometheus' && after.status.provisioning.needsRedeploy
    ).toBe(false);
    expect(refStore.refcount(workspaceId, spec.datasourceId, fp)).toBe(1);
  });

  it('is idempotent: a second call with needsRedeploy already cleared is a no-op', async () => {
    const { store, ruler, task, ds } = await makeHarness();
    const workspaceId = ds.id;
    const spec = validSpec({ datasourceId: ds.id });
    const doc = migratedDoc('slo-a', spec, workspaceId);
    await store.save(doc);

    await task.redeployOnce();
    const upsertsAfterFirst = ruler.upserts.length;

    const second = await task.redeployOnce();
    expect(second.candidates).toBe(0);
    expect(second.redeployed).toBe(0);
    expect(ruler.upserts.length).toBe(upsertsAfterFirst);
  });

  it('partial-failure: a doc with an unregistered datasource surfaces as an error, others redeploy', async () => {
    const { store, task, ds } = await makeHarness();
    const spec1 = validSpec({ datasourceId: ds.id, name: 'A' });
    const doc1 = migratedDoc('slo-ok', spec1, ds.id);
    const spec2 = validSpec({ datasourceId: 'missing-ds', name: 'B' });
    const doc2 = migratedDoc('slo-bad', spec2, 'missing-ds');
    await store.save(doc1);
    await store.save(doc2);

    const result = await task.redeployOnce();
    expect(result.candidates).toBe(2);
    expect(result.redeployed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].sloId).toBe('slo-bad');
  });

  it('two SOs sharing a fingerprint: shared recording group only written once', async () => {
    const { store, ruler, refStore, task, ds } = await makeHarness();
    const workspaceId = ds.id;
    const specA = validSpec({ datasourceId: ds.id, name: 'A' });
    const specB = validSpec({ datasourceId: ds.id, name: 'B' });
    await store.save(migratedDoc('slo-a', specA, workspaceId));
    await store.save(migratedDoc('slo-b', specB, workspaceId));

    await task.redeployOnce();
    const fp = computeSliFingerprint(specA.datasourceId, specA.sli, specA.objectives[0])!;
    const recGroupName = dedupRecordingGroupName(fp);
    const recUpserts = ruler.upserts.filter((u) => u.group.groupName === recGroupName);
    expect(recUpserts).toHaveLength(1);
    expect(refStore.refcount(workspaceId, specA.datasourceId, fp)).toBe(2);
  });
});

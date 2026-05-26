/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AMP-compat integration check (per-datasource namespace isolation).
 *
 * Under A.4 the SLO ruler namespace is keyed on the datasource id
 * (`deploy.workspaceId` carries the canonical datasource id in production —
 * see `server/routes/slo/index.ts`'s `buildDeployContext`). Two SLOs
 * targeting the same datasource share a ruler namespace; SLOs targeting
 * different datasources must NEVER mix groups. This is the
 * non-negotiable AMP invariant — Amazon Managed Prometheus modifies rules
 * at the namespace level, so two datasources sharing a namespace would let
 * one datasource's write overwrite another's.
 *
 * We exercise the service with two namespace keys (`ds-alpha` /
 * `ds-beta`), each carrying its own OSD workspace id, writing three SLOs
 * (two on ds-alpha, one on ds-beta). When the two ds-alpha SLOs share an
 * SLI fingerprint, they dedup into a single shared recording group in
 * ds-alpha's namespace, while ds-beta's identical-fingerprint SLO gets its
 * own recording group in ds-beta's namespace. Alert groups remain
 * per-SLO and carry the OSD workspace id in their name.
 */

/* eslint-disable max-classes-per-file */
import { SloDeployContext, SloRuleRefStoreLite, SloRulerClient, SloService } from '../slo_service';
import { InMemorySloStore } from '../slo_store';
import {
  DEFAULT_MWMBR_TIERS,
  dedupAlertGroupName,
  dedupRecordingGroupName,
} from '../slo_promql_generator';
import { computeSliFingerprint } from '../slo_sli_fingerprint';
import type { AlertingOSClient, Datasource, Logger } from '../../types/alerting';
import type { GeneratedRuleGroup, SloSpec } from '../slo_types';

// ---------------------------------------------------------------- test harness

function noopLogger(): Logger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  };
}

class FakeRuler implements SloRulerClient {
  public upserts: Array<{ namespace: string; group: GeneratedRuleGroup }> = [];
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
    this.groups.delete(`${namespace}|${groupName}`);
  }
  hasGroup(namespace: string, groupName: string): boolean {
    return this.groups.has(`${namespace}|${groupName}`);
  }
  namespacesFor(groupName: string): string[] {
    return this.upserts.filter((u) => u.group.groupName === groupName).map((u) => u.namespace);
  }
}

class FakeRefStore implements SloRuleRefStoreLite {
  private byId = new Map<string, { refcount: number }>();
  private key(ws: string, ds: string, fp: string): string {
    return `${ws}|${ds}|${fp}`;
  }
  async get(
    ws: string,
    ds: string,
    fp: string
  ): Promise<{ attributes: { refcount: number } } | null> {
    const entry = this.byId.get(this.key(ws, ds, fp));
    return entry ? { attributes: { refcount: entry.refcount } } : null;
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
    const entry = this.byId.get(k);
    if (!entry) {
      this.byId.set(k, { refcount: 1 });
      return { wasZero: true };
    }
    entry.refcount += 1;
    return { wasZero: false };
  }
  async decrementRef(input: {
    workspaceId: string;
    datasourceId: string;
    fingerprint: string;
  }): Promise<{ droppedToZero: boolean; underflow: boolean }> {
    const k = this.key(input.workspaceId, input.datasourceId, input.fingerprint);
    const entry = this.byId.get(k);
    if (!entry) return { droppedToZero: false, underflow: true };
    if (entry.refcount <= 0) return { droppedToZero: false, underflow: true };
    entry.refcount -= 1;
    return { droppedToZero: entry.refcount === 0, underflow: false };
  }
  refcount(ws: string, ds: string, fp: string): number {
    return this.byId.get(this.key(ws, ds, fp))?.refcount ?? 0;
  }
}

function buildDeploy(
  ruler: FakeRuler,
  namespaceKey: string,
  osdWorkspaceId: string
): SloDeployContext {
  // Use the namespaceKey as both `id` and `name` so the deploy context
  // pins `spec.datasourceId = ds.name = namespaceKey`. That keeps the test
  // store-key invariant aligned with production where the SO writer pins
  // to the canonical datasource name.
  const datasource: Datasource = {
    id: namespaceKey,
    name: namespaceKey,
    type: 'prometheus',
    url: '',
    enabled: true,
    directQueryName: 'prom-connection',
  };
  const client = ({
    transport: { request: () => Promise.resolve({}) },
  } as unknown) as AlertingOSClient;
  return {
    ruler,
    client,
    datasource,
    workspaceId: namespaceKey,
    OSDWorkspaceId: osdWorkspaceId,
  };
}

function validSpec(name: string, datasourceId: string): SloSpec {
  return {
    datasourceId,
    name,
    enabled: true,
    mode: 'active',
    service: 'api',
    owner: { teams: ['platform'] },
    sli: {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
        metric: 'http_requests_total',
      },
      dimensions: [{ name: 'service', value: 'api' }],
    },
    objectives: [{ name: 'avail-99-9', target: 0.999 }],
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
  };
}

// ------------------------------------------------------------------- integration

describe('AMP-compat cross-datasource namespace isolation', () => {
  it('two datasources writing the same-fingerprint SLI land in disjoint namespaces, each with its own recording group', async () => {
    const ruler = new FakeRuler();
    const refStore = new FakeRefStore();

    const svc = new SloService(noopLogger(), new InMemorySloStore());
    svc.setDedupEnabled(true);
    svc.setRuleRefStore(refStore);

    const deployAlpha = buildDeploy(ruler, 'ds-alpha', 'ws-alpha');
    const deployBeta = buildDeploy(ruler, 'ds-beta', 'ws-beta');

    // Three SLOs sharing the same SLI fingerprint shape, distributed across
    // two distinct datasources: two on ds-alpha (under ws-alpha), one on
    // ds-beta (under ws-beta). The fingerprint depends on
    // (datasourceId, sli, objective) so ds-alpha's pair shares a fingerprint
    // with each other but NOT with ds-beta's SLO.
    const specA1 = validSpec('API Availability Alpha 1', 'ds-alpha');
    const specA2 = validSpec('API Availability Alpha 2', 'ds-alpha');
    const specB1 = validSpec('API Availability Beta 1', 'ds-beta');

    const docA1 = await svc.create({ spec: specA1 }, 'a', deployAlpha);
    const docA2 = await svc.create({ spec: specA2 }, 'a', deployAlpha);
    const docB1 = await svc.create({ spec: specB1 }, 'a', deployBeta);

    const fpA = computeSliFingerprint('ds-alpha', specA1.sli, specA1.objectives[0]);
    const fpB = computeSliFingerprint('ds-beta', specB1.sli, specB1.objectives[0]);
    expect(fpA).not.toBeNull();
    expect(fpB).not.toBeNull();
    const recNameA = dedupRecordingGroupName(fpA!);
    const recNameB = dedupRecordingGroupName(fpB!);

    // Refcount is workspace-partitioned (per A.4) and datasource-keyed.
    // ws-alpha's two SLOs increment ds-alpha's slot to 2; ws-beta's single
    // SLO increments ds-beta's slot to 1. Cross-cells stay at 0.
    expect(refStore.refcount('ws-alpha', 'ds-alpha', fpA!)).toBe(2);
    expect(refStore.refcount('ws-beta', 'ds-beta', fpB!)).toBe(1);
    expect(refStore.refcount('ws-alpha', 'ds-beta', fpA!)).toBe(0);
    expect(refStore.refcount('ws-beta', 'ds-alpha', fpB!)).toBe(0);

    // AMP invariant: each datasource's recording group lives in its own
    // namespace, never crossing.
    expect(ruler.hasGroup('slo-generated-ds-alpha', recNameA)).toBe(true);
    expect(ruler.hasGroup('slo-generated-ds-beta', recNameB)).toBe(true);
    expect(ruler.hasGroup('slo-generated-ds-alpha', 'bogus')).toBe(false);

    // Each SLO's alert group carries the OSD workspace id in its name
    // (under A.4 the alert-group name is keyed on `OSDWorkspaceId`, not the
    // namespace key) and lands in its datasource's namespace.
    const alertA1 = dedupAlertGroupName(specA1.name, 'ws-alpha', docA1.id);
    const alertA2 = dedupAlertGroupName(specA2.name, 'ws-alpha', docA2.id);
    const alertB1 = dedupAlertGroupName(specB1.name, 'ws-beta', docB1.id);
    expect(ruler.hasGroup('slo-generated-ds-alpha', alertA1)).toBe(true);
    expect(ruler.hasGroup('slo-generated-ds-alpha', alertA2)).toBe(true);
    expect(ruler.hasGroup('slo-generated-ds-beta', alertB1)).toBe(true);
    // Crossed pairs must NOT exist (alerts never leak across datasources):
    expect(ruler.hasGroup('slo-generated-ds-beta', alertA1)).toBe(false);
    expect(ruler.hasGroup('slo-generated-ds-alpha', alertB1)).toBe(false);

    // Every ruler upsert that ever ran targeted its own namespace. Scanning
    // the full upsert history is the strongest audit — any future change to
    // the service layer that regresses the AMP invariant trips this.
    for (const { namespace, group } of ruler.upserts) {
      const expected =
        group.groupName === alertA1 || group.groupName === alertA2 || group.groupName === recNameA
          ? 'slo-generated-ds-alpha'
          : group.groupName === alertB1 || group.groupName === recNameB
          ? 'slo-generated-ds-beta'
          : namespace;
      if (expected !== namespace) {
        throw new Error(`group ${group.groupName} landed in ${namespace}, expected ${expected}`);
      }
      expect(namespace.startsWith('slo-generated-')).toBe(true);
    }
  });
});

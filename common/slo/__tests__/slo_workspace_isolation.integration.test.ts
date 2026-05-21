/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AMP-compat integration check.
 *
 * Rule groups for SLOs in workspace W must live in the namespace
 * `slo-generated-<W>`, never mixed with other workspaces'. This is the
 * single non-negotiable invariant of the SLO/SLI feature — Amazon Managed
 * Prometheus can only modify rules at the namespace level, so two
 * workspaces sharing a namespace would let one workspace's write overwrite
 * another's.
 *
 * We exercise the service with two workspaces writing three SLOs (two in
 * ws-alpha, one in ws-beta). When the two ws-alpha SLOs share an SLI
 * fingerprint, they must dedup into a single shared recording group in
 * ws-alpha's namespace, while ws-beta's identical-fingerprint SLO gets its
 * own recording group in ws-beta's namespace. Alert groups remain per-SLO
 * in each workspace.
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
    _fpv: string,
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
    fingerprintVersion: string;
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

function buildDeploy(ruler: FakeRuler, workspaceId: string): SloDeployContext {
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
  return { ruler, client, datasource, workspaceId };
}

function validSpec(name: string): SloSpec {
  return {
    datasourceId: 'prom-ds-001',
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

describe('AMP-compat cross-workspace namespace isolation', () => {
  it('two workspaces writing the same-fingerprint SLI land in disjoint namespaces, each with its own recording group', async () => {
    const ruler = new FakeRuler();
    const refStore = new FakeRefStore();

    const svc = new SloService(noopLogger(), new InMemorySloStore());
    svc.setDedupEnabled(true);
    svc.setRuleRefStore(refStore);

    const deployAlpha = buildDeploy(ruler, 'ws-alpha');
    const deployBeta = buildDeploy(ruler, 'ws-beta');

    // Three SLOs sharing a single SLI fingerprint: two in ws-alpha, one in ws-beta.
    const specA1 = validSpec('API Availability Alpha 1');
    const specA2 = validSpec('API Availability Alpha 2');
    const specB1 = validSpec('API Availability Beta 1');

    const docA1 = await svc.create({ spec: specA1 }, 'a', deployAlpha);
    const docA2 = await svc.create({ spec: specA2 }, 'a', deployAlpha);
    const docB1 = await svc.create({ spec: specB1 }, 'a', deployBeta);

    const fp = computeSliFingerprint(specA1.datasourceId, specA1.sli, specA1.objectives[0]);
    expect(fp).not.toBeNull();
    const recName = dedupRecordingGroupName(fp!);

    // Refcount is workspace-scoped: ws-alpha claims the fp twice, ws-beta once.
    expect(refStore.refcount('ws-alpha', specA1.datasourceId, fp!)).toBe(2);
    expect(refStore.refcount('ws-beta', specB1.datasourceId, fp!)).toBe(1);

    // Each workspace writes the shared recording group exactly once — into
    // its own namespace. The recording-group names are identical (fingerprint
    // is global), but the namespace separator keeps them disjoint on the
    // ruler and therefore in AMP's rule-group surface.
    const namespacesUsed = ruler.namespacesFor(recName);
    expect(namespacesUsed.sort()).toEqual(['slo-generated-ws-alpha', 'slo-generated-ws-beta']);

    // AMP invariant: ws-alpha's recording group lives in slo-generated-ws-alpha,
    // ws-beta's in slo-generated-ws-beta — and neither touches the other.
    expect(ruler.hasGroup('slo-generated-ws-alpha', recName)).toBe(true);
    expect(ruler.hasGroup('slo-generated-ws-beta', recName)).toBe(true);
    expect(ruler.hasGroup('slo-generated-ws-alpha', 'bogus')).toBe(false);

    // Each SLO's alert group carries workspace-scoped naming, lands in its
    // own workspace namespace.
    const alertA1 = dedupAlertGroupName(specA1.name, 'ws-alpha', docA1.id);
    const alertA2 = dedupAlertGroupName(specA2.name, 'ws-alpha', docA2.id);
    const alertB1 = dedupAlertGroupName(specB1.name, 'ws-beta', docB1.id);
    expect(ruler.hasGroup('slo-generated-ws-alpha', alertA1)).toBe(true);
    expect(ruler.hasGroup('slo-generated-ws-alpha', alertA2)).toBe(true);
    expect(ruler.hasGroup('slo-generated-ws-beta', alertB1)).toBe(true);
    // Crossed pairs must NOT exist (alerts never leak across workspaces):
    expect(ruler.hasGroup('slo-generated-ws-beta', alertA1)).toBe(false);
    expect(ruler.hasGroup('slo-generated-ws-alpha', alertB1)).toBe(false);

    // Every ruler upsert that ever ran for a workspace targeted its own
    // namespace. Scanning the full upsert history is the strongest audit —
    // if any future change to the service layer regresses the AMP invariant,
    // this assertion flags it.
    for (const { namespace, group } of ruler.upserts) {
      const expected =
        group.groupName === alertA1 || group.groupName === alertA2
          ? 'slo-generated-ws-alpha'
          : group.groupName === alertB1
          ? 'slo-generated-ws-beta'
          : namespace; // recording group — allowed in either
      if (expected !== namespace) {
        throw new Error(`group ${group.groupName} landed in ${namespace}, expected ${expected}`);
      }
      expect(namespace.startsWith('slo-generated-')).toBe(true);
    }
  });
});

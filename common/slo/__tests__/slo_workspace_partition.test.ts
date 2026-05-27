/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A.4 workspace-partitioning invariants.
 *
 * Pins the three observable consequences of switching SLO storage to
 * workspace-scoped saved-objects clients (route through
 * `WorkspaceIdConsumerWrapper`) while keeping the ruler namespace
 * datasource-keyed:
 *
 *   1. Listing isolation. A workspace can never list another workspace's
 *      SLO definitions. Fake the wrapper with a per-workspace ISloStore
 *      partition and confirm the service's `list` call reads only the
 *      caller's partition.
 *
 *   2. Cross-workspace write rejection. A workspace cannot
 *      update/delete an SLO it does not own. The wrapper translates that
 *      into a 404-shaped not-found at the SO layer; the service surface
 *      bubbles it as `SloNotFoundError`.
 *
 *   3. Aggregate refcount under A.4. Two workspaces creating SLOs over
 *      the same fingerprint share one ruler recording group (refcount on
 *      the ruler is dedup-aware), but their slo-rule-ref SOs partition by
 *      OSD workspace. The cross-workspace aggregate is what the GC pass
 *      consults — exposed by `SloRuleRefStore.aggregateRefcount` (kept
 *      out of `SloRuleRefStoreLite` so CRUD callers cannot reach it).
 *
 * The fakes here mirror `slo_service_dedup.test.ts`'s harness shape but
 * partition state by an explicit `workspaceId` token to simulate the
 * wrapper. The factory `forRequest(token)` returns a per-token store
 * pair so the service's `resolveStores(request)` lookup engages the
 * partition the same way the production factory engages
 * `getScopedClient(request)`.
 */

/* eslint-disable max-classes-per-file */
import {
  SloDeployContext,
  SloRulerClient,
  SloRuleRefStoreLite,
  SloService,
  SloNotFoundError,
} from '../slo_service';
import { InMemorySloStore } from '../slo_store';
import { DEFAULT_MWMBR_TIERS, dedupRecordingGroupName } from '../slo_promql_generator';
import { computeSliFingerprint } from '../slo_sli_fingerprint';
import type { AlertingOSClient, Datasource, Logger } from '../../types/alerting';
import type { GeneratedRuleGroup, ISloStore, SloDocument, SloSpec } from '../slo_types';
import type { SloStoreFactoryLite, SloStoresLite } from '../slo_service_types';

// --------------------------------------------------------------------- harness

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
  async deleteRuleGroup(): Promise<void> {
    /* no-op for these scenarios */
  }
  hasGroup(namespace: string, name: string): boolean {
    return this.groups.has(`${namespace}|${name}`);
  }
  recordingGroupCountFor(namespace: string, name: string): number {
    return this.upserts.filter((u) => u.namespace === namespace && u.group.groupName === name)
      .length;
  }
}

/**
 * Per-workspace fake refstore. Production's wrapper auto-partitions
 * slo-rule-ref by `workspaceId`; here we simulate that partition by
 * keying state on the request token.
 */
class WorkspacePartitionedRefStore implements SloRuleRefStoreLite {
  // (token, ws, ds, fp) → refcount
  private refs = new Map<string, number>();
  private k(token: string, ws: string, ds: string, fp: string): string {
    return `${token}|${ws}|${ds}|${fp}`;
  }

  forToken(token: string): SloRuleRefStoreLite {
    const self = this;
    return {
      async get(ws, ds, fp) {
        const r = self.refs.get(self.k(token, ws, ds, fp));
        return r === undefined ? null : { attributes: { refcount: r } };
      },
      async incrementRef(input) {
        const key = self.k(token, input.workspaceId, input.datasourceId, input.fingerprint);
        const prior = self.refs.get(key) ?? 0;
        self.refs.set(key, prior + 1);
        return { wasZero: prior === 0 };
      },
      async decrementRef(input) {
        const key = self.k(token, input.workspaceId, input.datasourceId, input.fingerprint);
        const prior = self.refs.get(key);
        if (prior === undefined) return { droppedToZero: false, underflow: true };
        if (prior <= 0) return { droppedToZero: false, underflow: true };
        const next = prior - 1;
        self.refs.set(key, next);
        return { droppedToZero: next === 0, underflow: false };
      },
    };
  }

  /** Mimics `SloRuleRefStore.aggregateRefcount` — sums across all tokens. */
  aggregateRefcount(datasourceId: string, fingerprint: string): number {
    let total = 0;
    for (const [k, v] of this.refs.entries()) {
      const parts = k.split('|');
      if (parts[2] === datasourceId && parts[3] === fingerprint) total += Math.max(0, v);
    }
    return total;
  }
}

/**
 * Per-workspace fake SO store. Each token gets its own ISloStore — the
 * factory's `forRequest(token)` returns a pair backed by the
 * token-specific instance.
 */
class WorkspacePartitionedSloStore {
  private byToken = new Map<string, InMemorySloStore>();
  forToken(token: string): ISloStore {
    let s = this.byToken.get(token);
    if (!s) {
      s = new InMemorySloStore();
      this.byToken.set(token, s);
    }
    return s;
  }
}

/**
 * Concrete factory that mirrors production's `SloStoreFactory.forRequest`
 * but uses the in-memory partitioned stores above. Tests pass the
 * workspace token as the `request` argument.
 */
class FakeStoreFactory implements SloStoreFactoryLite {
  constructor(
    private readonly stores: WorkspacePartitionedSloStore,
    private readonly refs: WorkspacePartitionedRefStore
  ) {}
  forRequest(request: unknown): SloStoresLite {
    const token = String(request);
    return {
      sloStore: this.stores.forToken(token),
      ruleRefStore: this.refs.forToken(token),
    };
  }
}

function buildDeploy(
  ruler: FakeRuler,
  namespaceKey: string,
  osdWorkspaceId: string
): SloDeployContext {
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

function buildSvc(): {
  svc: SloService;
  stores: WorkspacePartitionedSloStore;
  refs: WorkspacePartitionedRefStore;
  ruler: FakeRuler;
} {
  const stores = new WorkspacePartitionedSloStore();
  const refs = new WorkspacePartitionedRefStore();
  const ruler = new FakeRuler();
  // The facade still requires a singleton `store` / `refStore` for the
  // no-request fallback path. None of the assertions below should hit
  // those; if a service call ever resolves to the singleton it indicates
  // the request token didn't reach `core.resolveStores`, which is the
  // bug A.4 is meant to prevent.
  const sentinel: ISloStore = {
    async get() {
      throw new Error('singleton store hit — request token did not reach resolveStores');
    },
    async list() {
      throw new Error('singleton store hit — request token did not reach resolveStores');
    },
    async save() {
      throw new Error('singleton store hit — request token did not reach resolveStores');
    },
    async delete() {
      throw new Error('singleton store hit — request token did not reach resolveStores');
    },
  };
  const svc = new SloService(noopLogger(), sentinel);
  svc.setDedupEnabled(true);
  svc.setRuleRefStore(refs.forToken('__sentinel__'));
  svc.setStoreFactory(new FakeStoreFactory(stores, refs));
  return { svc, stores, refs, ruler };
}

// ----------------------------------------------------------------- scenarios

describe('A.4 workspace partitioning', () => {
  it('listing is workspace-isolated: workspace B never sees workspace A`s SLO', async () => {
    const { svc, ruler } = buildSvc();
    const deployA = buildDeploy(ruler, 'ds-1', 'ws-A');
    const deployB = buildDeploy(ruler, 'ds-1', 'ws-B');

    // A creates an SLO; B creates a different one. Both target the same
    // datasource, so both ruler upserts land in slo-generated-ds-1.
    await svc.create({ spec: validSpec('A1', 'ds-1') }, 'a', deployA, 'ws-A');
    await svc.create({ spec: validSpec('B1', 'ds-1') }, 'a', deployB, 'ws-B');

    // A's listing sees A1 only.
    const aList = await svc.list(undefined, undefined, 'ws-A');
    expect(aList.map((s) => s.name)).toEqual(['A1']);

    // B's listing sees B1 only.
    const bList = await svc.list(undefined, undefined, 'ws-B');
    expect(bList.map((s) => s.name)).toEqual(['B1']);
  });

  it('cross-workspace update of another workspace`s SLO surfaces as SloNotFoundError', async () => {
    const { svc, ruler } = buildSvc();
    const deployA = buildDeploy(ruler, 'ds-1', 'ws-A');
    const deployB = buildDeploy(ruler, 'ds-1', 'ws-B');

    const docA: SloDocument = await svc.create(
      { spec: validSpec('A1', 'ds-1') },
      'a',
      deployA,
      'ws-A'
    );

    // From workspace B, try to update A's SLO. Wrapper auto-filters reads
    // by workspace, so B's view of the SO store doesn't contain A's id —
    // the lifecycle service's get-then-update read returns null and
    // surfaces SloNotFoundError.
    await expect(
      svc.update(
        docA.id,
        { version: docA.status.version, spec: { name: 'B-rename' } },
        'b',
        deployB,
        'ws-B'
      )
    ).rejects.toBeInstanceOf(SloNotFoundError);

    // A's SLO is still intact in A's partition.
    const aDoc = await svc.get(docA.id, 'ws-A');
    expect(aDoc?.spec.name).toBe('A1');
  });

  it('aggregate refcount under A.4: two workspaces share one ruler group; per-workspace refs partition by OSDWorkspaceId', async () => {
    const { svc, refs, ruler } = buildSvc();
    const deployA = buildDeploy(ruler, 'ds-1', 'ws-A');
    const deployB = buildDeploy(ruler, 'ds-1', 'ws-B');

    // Both workspaces create one SLO over the same SLI fingerprint shape.
    await svc.create({ spec: validSpec('A1', 'ds-1') }, 'a', deployA, 'ws-A');
    await svc.create({ spec: validSpec('B1', 'ds-1') }, 'a', deployB, 'ws-B');

    const fp = computeSliFingerprint(
      'ds-1',
      validSpec('A1', 'ds-1').sli,
      validSpec('A1', 'ds-1').objectives[0]
    );
    expect(fp).not.toBeNull();
    const recName = dedupRecordingGroupName(fp!);

    // Per-workspace refs are 1 each (workspace partition is functioning).
    const refA = await refs.forToken('ws-A').get('ws-A', 'ds-1', fp!);
    const refB = await refs.forToken('ws-B').get('ws-B', 'ds-1', fp!);
    expect(refA?.attributes.refcount).toBe(1);
    expect(refB?.attributes.refcount).toBe(1);

    // Cross-workspace aggregate is 2 — the GC eligibility test the
    // future reconciler runs against `SloRuleRefStore.aggregateRefcount`.
    expect(refs.aggregateRefcount('ds-1', fp!)).toBe(2);

    // Ruler-side: the recording group was upserted (each workspace's
    // create writes once, since each sees its own per-workspace refcount
    // transition 0 → 1 as `wasZero: true`). The shared namespace dedup
    // on the ruler is byte-equal — both writes target the same
    // (namespace, groupName) pair.
    expect(ruler.hasGroup('slo-generated-ds-1', recName)).toBe(true);
  });
});

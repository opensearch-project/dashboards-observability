/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Reconciler unit tests.
 *
 * Pin the grace-GC contract documented at the head of
 * `slo_rule_ref_store.ts`:
 *
 *   1. Eligible tuple → ruler delete + slo-rule-ref SO delete.
 *   2. Aggregate refcount > 0 → no-op.
 *   3. zeroSinceAt within grace window → no-op.
 *   4. Ruler 404 → SO still deleted (4xx absent already counts as gone).
 *   5. Other ruler failure → SOs retained, retry next sweep.
 *   6. Cross-workspace aggregation: refs across multiple workspaces all
 *      need to be zero past grace before delete fires.
 *   7. Missing `directQueryName` → skip + warn (legacy SO without the
 *      reconciler-feature field).
 */

/* eslint-disable max-classes-per-file */
import type { Logger } from '../../../../../../src/core/server';
import type { Datasource, AlertingOSClient } from '../../../../common/types/alerting';
import {
  SLO_RULE_REF_SO_TYPE,
  SloRuleRefAttributes,
  sloRuleRefId,
} from '../../../saved_objects/slo_rule_ref';
import type { RulerClient } from '../ruler_client';
import { SloReconciler } from '../slo_reconciler';

// --------------------------------------------------------------------- helpers

function noopLogger(): Logger {
  return ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
    log: jest.fn(),
    trace: jest.fn(),
    get: jest.fn(),
  } as unknown) as Logger;
}

interface Stored {
  id: string;
  type: string;
  attributes: SloRuleRefAttributes;
  references: unknown[];
  version: string;
}

class FakeRepo {
  public byId = new Map<string, Stored>();

  put(attrs: SloRuleRefAttributes) {
    const id = sloRuleRefId(attrs.workspaceId, attrs.datasourceId, attrs.fingerprint);
    this.byId.set(id, {
      id,
      type: SLO_RULE_REF_SO_TYPE,
      attributes: { ...attrs },
      references: [],
      version: `v${this.byId.size + 1}`,
    });
  }

  asClient() {
    const self = this;
    return {
      async get(type: string, id: string) {
        const hit = self.byId.get(id);
        if (!hit) {
          const err = new Error(`not found ${type}/${id}`) as Error & {
            output: { statusCode: number };
          };
          err.output = { statusCode: 404 };
          throw err;
        }
        return { ...hit, attributes: { ...hit.attributes } };
      },
      async find(opts: { type: string; filter?: string; perPage?: number; page?: number }) {
        const all = [...self.byId.values()].filter((s) => s.type === opts.type);
        // Crude filter parser: handle the two filter shapes the store uses.
        // (ws AND ds), (refcount: 0), (ds AND fp).
        let matched = all;
        if (opts.filter) {
          const filter = opts.filter;
          matched = all.filter((s) => {
            const a = s.attributes;
            const checks: Array<[string, string]> = [];
            const re = /attributes\.(\w+):\s*"?([^")\s]+)"?/g;
            let m: RegExpExecArray | null;
            while ((m = re.exec(filter)) !== null) checks.push([m[1], m[2]]);
            for (const [k, v] of checks) {
              const av = ((a as unknown) as Record<string, string | number | undefined>)[k];
              if (String(av) !== v) return false;
            }
            return true;
          });
        }
        return {
          page: opts.page ?? 1,
          per_page: opts.perPage ?? 1000,
          total: matched.length,
          saved_objects: matched.map((s) => ({ ...s, attributes: { ...s.attributes } })),
        };
      },
      async delete(_type: string, id: string) {
        if (!self.byId.has(id)) {
          const err = new Error(`not found ${id}`) as Error & {
            output: { statusCode: number };
          };
          err.output = { statusCode: 404 };
          throw err;
        }
        self.byId.delete(id);
        return {};
      },
    };
  }
}

class FakeRuler implements RulerClient {
  public deletes: Array<{ namespace: string; groupName: string; directQueryName?: string }> = [];
  public deleteImpl: (namespace: string, groupName: string) => Promise<void> = async () =>
    undefined;
  async upsertRuleGroup(): Promise<void> {
    /* unused in reconciler */
  }
  async deleteRuleGroup(
    _client: AlertingOSClient,
    datasource: Datasource,
    namespace: string,
    groupName: string
  ): Promise<void> {
    this.deletes.push({ namespace, groupName, directQueryName: datasource.directQueryName });
    await this.deleteImpl(namespace, groupName);
  }
  async getRuleGroup() {
    return null;
  }
  async listRuleGroups() {
    return [];
  }
}

function buildReconciler(
  repo: FakeRepo,
  ruler: FakeRuler,
  opts: { graceMs?: number; intervalMs?: number; now?: () => Date } = {}
): SloReconciler {
  const savedObjects = ({
    createInternalRepository: () => repo.asClient(),
  } as unknown) as import('../../../../../../src/core/server').SavedObjectsServiceStart;
  const opensearch = ({
    client: {
      asInternalUser: { transport: { request: async () => ({ statusCode: 200, body: {} }) } },
    },
  } as unknown) as import('../../../../../../src/core/server').OpenSearchServiceStart;
  return new SloReconciler(noopLogger(), savedObjects, opensearch, ruler, {
    intervalMs: opts.intervalMs ?? 60_000,
    graceMs: opts.graceMs ?? 24 * 3600 * 1000,
    now: opts.now,
  });
}

function ref(
  workspaceId: string,
  datasourceId: string,
  fingerprint: string,
  refcount: number,
  zeroSinceAt: string | undefined,
  extras: Partial<SloRuleRefAttributes> = {}
): SloRuleRefAttributes {
  return {
    workspaceId,
    datasourceId,
    fingerprint,
    fingerprintVersion: 'v1',
    refcount,
    groupName: `slo:rec:${fingerprint}`,
    namespace: `slo-generated-${datasourceId}`,
    directQueryName: 'prom-conn',
    zeroSinceAt,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: zeroSinceAt ?? '2026-05-01T00:00:00.000Z',
    ...extras,
  };
}

// ----------------------------------------------------------------- scenarios

describe('SloReconciler.sweep', () => {
  it('eligible tuple with one workspace → ruler delete + SO delete', async () => {
    const repo = new FakeRepo();
    const ruler = new FakeRuler();
    repo.put(ref('ws-A', 'ds-1', 'fp-A', 0, '2026-05-21T00:00:00.000Z'));
    const recon = buildReconciler(repo, ruler, {
      graceMs: 24 * 3600 * 1000,
      now: () => new Date('2026-05-22T01:00:00.000Z'),
    });
    const result = await recon.sweep();
    expect(result).toEqual({ swept: 1, deleted: 1, skipped: 0 });
    expect(ruler.deletes).toHaveLength(1);
    expect(ruler.deletes[0]).toMatchObject({
      namespace: 'slo-generated-ds-1',
      groupName: 'slo:rec:fp-A',
      directQueryName: 'prom-conn',
    });
    expect(repo.byId.size).toBe(0);
  });

  it('aggregate refcount > 0 → no-op (some workspace still claims the fingerprint)', async () => {
    const repo = new FakeRepo();
    const ruler = new FakeRuler();
    // ws-A: refcount=0 past grace; ws-B: refcount=1 (still active).
    repo.put(ref('ws-A', 'ds-1', 'fp-A', 0, '2026-05-21T00:00:00.000Z'));
    repo.put(ref('ws-B', 'ds-1', 'fp-A', 1, undefined));
    const recon = buildReconciler(repo, ruler, {
      now: () => new Date('2026-05-22T01:00:00.000Z'),
    });
    const result = await recon.sweep();
    expect(result.deleted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(ruler.deletes).toHaveLength(0);
    // Both refs preserved.
    expect(repo.byId.size).toBe(2);
  });

  it('zeroSinceAt within grace window → not picked up by listStaleZero', async () => {
    const repo = new FakeRepo();
    const ruler = new FakeRuler();
    // zeroSinceAt is only 1h ago; graceMs = 24h.
    repo.put(ref('ws-A', 'ds-1', 'fp-A', 0, '2026-05-22T00:00:00.000Z'));
    const recon = buildReconciler(repo, ruler, {
      graceMs: 24 * 3600 * 1000,
      now: () => new Date('2026-05-22T01:00:00.000Z'),
    });
    const result = await recon.sweep();
    expect(result).toEqual({ swept: 0, deleted: 0, skipped: 0 });
    expect(ruler.deletes).toHaveLength(0);
    expect(repo.byId.size).toBe(1);
  });

  it('ruler 404 is tolerated → SO still deleted', async () => {
    const repo = new FakeRepo();
    const ruler = new FakeRuler();
    // Real ruler client treats 404 as success and resolves; mirror that.
    ruler.deleteImpl = async () => undefined;
    repo.put(ref('ws-A', 'ds-1', 'fp-A', 0, '2026-05-21T00:00:00.000Z'));
    const recon = buildReconciler(repo, ruler, {
      now: () => new Date('2026-05-22T01:00:00.000Z'),
    });
    const result = await recon.sweep();
    expect(result.deleted).toBe(1);
    expect(repo.byId.size).toBe(0);
  });

  it('ruler other-error → SOs retained, retry next sweep', async () => {
    const repo = new FakeRepo();
    const ruler = new FakeRuler();
    ruler.deleteImpl = async () => {
      throw new Error('Cortex 503: backend unavailable');
    };
    repo.put(ref('ws-A', 'ds-1', 'fp-A', 0, '2026-05-21T00:00:00.000Z'));
    const recon = buildReconciler(repo, ruler, {
      now: () => new Date('2026-05-22T01:00:00.000Z'),
    });
    const result = await recon.sweep();
    expect(result.deleted).toBe(0);
    expect(result.skipped).toBe(1);
    // SO is still there for the next sweep to retry.
    expect(repo.byId.size).toBe(1);
  });

  it('cross-workspace aggregation: every workspace must be at refcount=0 past grace', async () => {
    const repo = new FakeRepo();
    const ruler = new FakeRuler();
    repo.put(ref('ws-A', 'ds-1', 'fp-A', 0, '2026-05-21T00:00:00.000Z'));
    repo.put(ref('ws-B', 'ds-1', 'fp-A', 0, '2026-05-21T00:00:00.000Z'));
    const recon = buildReconciler(repo, ruler, {
      now: () => new Date('2026-05-22T01:00:00.000Z'),
    });
    const result = await recon.sweep();
    // Both workspace's refs participated in one ruler delete.
    expect(result).toEqual({ swept: 1, deleted: 1, skipped: 0 });
    expect(ruler.deletes).toHaveLength(1);
    // Both refs deleted — no orphans.
    expect(repo.byId.size).toBe(0);
  });

  it('missing directQueryName → skip + log warn (legacy SO predates reconciler feature)', async () => {
    const repo = new FakeRepo();
    const ruler = new FakeRuler();
    repo.put(
      ref('ws-A', 'ds-1', 'fp-A', 0, '2026-05-21T00:00:00.000Z', { directQueryName: undefined })
    );
    const recon = buildReconciler(repo, ruler, {
      now: () => new Date('2026-05-22T01:00:00.000Z'),
    });
    const result = await recon.sweep();
    expect(result.deleted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(ruler.deletes).toHaveLength(0);
    // SO retained — operator backfill or natural re-write resolves it.
    expect(repo.byId.size).toBe(1);
  });

  it('multiple distinct (ds, fp) tuples each handled independently', async () => {
    const repo = new FakeRepo();
    const ruler = new FakeRuler();
    repo.put(ref('ws-A', 'ds-1', 'fp-A', 0, '2026-05-21T00:00:00.000Z'));
    repo.put(ref('ws-A', 'ds-2', 'fp-B', 0, '2026-05-21T00:00:00.000Z'));
    const recon = buildReconciler(repo, ruler, {
      now: () => new Date('2026-05-22T01:00:00.000Z'),
    });
    const result = await recon.sweep();
    expect(result).toEqual({ swept: 2, deleted: 2, skipped: 0 });
    expect(ruler.deletes.map((d) => d.namespace).sort()).toEqual([
      'slo-generated-ds-1',
      'slo-generated-ds-2',
    ]);
    expect(repo.byId.size).toBe(0);
  });

  it('overlapping sweep invocations: second call returns empty until first finishes', async () => {
    const repo = new FakeRepo();
    const ruler = new FakeRuler();
    let release: (() => void) | null = null;
    ruler.deleteImpl = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    repo.put(ref('ws-A', 'ds-1', 'fp-A', 0, '2026-05-21T00:00:00.000Z'));
    const recon = buildReconciler(repo, ruler, {
      now: () => new Date('2026-05-22T01:00:00.000Z'),
    });
    const first = recon.sweep();
    // Yield a tick so the first sweep enters its async body and reaches
    // the awaited ruler delete (which the test holds open via `release`).
    await new Promise((r) => setImmediate(r));
    // Second invocation while the first is mid-flight returns immediately.
    const second = await recon.sweep();
    expect(second).toEqual({ swept: 0, deleted: 0, skipped: 0 });
    release!();
    const firstResult = await first;
    expect(firstResult.deleted).toBe(1);
  });
});

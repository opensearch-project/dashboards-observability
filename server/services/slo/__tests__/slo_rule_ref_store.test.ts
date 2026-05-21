/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SavedObjectsClientContract, SavedObject } from '../../../../../../src/core/server';
import {
  SLO_RULE_REF_SO_TYPE,
  SloRuleRefAttributes,
  sloRuleRefId,
} from '../../../saved_objects/slo_rule_ref';
import { SloRuleRefConflictError, SloRuleRefStore } from '../slo_rule_ref_store';

// Minimal SO-client-compatible error throwers. Plain Error subclasses carry
// `output.statusCode` so the store's `isNotFound` / `isConflict` heuristics
// classify them the same way they would classify a real SavedObjectsClient
// rejection. Avoids depending on Boom / SavedObjectsErrorHelpers internals.
class StatusError extends Error {
  public output: { statusCode: number };
  public statusCode: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = `StatusError(${status})`;
    this.statusCode = status;
    this.output = { statusCode: status };
  }
}

function notFoundError(type: string, id: string) {
  return new StatusError(404, `Saved object [${type}/${id}] not found`);
}

function conflictError(type: string, id: string) {
  return new StatusError(409, `Saved object [${type}/${id}] conflict`);
}

// ============================================================================
// Mock SavedObjectsClient
// ============================================================================

type Stored = SavedObject<SloRuleRefAttributes>;

interface FakeClientOpts {
  conflictCount?: number;
  throwConflictOnCreate?: number;
}

function makeFakeClient(opts: FakeClientOpts = {}) {
  const byId = new Map<string, Stored>();
  let versionCounter = 0;
  let remainingUpdateConflicts = opts.conflictCount ?? 0;
  let remainingCreateConflicts = opts.throwConflictOnCreate ?? 0;
  let lastFindFilter: string | undefined;

  const client = ({
    async get<T>(type: string, id: string): Promise<SavedObject<T>> {
      const hit = byId.get(id);
      if (!hit) {
        throw notFoundError(type, id);
      }
      return ({ ...hit, attributes: { ...hit.attributes } } as unknown) as SavedObject<T>;
    },
    async create<T>(_type: string, attrs: T, options?: { id?: string }): Promise<SavedObject<T>> {
      const id = options?.id ?? `auto-${++versionCounter}`;
      if (remainingCreateConflicts > 0) {
        remainingCreateConflicts--;
        throw conflictError(SLO_RULE_REF_SO_TYPE, id);
      }
      if (byId.has(id)) {
        throw conflictError(SLO_RULE_REF_SO_TYPE, id);
      }
      const stored: Stored = {
        id,
        type: SLO_RULE_REF_SO_TYPE,
        attributes: (attrs as unknown) as SloRuleRefAttributes,
        references: [],
        version: `v${++versionCounter}`,
      };
      byId.set(id, stored);
      return ({ ...stored, attributes: { ...stored.attributes } } as unknown) as SavedObject<T>;
    },
    async update<T>(
      _type: string,
      id: string,
      attrs: Partial<T>,
      options?: { version?: string }
    ): Promise<SavedObject<T>> {
      const hit = byId.get(id);
      if (!hit) {
        throw notFoundError(SLO_RULE_REF_SO_TYPE, id);
      }
      if (remainingUpdateConflicts > 0) {
        remainingUpdateConflicts--;
        throw conflictError(SLO_RULE_REF_SO_TYPE, id);
      }
      if (options?.version && options.version !== hit.version) {
        throw conflictError(SLO_RULE_REF_SO_TYPE, id);
      }
      const merged: Stored = {
        ...hit,
        attributes: { ...hit.attributes, ...(attrs as Partial<SloRuleRefAttributes>) },
        version: `v${++versionCounter}`,
      };
      byId.set(id, merged);
      return ({ ...merged, attributes: { ...merged.attributes } } as unknown) as SavedObject<T>;
    },
    async delete(_type: string, id: string): Promise<{}> {
      if (!byId.has(id)) {
        throw notFoundError(SLO_RULE_REF_SO_TYPE, id);
      }
      byId.delete(id);
      return {};
    },
    async find<T>(findOpts: {
      type: string;
      filter?: string;
    }): Promise<{
      saved_objects: Array<SavedObject<T>>;
      total: number;
      page: number;
      per_page: number;
    }> {
      lastFindFilter = findOpts.filter;
      const all = (Array.from(byId.values()) as unknown) as Array<SavedObject<T>>;
      return { saved_objects: all, total: all.length, page: 1, per_page: all.length };
    },
  } as unknown) as SavedObjectsClientContract;

  return {
    client,
    byId,
    getLastFindFilter: () => lastFindFilter,
  };
}

function makeStore(opts: FakeClientOpts = {}) {
  const fake = makeFakeClient(opts);
  return {
    store: new SloRuleRefStore(fake.client),
    byId: fake.byId,
    getLastFindFilter: fake.getLastFindFilter,
  };
}

const FIXED_NOW = new Date('2026-04-28T10:00:00.000Z');
const now = () => FIXED_NOW;

const BASE_INPUT = {
  workspaceId: 'ws-1',
  datasourceId: 'prom-ds-001',
  fingerprint: 'deadbeefcafebabe',
  fingerprintVersion: 'v1',
  groupName: 'slo:rec:deadbeefcafebabe',
  namespace: 'slo-generated-ws-1',
  now,
};

const expectedId = sloRuleRefId(
  BASE_INPUT.workspaceId,
  BASE_INPUT.datasourceId,
  BASE_INPUT.fingerprint
);

// ============================================================================
// Tests
// ============================================================================

describe('SloRuleRefStore', () => {
  describe('incrementRef', () => {
    it('creates the ref on first increment with refcount=1 and wasZero=true', async () => {
      const { store, byId } = makeStore();
      const { doc, wasZero } = await store.incrementRef(BASE_INPUT);
      expect(wasZero).toBe(true);
      expect(doc.attributes.refcount).toBe(1);
      expect(doc.attributes.createdAt).toBe(FIXED_NOW.toISOString());
      expect(doc.attributes.updatedAt).toBe(FIXED_NOW.toISOString());
      expect(byId.get(expectedId)?.attributes.refcount).toBe(1);
    });

    it('increments an existing ref (wasZero=false when prior refcount > 0)', async () => {
      const { store } = makeStore();
      await store.incrementRef(BASE_INPUT);
      const { doc, wasZero } = await store.incrementRef(BASE_INPUT);
      expect(wasZero).toBe(false);
      expect(doc.attributes.refcount).toBe(2);
    });

    it('treats resurrection from refcount=0 as wasZero=true and clears zeroSinceAt', async () => {
      const { store } = makeStore();
      await store.incrementRef(BASE_INPUT);
      await store.decrementRef(BASE_INPUT); // refcount → 0, zeroSinceAt set
      const { doc, wasZero } = await store.incrementRef(BASE_INPUT);
      expect(wasZero).toBe(true);
      expect(doc.attributes.refcount).toBe(1);
      expect(doc.attributes.zeroSinceAt).toBeUndefined();
    });

    it('retries version conflicts up to 3 attempts — succeeds on 3rd try', async () => {
      const { store } = makeStore({ conflictCount: 2 });
      await store.incrementRef(BASE_INPUT); // first create succeeds
      const { doc } = await store.incrementRef(BASE_INPUT); // update; 2 conflicts then ok
      expect(doc.attributes.refcount).toBe(2);
    });

    it('throws SloRuleRefConflictError after 3 exhausted retries', async () => {
      const { store } = makeStore({ conflictCount: 3 });
      await store.incrementRef(BASE_INPUT); // create ok
      await expect(store.incrementRef(BASE_INPUT)).rejects.toBeInstanceOf(SloRuleRefConflictError);
    });

    it('carries create-path conflicts through the same retry budget', async () => {
      const { store } = makeStore({ throwConflictOnCreate: 2 });
      // Two conflicts on create, then success.
      const { doc, wasZero } = await store.incrementRef(BASE_INPUT);
      expect(wasZero).toBe(true);
      expect(doc.attributes.refcount).toBe(1);
    });
  });

  describe('decrementRef', () => {
    it('returns underflow=true when no ref exists', async () => {
      const { store } = makeStore();
      const res = await store.decrementRef(BASE_INPUT);
      expect(res.doc).toBeNull();
      expect(res.droppedToZero).toBe(false);
      expect(res.underflow).toBe(true);
    });

    it('drops refcount to zero and sets zeroSinceAt', async () => {
      const { store } = makeStore();
      await store.incrementRef(BASE_INPUT);
      const res = await store.decrementRef(BASE_INPUT);
      expect(res.droppedToZero).toBe(true);
      expect(res.underflow).toBe(false);
      expect(res.doc?.attributes.refcount).toBe(0);
      expect(res.doc?.attributes.zeroSinceAt).toBe(FIXED_NOW.toISOString());
    });

    it('decrements without dropping to zero when multiple refs are held', async () => {
      const { store } = makeStore();
      await store.incrementRef(BASE_INPUT);
      await store.incrementRef(BASE_INPUT); // refcount=2
      const res = await store.decrementRef(BASE_INPUT);
      expect(res.doc?.attributes.refcount).toBe(1);
      expect(res.droppedToZero).toBe(false);
      expect(res.doc?.attributes.zeroSinceAt).toBeUndefined();
    });

    it('reports underflow when refcount is already 0', async () => {
      const { store } = makeStore();
      await store.incrementRef(BASE_INPUT);
      await store.decrementRef(BASE_INPUT); // to zero
      const res = await store.decrementRef(BASE_INPUT);
      expect(res.underflow).toBe(true);
      expect(res.droppedToZero).toBe(false);
      expect(res.doc?.attributes.refcount).toBe(0);
    });
  });

  describe('remove', () => {
    it('returns true when the ref exists and deletes it', async () => {
      const { store, byId } = makeStore();
      await store.incrementRef(BASE_INPUT);
      const ok = await store.remove(
        BASE_INPUT.workspaceId,
        BASE_INPUT.datasourceId,
        BASE_INPUT.fingerprint
      );
      expect(ok).toBe(true);
      expect(byId.has(expectedId)).toBe(false);
    });

    it('returns false when the ref is not present', async () => {
      const { store } = makeStore();
      const ok = await store.remove(
        BASE_INPUT.workspaceId,
        BASE_INPUT.datasourceId,
        BASE_INPUT.fingerprint
      );
      expect(ok).toBe(false);
    });
  });

  describe('listStaleZero', () => {
    it('filters in-memory refs older than graceMs', async () => {
      const { store, byId } = makeStore();
      // Seed two refs at zero with different zeroSinceAt timestamps.
      await store.incrementRef(BASE_INPUT);
      await store.decrementRef(BASE_INPUT);
      // Backdate one ref.
      const old = byId.get(expectedId);
      if (old) {
        old.attributes.zeroSinceAt = new Date(FIXED_NOW.getTime() - 48 * 3600_000).toISOString();
      }
      const stale = await store.listStaleZero({ graceMs: 24 * 3600_000, now });
      expect(stale).toHaveLength(1);
      expect(stale[0].attributes.zeroSinceAt).toBe(old?.attributes.zeroSinceAt);
    });

    it('ignores refs whose zeroSinceAt is within the grace window', async () => {
      const { store } = makeStore();
      await store.incrementRef(BASE_INPUT);
      await store.decrementRef(BASE_INPUT);
      const stale = await store.listStaleZero({ graceMs: 24 * 3600_000, now });
      expect(stale).toHaveLength(0);
    });
  });

  describe('get / listByDatasource', () => {
    it('get returns null when the ref is absent', async () => {
      const { store } = makeStore();
      const res = await store.get('ws-x', 'ds-x', 'abcdef0123456789');
      expect(res).toBeNull();
    });

    it('get returns the stored ref', async () => {
      const { store } = makeStore();
      await store.incrementRef(BASE_INPUT);
      const res = await store.get(
        BASE_INPUT.workspaceId,
        BASE_INPUT.datasourceId,
        BASE_INPUT.fingerprint
      );
      expect(res?.attributes.refcount).toBe(1);
    });

    it('listByDatasource returns all refs the fake stored (find ignores filter)', async () => {
      const { store } = makeStore();
      await store.incrementRef(BASE_INPUT);
      await store.incrementRef({ ...BASE_INPUT, fingerprint: 'cafef00dc0ffee01' });
      const all = await store.listByDatasource(BASE_INPUT.workspaceId, BASE_INPUT.datasourceId);
      expect(all).toHaveLength(2);
    });

    it('listByDatasource builds a quoted KQL filter on workspaceId and datasourceId', async () => {
      const { store, getLastFindFilter } = makeStore();
      await store.listByDatasource('ws-1', 'prom-ds-001');
      const filter = getLastFindFilter();
      expect(filter).toContain(`${SLO_RULE_REF_SO_TYPE}.attributes.workspaceId: "ws-1"`);
      expect(filter).toContain(`${SLO_RULE_REF_SO_TYPE}.attributes.datasourceId: "prom-ds-001"`);
    });

    it('listByDatasource escapes embedded backslashes and quotes in id values', async () => {
      const { store, getLastFindFilter } = makeStore();
      // Hostile but legal: a workspace or datasource id containing characters
      // that would terminate or smuggle out of the KQL quoted string.
      await store.listByDatasource('ws"crafty', 'ds\\evil"id');
      const filter = getLastFindFilter() ?? '';

      // Backslashes in the source are doubled; literal quotes are escaped.
      // Expressed via JSON literals for readability.
      expect(filter).toContain(`${SLO_RULE_REF_SO_TYPE}.attributes.workspaceId: "ws\\"crafty"`);
      expect(filter).toContain(
        `${SLO_RULE_REF_SO_TYPE}.attributes.datasourceId: "ds\\\\evil\\"id"`
      );

      // The filter must remain a single balanced clause group; an
      // unescaped quote in the value would close the string mid-clause and
      // turn the filter into a syntactically valid but semantically wider
      // query.
      const openParens = (filter.match(/\(/g) ?? []).length;
      const closeParens = (filter.match(/\)/g) ?? []).length;
      expect(openParens).toBe(closeParens);
    });
  });
});

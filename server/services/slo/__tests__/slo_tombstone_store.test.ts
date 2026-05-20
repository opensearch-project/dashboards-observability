/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SavedObject, SavedObjectsClientContract } from '../../../../../../src/core/server';
import {
  SLO_TOMBSTONE_SO_TYPE,
  SloTombstoneAttributes,
  sloTombstoneId,
} from '../../../saved_objects/slo_tombstone';
import {
  isTombstoneExpired,
  SLO_TOMBSTONE_TTL_MS,
  SloTombstoneStore,
} from '../slo_tombstone_store';

// ============================================================================
// Test doubles (pattern mirrors slo_rule_ref_store.test.ts)
// ============================================================================

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

type Stored = SavedObject<SloTombstoneAttributes>;

function makeFakeClient() {
  const byId = new Map<string, Stored>();
  let versionCounter = 0;

  const client = ({
    async get<T>(_type: string, id: string): Promise<SavedObject<T>> {
      const hit = byId.get(id);
      if (!hit) throw notFoundError(SLO_TOMBSTONE_SO_TYPE, id);
      return ({ ...hit, attributes: { ...hit.attributes } } as unknown) as SavedObject<T>;
    },
    async create<T>(
      _type: string,
      attrs: T,
      options?: { id?: string; overwrite?: boolean }
    ): Promise<SavedObject<T>> {
      const id = options?.id ?? `auto-${++versionCounter}`;
      if (byId.has(id) && !options?.overwrite) {
        throw new StatusError(409, 'conflict');
      }
      const stored: Stored = {
        id,
        type: SLO_TOMBSTONE_SO_TYPE,
        attributes: (attrs as unknown) as SloTombstoneAttributes,
        references: [],
        version: `v${++versionCounter}`,
      };
      byId.set(id, stored);
      return ({ ...stored, attributes: { ...stored.attributes } } as unknown) as SavedObject<T>;
    },
    async delete(_type: string, id: string): Promise<{}> {
      if (!byId.has(id)) throw notFoundError(SLO_TOMBSTONE_SO_TYPE, id);
      byId.delete(id);
      return {};
    },
  } as unknown) as SavedObjectsClientContract;

  return { client, byId };
}

function makeStore() {
  const fake = makeFakeClient();
  return { store: new SloTombstoneStore(fake.client), byId: fake.byId };
}

const SLO_ID = 'slo-abc-123';
const FIXED_NOW = new Date('2026-04-28T10:00:00.000Z');

const BASE_ATTRS: SloTombstoneAttributes = {
  sloId: SLO_ID,
  workspaceId: 'ws-1',
  datasourceId: 'prom-ds-001',
  name: 'API Availability',
  reason: 'user_delete',
  createdAt: FIXED_NOW.toISOString(),
};

const expectedId = sloTombstoneId(SLO_ID);

// ============================================================================
// Tests
// ============================================================================

describe('SloTombstoneStore', () => {
  describe('write', () => {
    it('creates an SO at the canonical id with the given attributes', async () => {
      const { store, byId } = makeStore();
      await store.write(BASE_ATTRS);
      const stored = byId.get(expectedId);
      expect(stored).toBeDefined();
      expect(stored?.attributes).toEqual(BASE_ATTRS);
    });

    it('overwrites an existing tombstone for the same sloId', async () => {
      const { store, byId } = makeStore();
      await store.write(BASE_ATTRS);
      const updated: SloTombstoneAttributes = {
        ...BASE_ATTRS,
        name: 'Renamed Before Delete',
        createdAt: '2026-04-29T00:00:00.000Z',
      };
      await store.write(updated);
      expect(byId.get(expectedId)?.attributes).toEqual(updated);
    });
  });

  describe('get', () => {
    it('returns null when no tombstone exists (404)', async () => {
      const { store } = makeStore();
      expect(await store.get('missing-slo')).toBeNull();
    });

    it('returns the stored attributes on success', async () => {
      const { store } = makeStore();
      await store.write(BASE_ATTRS);
      const got = await store.get(SLO_ID);
      expect(got?.id).toBe(expectedId);
      expect(got?.attributes).toEqual(BASE_ATTRS);
    });
  });

  describe('remove', () => {
    it('returns true and deletes when the tombstone exists', async () => {
      const { store, byId } = makeStore();
      await store.write(BASE_ATTRS);
      expect(await store.remove(SLO_ID)).toBe(true);
      expect(byId.has(expectedId)).toBe(false);
    });

    it('is idempotent — returns false on 404 without throwing', async () => {
      const { store } = makeStore();
      await expect(store.remove('never-existed')).resolves.toBe(false);
    });
  });

  describe('isTombstoneExpired', () => {
    const createdAt = '2026-04-01T00:00:00.000Z';
    const createdAtMs = Date.parse(createdAt);
    const attrs: SloTombstoneAttributes = { ...BASE_ATTRS, createdAt };

    it('is false when now equals createdAt (zero age)', () => {
      expect(isTombstoneExpired(attrs, new Date(createdAtMs))).toBe(false);
    });

    it('is false one millisecond before the TTL boundary', () => {
      const now = new Date(createdAtMs + SLO_TOMBSTONE_TTL_MS - 1);
      expect(isTombstoneExpired(attrs, now)).toBe(false);
    });

    it('is true at exactly the TTL boundary', () => {
      const now = new Date(createdAtMs + SLO_TOMBSTONE_TTL_MS);
      expect(isTombstoneExpired(attrs, now)).toBe(true);
    });

    it('is true one millisecond after the TTL boundary', () => {
      const now = new Date(createdAtMs + SLO_TOMBSTONE_TTL_MS + 1);
      expect(isTombstoneExpired(attrs, now)).toBe(true);
    });

    it('honors a custom TTL when supplied', () => {
      const customTtl = 60_000; // 1 minute
      const justBefore = new Date(createdAtMs + customTtl - 1);
      const atBoundary = new Date(createdAtMs + customTtl);
      expect(isTombstoneExpired(attrs, justBefore, customTtl)).toBe(false);
      expect(isTombstoneExpired(attrs, atBoundary, customTtl)).toBe(true);
    });

    it('treats a corrupt createdAt as expired', () => {
      const corrupt: SloTombstoneAttributes = { ...BASE_ATTRS, createdAt: 'not-a-date' };
      expect(isTombstoneExpired(corrupt, new Date())).toBe(true);
    });
  });

  describe('SLO_TOMBSTONE_TTL_MS', () => {
    it('defaults to 30 days in milliseconds', () => {
      expect(SLO_TOMBSTONE_TTL_MS).toBe(30 * 24 * 60 * 60_000);
    });
  });
});

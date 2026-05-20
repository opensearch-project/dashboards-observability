/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SavedObject-backed tombstone registry for the Phase 4 SLO rule-adoption
 * workstream (W4.1).
 *
 * A tombstone is written unconditionally during `SloService.delete` (legacy
 * and dedup paths). Its presence flags an orphan as "deliberately deleted" so
 * the reconciler / Recover UI (W4.2) can suppress re-surfacing the dangling
 * rule groups as candidates for adoption.
 *
 * OSD saved-objects carry no native TTL. Each tombstone stores `createdAt`;
 * callers compare against a default 30-day window via `isTombstoneExpired`.
 * The reconciler is the sole consumer today — it inlines the age check in its
 * sweep (W4.2) rather than running a separate cleanup loop.
 */

import type { SavedObject, SavedObjectsClientContract } from '../../../../../src/core/server';
import {
  SLO_TOMBSTONE_SO_TYPE,
  SloTombstoneAttributes,
  sloTombstoneId,
} from '../../saved_objects/slo_tombstone';

/** Default TTL — 30 days in ms. Keep in sync with the W4.1 spec. */
export const SLO_TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60_000;

export interface SloTombstoneDoc {
  id: string;
  attributes: SloTombstoneAttributes;
  version?: string;
}

/**
 * Structural surface consumed by `SloService`. Declared here and re-exported
 * from `common/slo/slo_service.ts` as a type-only re-export so the common
 * module stays free of server-side imports (mirrors `SloRuleRefStoreLite`).
 */
export interface SloTombstoneStoreLite {
  write(attrs: SloTombstoneAttributes): Promise<void>;
  get(sloId: string): Promise<SloTombstoneDoc | null>;
  /** Idempotent — returns `false` if no tombstone existed. */
  remove(sloId: string): Promise<boolean>;
}

/**
 * Detect a SavedObject 404 by inspecting the statusCode the same way
 * `slo_rule_ref_store.ts` does. Keeps us off the `SavedObjectsErrorHelpers`
 * API surface (Boom internals that are awkward to construct in unit tests).
 */
function isSavedObjectNotFound(err: unknown): boolean {
  const e = err as { output?: { statusCode?: number }; statusCode?: number } | undefined;
  return e?.output?.statusCode === 404 || e?.statusCode === 404;
}

function toDoc(obj: SavedObject<SloTombstoneAttributes>): SloTombstoneDoc {
  return { id: obj.id, attributes: obj.attributes, version: obj.version };
}

export class SloTombstoneStore implements SloTombstoneStoreLite {
  constructor(private readonly client: SavedObjectsClientContract) {}

  /**
   * Write a tombstone. Overwrites any existing tombstone for the same sloId —
   * re-create/re-delete cycles should surface the most recent deletion.
   */
  async write(attrs: SloTombstoneAttributes): Promise<void> {
    const id = sloTombstoneId(attrs.sloId);
    await this.client.create<SloTombstoneAttributes>(SLO_TOMBSTONE_SO_TYPE, attrs, {
      id,
      overwrite: true,
    });
  }

  async get(sloId: string): Promise<SloTombstoneDoc | null> {
    const id = sloTombstoneId(sloId);
    try {
      const obj = await this.client.get<SloTombstoneAttributes>(SLO_TOMBSTONE_SO_TYPE, id);
      return toDoc(obj);
    } catch (err) {
      if (isSavedObjectNotFound(err)) return null;
      throw err;
    }
  }

  async remove(sloId: string): Promise<boolean> {
    const id = sloTombstoneId(sloId);
    try {
      await this.client.delete(SLO_TOMBSTONE_SO_TYPE, id);
      return true;
    } catch (err) {
      if (isSavedObjectNotFound(err)) return false;
      throw err;
    }
  }
}

/**
 * Return true when the tombstone is older than `ttlMs`. Boundary semantics:
 *   - `now - createdAt < ttlMs` → live (not expired)
 *   - `now - createdAt >= ttlMs` → expired
 *
 * A tombstone whose `createdAt` is unparseable is treated as expired — the
 * reconciler's fallback is always "surface the orphan", and we'd rather err
 * toward surfacing than suppressing when a tombstone is corrupt.
 */
export function isTombstoneExpired(
  tombstone: SloTombstoneAttributes,
  now: Date,
  ttlMs: number = SLO_TOMBSTONE_TTL_MS
): boolean {
  const createdAtMs = Date.parse(tombstone.createdAt);
  if (!Number.isFinite(createdAtMs)) return true;
  return now.getTime() - createdAtMs >= ttlMs;
}

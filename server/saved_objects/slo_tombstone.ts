/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Saved-object type definition for the `slo-tombstone` registry (Phase 4 W4.1).
 *
 * One SO per deleted SLO. The tombstone records that a given sloId was
 * *deliberately* deleted by the user so the Phase 4 adoption / Recover UI can
 * suppress re-surfacing the dangling rule groups as "orphan; recover?".
 *
 * Tombstones are written unconditionally from `SloService.delete` (both the
 * legacy single-group path and the Phase 3 dedup path) — the cost is negligible
 * and the presence of a tombstone is useful for operator debugging even when
 * the adoption feature itself is flagged off. Consumers that surface
 * tombstoned state (reconciler's Recover UI, W4.2) are responsible for gating
 * on `observability.slo.ruleAdoption.enabled`.
 *
 * TTL: OSD saved-objects have no native TTL mechanism. Each tombstone carries
 * a `createdAt` field; callers use the exported `isTombstoneExpired` helper
 * in `slo_tombstone_store.ts` to decide whether a tombstone is still within
 * its 30-day window. Expired tombstones are treated as absent by the
 * reconciler; they are left on disk until the reconciler's grace-period sweep
 * prunes them inline (W4.2).
 */

import type { SavedObjectsType } from '../../../../src/core/server';

export const SLO_TOMBSTONE_SO_TYPE = 'slo-tombstone';

/**
 * Attribute shape of a `slo-tombstone` saved object.
 *
 * `reason` is an open enum — today only `'user_delete'` is written, but the
 * field is preserved so future codepaths (e.g. cascade deletes from workspace
 * teardown) can distinguish themselves without a migration.
 */
export interface SloTombstoneAttributes {
  sloId: string;
  workspaceId: string;
  datasourceId: string;
  /** Display name captured from `spec.name` at delete time, for Recover UI. */
  name: string;
  /** Open enum — defaults to `'user_delete'`. */
  reason?: string;
  /** ISO-8601 timestamp the tombstone was written. Used for TTL checks. */
  createdAt: string;
}

/**
 * Build the canonical SO id for a tombstone. Same sloId on re-create/re-delete
 * overwrites the prior tombstone, which is the correct behavior — the newer
 * event is the one the Recover UI should surface.
 */
export function sloTombstoneId(sloId: string): string {
  return `slo-tombstone:${sloId}`;
}

export const sloTombstoneType: SavedObjectsType = {
  name: SLO_TOMBSTONE_SO_TYPE,
  hidden: false,
  namespaceType: 'single',
  mappings: {
    properties: {
      sloId: { type: 'keyword' },
      workspaceId: { type: 'keyword' },
      datasourceId: { type: 'keyword' },
      name: { type: 'keyword' },
      reason: { type: 'keyword' },
      createdAt: { type: 'date' },
    },
  },
  management: {
    importableAndExportable: false,
  },
};

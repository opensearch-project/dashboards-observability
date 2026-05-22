/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SavedObject-backed registry for the recording-rule dedup layer.
 *
 * One SO per (workspaceId, datasourceId, fingerprint) tuple. The SO carries a
 * non-negative refcount: every SLO that references a fingerprint contributes
 * exactly one ref. Increments and decrements are read-modify-write against the
 * OSD SavedObjectsClient using optimistic concurrency — a 409 conflict is
 * retried up to 3 times before `SloRuleRefConflictError` is thrown so the
 * caller can surface a meaningful error (the SLO create/update path rolls
 * back the partial dual-write in this case).
 *
 * The store does not write to the ruler. The service layer owns ruler calls;
 * the store just tracks "do we still need this recording group?". When a
 * decrement takes refcount to zero the store records `zeroSinceAt` so the
 * reconciler can enforce a grace period before deletion.
 *
 * Reconciler contract (future work — not yet implemented):
 *
 *   Under A.4 the ruler recording-rule namespace is shared across OSD
 *   workspaces — workspace A and workspace B both targeting the same
 *   datasource land their slo-rule-ref SOs in distinct partitions but
 *   share one rule group on the ruler. The grace-GC pass MUST therefore
 *   consult the cross-workspace aggregate refcount before deleting a
 *   recording group:
 *
 *     1. Use a saved-objects client built from `createInternalRepository`
 *        — never a request-scoped one — so the WorkspaceIdConsumerWrapper
 *        does not auto-filter the find. The `SloStoreFactory.forReconciler`
 *        helper wires this correctly.
 *     2. For each candidate (datasourceId, fingerprint) tuple, sum
 *        refcount across every workspace's slo-rule-ref SO via
 *        `aggregateRefcount(datasourceId, fingerprint)`.
 *     3. Eligible-for-GC iff aggregate === 0 AND every contributing SO's
 *        `zeroSinceAt` lies before (now − graceMs).
 *     4. Only after deletion of the ruler group: drop the corresponding
 *        slo-rule-ref SOs.
 *
 *   A workspace-scoped client cannot satisfy step 2 by definition, which
 *   is why the reconciler diverges from the CRUD path's per-request
 *   client model.
 */

/* eslint-disable max-classes-per-file */

import type { SavedObject, SavedObjectsClientContract } from '../../../../../src/core/server';
import {
  SLO_RULE_REF_SO_TYPE,
  SloRuleRefAttributes,
  sloRuleRefId,
} from '../../saved_objects/slo_rule_ref';

const MAX_RETRIES = 3;

export class SloRuleRefConflictError extends Error {
  constructor(public readonly id: string) {
    super(`SloRuleRef optimistic-concurrency budget exhausted for ${id}`);
    this.name = 'SloRuleRefConflictError';
  }
}

export interface SloRuleRefDoc {
  id: string;
  attributes: SloRuleRefAttributes;
  version?: string;
}

export interface IncrementRefInput {
  workspaceId: string;
  datasourceId: string;
  fingerprint: string;
  fingerprintVersion: string;
  groupName: string;
  namespace: string;
  /**
   * Datasource `directQueryName`. Persisted on the SO so the reconciler
   * can build a ruler-delete payload without resolving data-source SOs
   * at sweep time. Optional in the type to keep the test surface compact;
   * production wiring always supplies it.
   */
  directQueryName?: string;
  now?: () => Date;
}

export interface DecrementRefInput {
  workspaceId: string;
  datasourceId: string;
  fingerprint: string;
  now?: () => Date;
}

export interface ListStaleZeroInput {
  graceMs: number;
  now?: () => Date;
}

export interface IncrementRefResult {
  doc: SloRuleRefDoc;
  /** True when the ref was created or the prior refcount was zero. */
  wasZero: boolean;
}

export interface DecrementRefResult {
  /** Current doc after decrement, or null when the ref was missing / already zero. */
  doc: SloRuleRefDoc | null;
  /** True when refcount just transitioned from 1 → 0 on this call. */
  droppedToZero: boolean;
  /**
   * True when the decrement was a no-op because the ref was missing or already
   * at zero. Signals drift to the caller (the service layer rolls back rather
   * than trying to repair).
   */
  underflow: boolean;
}

/**
 * Detect a SavedObject 404 by inspecting the statusCode on the thrown error
 * the same way `slo_saved_object_store.ts` does. This keeps us off the
 * `SavedObjectsErrorHelpers` API surface, which depends on Boom internals
 * that are awkward to construct in unit-test mocks.
 */
function isNotFound(err: unknown): boolean {
  const e = err as { output?: { statusCode?: number }; statusCode?: number } | undefined;
  const code = e?.output?.statusCode ?? e?.statusCode;
  // 404 — SO genuinely missing.
  // 403 — `WorkspaceIdConsumerWrapper` rejected the read because the SO
  // belongs to a different workspace. From the caller's perspective the
  // ref does not exist in their workspace; surface as missing so the
  // ref-bookkeeping code paths (increment, decrement, lookup) treat the
  // foreign-workspace ref as absent rather than 500ing.
  return code === 404 || code === 403;
}

function isConflict(err: unknown): boolean {
  const e = err as { output?: { statusCode?: number }; statusCode?: number } | undefined;
  return e?.output?.statusCode === 409 || e?.statusCode === 409;
}

function toDoc(obj: SavedObject<SloRuleRefAttributes>): SloRuleRefDoc {
  return { id: obj.id, attributes: obj.attributes, version: obj.version };
}

export class SloRuleRefStore {
  constructor(private readonly client: SavedObjectsClientContract) {}

  async get(
    workspaceId: string,
    datasourceId: string,
    fingerprint: string
  ): Promise<SloRuleRefDoc | null> {
    const id = sloRuleRefId(workspaceId, datasourceId, fingerprint);
    try {
      const obj = await this.client.get<SloRuleRefAttributes>(SLO_RULE_REF_SO_TYPE, id);
      return toDoc(obj);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async listByDatasource(workspaceId: string, datasourceId: string): Promise<SloRuleRefDoc[]> {
    const results: SloRuleRefDoc[] = [];
    let page = 1;
    const perPage = 1000;
    const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const filter =
      `(${SLO_RULE_REF_SO_TYPE}.attributes.workspaceId: "${esc(workspaceId)}"` +
      ` AND ${SLO_RULE_REF_SO_TYPE}.attributes.datasourceId: "${esc(datasourceId)}")`;
    while (true) {
      const response = await this.client.find<SloRuleRefAttributes>({
        type: SLO_RULE_REF_SO_TYPE,
        page,
        perPage,
        filter,
      });
      for (const obj of response.saved_objects) {
        results.push(toDoc(obj as SavedObject<SloRuleRefAttributes>));
      }
      if (response.saved_objects.length === 0 || results.length >= response.total) break;
      page++;
    }
    return results;
  }

  async listStaleZero(input: ListStaleZeroInput): Promise<SloRuleRefDoc[]> {
    const now = input.now ?? (() => new Date());
    const cutoff = now().getTime() - input.graceMs;
    const results: SloRuleRefDoc[] = [];
    let page = 1;
    const perPage = 1000;
    const filter = `${SLO_RULE_REF_SO_TYPE}.attributes.refcount: 0`;
    while (true) {
      const response = await this.client.find<SloRuleRefAttributes>({
        type: SLO_RULE_REF_SO_TYPE,
        page,
        perPage,
        filter,
      });
      for (const obj of response.saved_objects) {
        const attrs = obj.attributes;
        if (!attrs.zeroSinceAt) continue;
        const zeroSinceMs = Date.parse(attrs.zeroSinceAt);
        if (Number.isFinite(zeroSinceMs) && zeroSinceMs <= cutoff) {
          results.push(toDoc(obj as SavedObject<SloRuleRefAttributes>));
        }
      }
      if (
        response.saved_objects.length === 0 ||
        results.length + (page - 1) * perPage >= response.total
      )
        break;
      page++;
    }
    return results;
  }

  /**
   * Sum refcount across every workspace's slo-rule-ref SO for a single
   * (datasourceId, fingerprint) tuple.
   *
   * Under A.4 the ruler namespace is shared across workspaces, so the
   * grace-GC decision needs the cross-workspace aggregate — a fingerprint
   * is eligible for cleanup only when no workspace still references it.
   * This read deliberately ignores workspace scoping; callers must pass an
   * internal-repository-backed client (see `SloStoreFactory.forReconciler`)
   * so the WorkspaceIdConsumerWrapper does not auto-filter the find().
   *
   * Read-time aggregation (vs. a materialized aggregate SO): the GC pass
   * fires on a slow timer, the per-fingerprint cardinality is bounded by
   * the number of workspaces a single Cortex tenant serves, and the
   * matching slo-rule-ref docs all live behind the wrapper anyway — paying
   * one O(workspaces) find here is cheaper than coordinating writes to a
   * second SO on every increment/decrement.
   */
  async aggregateRefcount(datasourceId: string, fingerprint: string): Promise<number> {
    let total = 0;
    let page = 1;
    const perPage = 1000;
    const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const filter =
      `(${SLO_RULE_REF_SO_TYPE}.attributes.datasourceId: "${esc(datasourceId)}"` +
      ` AND ${SLO_RULE_REF_SO_TYPE}.attributes.fingerprint: "${esc(fingerprint)}")`;
    while (true) {
      const response = await this.client.find<SloRuleRefAttributes>({
        type: SLO_RULE_REF_SO_TYPE,
        page,
        perPage,
        filter,
      });
      for (const obj of response.saved_objects) {
        total += Math.max(0, obj.attributes.refcount ?? 0);
      }
      if (response.saved_objects.length === 0 || page * perPage >= response.total) break;
      page++;
    }
    return total;
  }

  async remove(workspaceId: string, datasourceId: string, fingerprint: string): Promise<boolean> {
    const id = sloRuleRefId(workspaceId, datasourceId, fingerprint);
    try {
      await this.client.delete(SLO_RULE_REF_SO_TYPE, id);
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }

  async incrementRef(input: IncrementRefInput): Promise<IncrementRefResult> {
    const now = input.now ?? (() => new Date());
    const id = sloRuleRefId(input.workspaceId, input.datasourceId, input.fingerprint);
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      let existing: SavedObject<SloRuleRefAttributes> | null;
      try {
        existing = await this.client.get<SloRuleRefAttributes>(SLO_RULE_REF_SO_TYPE, id);
      } catch (err) {
        if (isNotFound(err)) {
          existing = null;
        } else {
          throw err;
        }
      }

      if (existing === null) {
        const nowIso = now().toISOString();
        const attrs: SloRuleRefAttributes = {
          workspaceId: input.workspaceId,
          datasourceId: input.datasourceId,
          fingerprint: input.fingerprint,
          fingerprintVersion: input.fingerprintVersion,
          refcount: 1,
          groupName: input.groupName,
          namespace: input.namespace,
          directQueryName: input.directQueryName,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        try {
          const created = await this.client.create<SloRuleRefAttributes>(
            SLO_RULE_REF_SO_TYPE,
            attrs,
            { id, overwrite: false }
          );
          return { doc: toDoc(created), wasZero: true };
        } catch (err) {
          if (isConflict(err)) {
            lastErr = err;
            continue;
          }
          throw err;
        }
      }

      const prior = existing.attributes;
      const wasZero = prior.refcount === 0;
      const nextAttrs: SloRuleRefAttributes = {
        ...prior,
        refcount: prior.refcount + 1,
        updatedAt: now().toISOString(),
        // Clear the zero marker on resurrection so the grace-period sweep
        // doesn't delete a now-live ref on its next pass.
        zeroSinceAt: undefined,
        // Update group/namespace in case the caller re-provisioned to a
        // different namespace (e.g. rename). Both should be stable in
        // practice, but we don't want a stale pointer.
        groupName: input.groupName,
        namespace: input.namespace,
        fingerprintVersion: input.fingerprintVersion,
        // Refresh `directQueryName` too — covers a datasource rename
        // between the original increment and this resurrection.
        directQueryName: input.directQueryName ?? prior.directQueryName,
      };
      try {
        const updated = await this.client.update<SloRuleRefAttributes>(
          SLO_RULE_REF_SO_TYPE,
          id,
          nextAttrs,
          { version: existing.version }
        );
        return {
          doc: {
            id,
            attributes: { ...prior, ...updated.attributes, ...nextAttrs },
            version: updated.version,
          },
          wasZero,
        };
      } catch (err) {
        if (isConflict(err)) {
          lastErr = err;
          continue;
        }
        throw err;
      }
    }

    const err = new SloRuleRefConflictError(id);
    if (lastErr instanceof Error) err.stack = lastErr.stack;
    throw err;
  }

  async decrementRef(input: DecrementRefInput): Promise<DecrementRefResult> {
    const now = input.now ?? (() => new Date());
    const id = sloRuleRefId(input.workspaceId, input.datasourceId, input.fingerprint);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      let existing: SavedObject<SloRuleRefAttributes> | null;
      try {
        existing = await this.client.get<SloRuleRefAttributes>(SLO_RULE_REF_SO_TYPE, id);
      } catch (err) {
        if (isNotFound(err)) {
          return { doc: null, droppedToZero: false, underflow: true };
        }
        throw err;
      }

      const prior = existing.attributes;
      if (prior.refcount <= 0) {
        return {
          doc: toDoc(existing),
          droppedToZero: false,
          underflow: true,
        };
      }

      const nextCount = prior.refcount - 1;
      const droppedToZero = nextCount === 0;
      const nowIso = now().toISOString();
      const nextAttrs: SloRuleRefAttributes = {
        ...prior,
        refcount: nextCount,
        updatedAt: nowIso,
        zeroSinceAt: droppedToZero ? nowIso : undefined,
      };
      try {
        const updated = await this.client.update<SloRuleRefAttributes>(
          SLO_RULE_REF_SO_TYPE,
          id,
          nextAttrs,
          { version: existing.version }
        );
        return {
          doc: {
            id,
            attributes: { ...prior, ...updated.attributes, ...nextAttrs },
            version: updated.version,
          },
          droppedToZero,
          underflow: false,
        };
      } catch (err) {
        if (isConflict(err)) continue;
        throw err;
      }
    }

    throw new SloRuleRefConflictError(id);
  }
}

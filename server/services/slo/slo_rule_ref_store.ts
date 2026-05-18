/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SavedObject-backed registry for the Phase 3 recording-rule dedup layer.
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
 */

/* eslint-disable max-classes-per-file */

import type { SavedObject, SavedObjectsClientContract } from '../../../../../src/core/server';
import {
  SLO_RULE_REF_SO_TYPE,
  SloRuleRefAttributes,
  sloRuleRefId,
} from '../../saved_objects/slo_rule_ref';
import { isSavedObjectConflict, isSavedObjectNotFound } from './saved_object_helpers';

const MAX_RETRIES = 5;
/**
 * Upper bound on the randomized backoff between optimistic-concurrency
 * retries. With back-to-back retries every contender lands the same stale
 * version on every attempt; even a 50ms cap of jitter is enough to break
 * up the lockstep without noticeably slowing single-tenant throughput.
 * The bulk-create path (PR 6 adoption flow) is where this matters most.
 */
const RETRY_JITTER_MS = 50;
async function delayWithJitter(): Promise<void> {
  const ms = Math.floor(Math.random() * RETRY_JITTER_MS);
  if (ms === 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

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
  now?: () => Date;
}

export interface DecrementRefInput {
  workspaceId: string;
  datasourceId: string;
  fingerprint: string;
  /**
   * Fingerprint algorithm version. Required so the SO id is fully determined
   * — future FINGERPRINT_VERSION bumps create a disjoint id namespace, and
   * the caller always knows which version the SLO's own provisioning record
   * was written at.
   */
  fingerprintVersion: string;
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
 * Re-export under local names so the existing call sites stay readable.
 * Logic lives in `saved_object_helpers.ts` so both this store and the
 * SLO definition store share one definition. Mocks that simulate the
 * SavedObjects 404 / 409 error shape work against either name.
 */
const isNotFound = isSavedObjectNotFound;
const isConflict = isSavedObjectConflict;

function toDoc(obj: SavedObject<SloRuleRefAttributes>): SloRuleRefDoc {
  return { id: obj.id, attributes: obj.attributes, version: obj.version };
}

export class SloRuleRefStore {
  constructor(private readonly client: SavedObjectsClientContract) {}

  async get(
    workspaceId: string,
    datasourceId: string,
    fingerprintVersion: string,
    fingerprint: string
  ): Promise<SloRuleRefDoc | null> {
    const id = sloRuleRefId(workspaceId, datasourceId, fingerprintVersion, fingerprint);
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
    // Track how many refs we've seen before the `zeroSinceAt + cutoff`
    // filter — `results` only includes refs that pass the secondary check,
    // so mixing it with `response.total` (which counts ALL `refcount: 0`
    // refs, regardless of grace state) would terminate the loop early
    // and silently drop stale refs past the cross-page boundary. The
    // reconciler depends on this returning everything past grace.
    let processed = 0;
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
      processed += response.saved_objects.length;
      if (response.saved_objects.length === 0 || processed >= response.total) break;
      page++;
    }
    return results;
  }

  async remove(
    workspaceId: string,
    datasourceId: string,
    fingerprintVersion: string,
    fingerprint: string
  ): Promise<boolean> {
    const id = sloRuleRefId(workspaceId, datasourceId, fingerprintVersion, fingerprint);
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
    const id = sloRuleRefId(
      input.workspaceId,
      input.datasourceId,
      input.fingerprintVersion,
      input.fingerprint
    );
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // Jitter between retries so contenders fan out instead of all
      // re-reading the same stale version in lockstep.
      if (attempt > 0) await delayWithJitter();
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
      };
      try {
        const updated = await this.client.update<SloRuleRefAttributes>(
          SLO_RULE_REF_SO_TYPE,
          id,
          nextAttrs,
          { version: existing.version }
        );
        // Layer the SO client's response over `prior`, not over `nextAttrs`.
        // `SavedObjectsClientContract.update` types `attributes` as
        // `Partial<T>` — today's repository echoes the request body so
        // either base would work, but a future wrapper (or refetch-on-write
        // impl that picks up a concurrent reconciler edit to `zeroSinceAt`)
        // could legitimately return a partial. Re-spreading our pre-write
        // `nextAttrs` here would let stale values clobber any such field
        // the SO server actually returned; spreading `prior` only fills
        // gaps the response left out.
        return {
          doc: {
            id,
            attributes: { ...prior, ...updated.attributes },
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
    const id = sloRuleRefId(
      input.workspaceId,
      input.datasourceId,
      input.fingerprintVersion,
      input.fingerprint
    );

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) await delayWithJitter();
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
        // See `incrementRef` — trust the SO client's response, don't
        // re-spread our pre-write `nextAttrs` over the post-write
        // attributes.
        return {
          doc: {
            id,
            attributes: { ...prior, ...updated.attributes },
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

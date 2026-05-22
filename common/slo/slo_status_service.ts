/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live-status read path for SLOs. Owns:
 *
 *   - the 60s status cache (`statusCache`)
 *   - the aggregator-failure warn dedup set
 *   - aggregator orchestration (cache → SO read → aggregate → fallback to stub)
 *   - the stub status the listing page falls back to when the aggregator is
 *     not wired or rejected
 *
 * Split out of the original `slo_service.ts` during the H5 decomposition.
 * The cache and aggregator handle live in `SloServiceCore` so the lifecycle
 * service can call `invalidate(id)` after mutating an SLO without holding a
 * direct reference to this service.
 */

import type { SloDocument, SloLiveStatus } from './slo_types';
import type { SloStatusAggregationContext } from './slo_service_types';
import type { SloServiceCore } from './slo_service_core';
import {
  computeStubStatus,
  mapWithConcurrency,
  missingStatus as missingStatusOf,
  STATUS_CACHE_TTL_MS,
} from './slo_service_internals';

export class SloStatusService {
  constructor(private readonly core: SloServiceCore) {}

  async getStatus(
    id: string,
    ctx?: SloStatusAggregationContext,
    request?: unknown
  ): Promise<SloLiveStatus> {
    const [s] = await this.getStatuses([id], ctx, request);
    return s;
  }

  /**
   * Batch status lookup. When a status-aggregation context is provided AND an
   * aggregator is configured, cache misses go to the live aggregator.
   * Aggregator failures are trapped — the listing page must not 500 when the
   * ruler is unreachable. Failed lookups fall through to the stub so at
   * minimum we return the disabled/no-data skeleton the UI can render.
   *
   * Call order is preserved: `out[i]` corresponds to `ids[i]`.
   */
  async getStatuses(
    ids: string[],
    ctx?: SloStatusAggregationContext,
    request?: unknown
  ): Promise<SloLiveStatus[]> {
    const { sloStore } = this.core.resolveStores(request);
    const now = Date.now();
    const result = new Map<string, SloLiveStatus>();
    const uncached: string[] = [];
    for (const id of ids) {
      const entry = this.core.statusCache.get(id);
      if (entry && entry.expiresAt > now) {
        result.set(id, entry.status);
      } else {
        uncached.push(id);
      }
    }
    if (uncached.length === 0) {
      return ids.map((id) => result.get(id) ?? missingStatusOf(id));
    }

    // Bound the SO read fan-out — `ids` is caller-controlled (the listing
    // page or aggregate endpoint), and a 500-id batch issuing 500 concurrent
    // `client.get` calls puts unnecessary pressure on the saved-objects layer.
    const docs = await mapWithConcurrency(uncached, 16, (id) => sloStore.get(id));
    const presentDocs: SloDocument[] = [];
    const missing: string[] = [];
    for (let i = 0; i < uncached.length; i++) {
      const doc = docs[i];
      if (doc) presentDocs.push(doc);
      else missing.push(uncached[i]);
    }
    for (const id of missing) result.set(id, missingStatusOf(id));

    if (presentDocs.length > 0) {
      let statuses: SloLiveStatus[] | null = null;
      if (this.core.aggregator && ctx) {
        try {
          statuses = await this.core.aggregator.aggregate(presentDocs, ctx);
        } catch (err) {
          // Catastrophic aggregator failure — fall through to stub. One warn
          // per distinct failure message (not per-SLO) to avoid log spam.
          this.warnAggregatorFailure('__batch__', err);
          statuses = null;
        }
      }
      for (let i = 0; i < presentDocs.length; i++) {
        const doc = presentDocs[i];
        const status = statuses ? statuses[i] : computeStubStatus(doc);
        result.set(doc.id, status);
      }
    }

    for (const id of uncached) {
      const status = result.get(id);
      if (status) {
        this.core.statusCache.set(id, { status, expiresAt: now + STATUS_CACHE_TTL_MS });
      }
    }

    return ids.map((id) => result.get(id) ?? missingStatusOf(id));
  }

  /** Drop a single SLO's cached status — invoked after lifecycle mutations. */
  invalidate(id: string): void {
    this.core.statusCache.delete(id);
  }

  /** Public stub access for `toSummary` fall-throughs. */
  noDataStatus(doc: SloDocument): SloLiveStatus {
    return computeStubStatus(doc);
  }

  missingStatus(sloId: string): SloLiveStatus {
    return missingStatusOf(sloId);
  }

  private warnAggregatorFailure(sloId: string, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    const key = `${sloId}:${msg}`;
    if (this.core.loggedAggregatorFailures.has(key)) return;
    this.core.loggedAggregatorFailures.add(key);
    this.core.logger.warn(
      `SloService: aggregator rejected (slo=${sloId}): ${msg}. Falling back to stub status.`
    );
  }
}

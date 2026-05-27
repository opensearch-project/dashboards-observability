/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Grace-GC pass for shared recording rules.
 *
 * Under A.4 the ruler recording-rule namespace is shared across OSD
 * workspaces — workspace A and workspace B both targeting the same
 * datasource land their slo-rule-ref SOs in distinct partitions but share
 * one rule group on the ruler. The reconciler is the only path that may
 * delete a shared recording group: it must verify aggregate refcount
 * across every workspace, then tear down the ruler group, then drop the
 * zero-ref slo-rule-ref SOs.
 *
 * The reconciler runs without a request scope, so it intentionally uses
 * the internal saved-objects repository (no workspace wrapper). CRUD code
 * paths must NEVER use this access model — they use the per-request
 * factory so the workspace wrapper engages.
 *
 * Sweep cadence is operator-configurable via
 * `observability.slo.reconciler.intervalMs` (default 5 min) and
 * `observability.slo.reconciler.graceMs` (default 24h). The grace window
 * is what gives "I just deleted that SLO by accident" recovery semantics
 * — re-creating the SLO before the sweep fires bumps the ref back up and
 * clears `zeroSinceAt`, so the rule group never disappears.
 */

import type {
  Logger as OsdLogger,
  SavedObjectsClientContract,
  SavedObjectsServiceStart,
  OpenSearchServiceStart,
} from '../../../../../src/core/server';
import type { AlertingOSClient, Datasource } from '../../../common/types/alerting';
import {
  SLO_RULE_REF_SO_TYPE,
  SloRuleRefAttributes,
  sloRuleRefId,
} from '../../saved_objects/slo_rule_ref';
import { SloRuleRefStore } from './slo_rule_ref_store';
import type { RulerClient } from './ruler_client';
import { SLO_INTERNAL_REPO_TYPES } from './slo_store_factory';

export interface SloReconcilerOptions {
  intervalMs: number;
  graceMs: number;
  /**
   * Override for unit tests that want to drive sweeps manually rather
   * than rely on `setInterval`.
   */
  schedule?: (cb: () => void, delayMs: number) => { unref?: () => void };
  cancel?: (handle: ReturnType<NonNullable<SloReconcilerOptions['schedule']>>) => void;
  /** Override for deterministic tests. */
  now?: () => Date;
}

interface StaleTuple {
  datasourceId: string;
  fingerprint: string;
  groupName: string;
  namespace: string;
  directQueryName?: string;
  /** Per-workspace refs that participated in this tuple. */
  refs: Array<{ id: string; workspaceId: string; zeroSinceAt: string }>;
}

const DEFAULT_NOW = () => new Date();

export class SloReconciler {
  private handle: ReturnType<NonNullable<SloReconcilerOptions['schedule']>> | null = null;
  private running = false;

  constructor(
    private readonly logger: OsdLogger,
    private readonly savedObjects: SavedObjectsServiceStart,
    private readonly opensearch: OpenSearchServiceStart,
    private readonly ruler: RulerClient,
    private readonly opts: SloReconcilerOptions
  ) {}

  start(): void {
    if (this.handle) return;
    const schedule = this.opts.schedule ?? defaultSchedule;
    // Skip the first interval — running on boot would race the rest of
    // plugin startup and add noise to logs. Wait one interval then sweep.
    this.handle = schedule(() => this.tick(), this.opts.intervalMs);
    this.handle.unref?.();
    this.logger.info(
      `SLO reconciler started (intervalMs=${this.opts.intervalMs}, graceMs=${this.opts.graceMs})`
    );
  }

  stop(): void {
    if (!this.handle) return;
    const cancel = this.opts.cancel ?? defaultCancel;
    cancel(this.handle);
    this.handle = null;
    this.logger.info('SLO reconciler stopped');
  }

  /**
   * Run one sweep. Public so the unit tests can drive it directly without
   * a real timer. Re-entrant-safe: a second concurrent invocation is a
   * no-op until the first returns.
   */
  async sweep(): Promise<{ swept: number; deleted: number; skipped: number }> {
    if (this.running) {
      this.logger.debug('SLO reconciler sweep already running — skipping overlap');
      return { swept: 0, deleted: 0, skipped: 0 };
    }
    this.running = true;
    try {
      return await this.runSweep();
    } finally {
      this.running = false;
    }
  }

  private async tick(): Promise<void> {
    try {
      await this.sweep();
    } catch (err) {
      // Top-level swallow — a thrown sweep must not kill the timer or the
      // plugin. Log + continue.
      this.logger.error(
        `SLO reconciler sweep crashed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      // Re-arm. Single-shot timers keep the loop predictable even when a
      // sweep takes longer than `intervalMs`.
      const schedule = this.opts.schedule ?? defaultSchedule;
      this.handle = schedule(() => this.tick(), this.opts.intervalMs);
      this.handle.unref?.();
    }
  }

  private async runSweep(): Promise<{ swept: number; deleted: number; skipped: number }> {
    const internal = this.internalRepo();
    const refStore = new SloRuleRefStore(internal);
    const now = this.opts.now ?? DEFAULT_NOW;

    // Phase 1: list every slo-rule-ref SO that has been refcount=0 for
    // longer than `graceMs`. This is the per-workspace view; downstream
    // we still need to confirm that the cross-workspace aggregate is also
    // zero before issuing a ruler delete.
    const staleRefs = await refStore.listStaleZero({ graceMs: this.opts.graceMs, now });

    if (staleRefs.length === 0) {
      return { swept: 0, deleted: 0, skipped: 0 };
    }

    // Phase 2: bucket by (datasourceId, fingerprint). All workspaces'
    // zero-ref SOs for the same shared rule group must be grace-eligible
    // before we touch the ruler.
    const tuples = this.bucket(staleRefs);

    let deleted = 0;
    let skipped = 0;

    for (const tuple of tuples) {
      const aggregate = await refStore.aggregateRefcount(tuple.datasourceId, tuple.fingerprint);
      if (aggregate > 0) {
        // Some workspace re-claimed this fingerprint between listStaleZero
        // and now. Leave it alone; the next sweep re-checks.
        skipped++;
        continue;
      }

      if (!tuple.directQueryName) {
        // Pre-reconciler-feature SO without `directQueryName`. We can't
        // build a ruler delete for it. Skip and log so an operator can
        // backfill or wait for the SOs to be re-created via normal
        // create/update churn.
        this.logger.warn(
          `SLO reconciler: skipping (ds=${tuple.datasourceId}, fp=${tuple.fingerprint}) — slo-rule-ref SO is missing directQueryName`
        );
        skipped++;
        continue;
      }

      try {
        await this.ruler.deleteRuleGroup(
          this.systemClient(),
          this.systemDatasource(tuple),
          tuple.namespace,
          tuple.groupName
        );
      } catch (err) {
        // Ruler delete failed (auth, 5xx, network). Leave the SOs in
        // place — the next sweep retries. Anything but the ruler being
        // unreachable would be unusual; log as warn so it surfaces.
        this.logger.warn(
          `SLO reconciler: ruler delete failed for (ds=${tuple.datasourceId}, fp=${
            tuple.fingerprint
          }): ${err instanceof Error ? err.message : String(err)}. Will retry next sweep.`
        );
        skipped++;
        continue;
      }

      // Ruler delete succeeded. Drop every zero-ref SO that belonged to
      // this tuple. SO deletes are best-effort — a partial failure leaves
      // an orphan SO which the next sweep cleans up (its aggregate is
      // still zero and its zeroSinceAt is still past grace).
      for (const ref of tuple.refs) {
        try {
          await internal.delete(SLO_RULE_REF_SO_TYPE, ref.id);
        } catch (err) {
          this.logger.warn(
            `SLO reconciler: SO delete failed for ${ref.id}: ${
              err instanceof Error ? err.message : String(err)
            }. Will retry next sweep.`
          );
        }
      }

      deleted++;
      this.logger.info(
        `SLO reconciler: GC'd shared rule group (ds=${tuple.datasourceId}, fp=${tuple.fingerprint}, refs=${tuple.refs.length})`
      );
    }

    return { swept: tuples.length, deleted, skipped };
  }

  private bucket(
    refs: ReadonlyArray<{ id: string; attributes: SloRuleRefAttributes }>
  ): StaleTuple[] {
    const byKey = new Map<string, StaleTuple>();
    for (const ref of refs) {
      const a = ref.attributes;
      const key = `${a.datasourceId}|${a.fingerprint}`;
      const id = ref.id ?? sloRuleRefId(a.workspaceId, a.datasourceId, a.fingerprint);
      const entry = byKey.get(key);
      if (entry) {
        entry.refs.push({
          id,
          workspaceId: a.workspaceId,
          zeroSinceAt: a.zeroSinceAt ?? '',
        });
        // Prefer any non-empty `directQueryName` we see — most recent
        // increment wins on rename.
        if (a.directQueryName && !entry.directQueryName) {
          entry.directQueryName = a.directQueryName;
        }
      } else {
        byKey.set(key, {
          datasourceId: a.datasourceId,
          fingerprint: a.fingerprint,
          groupName: a.groupName,
          namespace: a.namespace,
          directQueryName: a.directQueryName,
          refs: [
            {
              id,
              workspaceId: a.workspaceId,
              zeroSinceAt: a.zeroSinceAt ?? '',
            },
          ],
        });
      }
    }
    return [...byKey.values()];
  }

  private internalRepo(): SavedObjectsClientContract {
    const repo = this.savedObjects.createInternalRepository(SLO_INTERNAL_REPO_TYPES);
    return (repo as unknown) as SavedObjectsClientContract;
  }

  private systemClient(): AlertingOSClient {
    // The internal-user OS client exposes the same `transport.request`
    // shape `AlertingOSClient` expects. Cast through `unknown` to keep
    // the structural-compatibility intent explicit.
    return (this.opensearch.client.asInternalUser as unknown) as AlertingOSClient;
  }

  private systemDatasource(tuple: StaleTuple): Datasource {
    // Synthesize the minimal `Datasource` shape `RulerClient.deleteRuleGroup`
    // consumes. `directQueryName` is the only required field for path
    // resolution; the rest is pinned to defensible defaults that never
    // reach the wire.
    return {
      id: tuple.datasourceId,
      name: tuple.datasourceId,
      type: 'prometheus',
      url: '',
      enabled: true,
      directQueryName: tuple.directQueryName,
    };
  }
}

function defaultSchedule(cb: () => void, delayMs: number): NodeJS.Timeout {
  return setTimeout(cb, delayMs);
}

function defaultCancel(handle: unknown): void {
  if (handle) clearTimeout(handle as NodeJS.Timeout);
}

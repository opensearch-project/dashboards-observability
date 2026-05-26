/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Eager writeback of `SloLiveStatus.state` into the SO's `cachedState`
 * keyword projection. Used by the status pipeline so the next listing
 * call's state filter can push to the index instead of materializing every
 * matching SLO and applying the filter post-aggregation.
 *
 * Best-effort: failures here are logged at warn and never bubble up. A
 * skipped writeback only costs us the index-level filter optimization on
 * the next read; correctness is preserved because the live aggregator
 * always recomputes state regardless of what's in the SO.
 */

import type { ISloStore, SloHealthState } from './slo_types';
import type { Logger } from '../types/alerting';

const WRITEBACK_CONCURRENCY = 4;

interface WritebackInput {
  sloId: string;
  newState: SloHealthState;
  oldState: SloHealthState | null;
}

/**
 * Compare each (newState, oldState) pair, write back only the changes,
 * concurrency-bound. Order is preserved across logging but writes fan out
 * up to `WRITEBACK_CONCURRENCY` in flight.
 */
export async function writeBackChangedStates(
  store: ISloStore,
  inputs: WritebackInput[],
  logger?: Logger
): Promise<void> {
  if (!store.updateCachedState) return;
  const changed = inputs.filter((i) => i.newState !== i.oldState);
  if (changed.length === 0) return;
  const update = store.updateCachedState.bind(store);
  let cursor = 0;
  const runner = async () => {
    while (cursor < changed.length) {
      const i = cursor;
      cursor += 1;
      const item = changed[i];
      try {
        await update(item.sloId, item.newState);
      } catch (err) {
        logger?.warn(
          `SLO cached-state writeback failed for ${item.sloId}: ${
            err instanceof Error ? err.message : String(err)
          }. Filter pushdown for this SLO will lag until the next aggregator read.`
        );
      }
    }
  };
  const workers = Array.from({ length: Math.min(WRITEBACK_CONCURRENCY, changed.length) }, () =>
    runner()
  );
  await Promise.all(workers);
}

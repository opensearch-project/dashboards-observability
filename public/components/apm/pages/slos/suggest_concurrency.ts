/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bounded-concurrency helper shared by the Suggest SLOs hooks. Runs
 * `worker(item)` over `items` with at most `n` in flight; each worker is
 * expected to capture its own errors so the loop runs every item to
 * completion.
 */

/** Cap concurrent rule-group previews so opening the page on a service tree
 *  with hundreds of suggestions doesn't fan out hundreds of HTTP calls. */
export const PREVIEW_CONCURRENCY_LIMIT = 4;

/** Cap concurrent live-SLI rows so per-row PromQL fan-out (3 queries each)
 *  doesn't translate to hundreds of in-flight Prometheus instant queries. */
export const LIVE_SLI_ROW_CONCURRENCY_LIMIT = 4;

export async function withConcurrency<T>(
  n: number,
  items: T[],
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, n);
  let idx = 0;
  const runners: Array<Promise<void>> = [];
  const runNext = async (): Promise<void> => {
    while (idx < items.length) {
      const current = idx;
      idx += 1;
      await worker(items[current]);
    }
  };
  for (let i = 0; i < Math.min(limit, items.length); i += 1) {
    runners.push(runNext());
  }
  await Promise.all(runners);
}

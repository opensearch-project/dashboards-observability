/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { APPLICATION_MAP_CONSTANTS } from '../../common/constants';
import { escapePromQLRegex } from '../../query_services/query_requests/escape_utils';

/**
 * Split names into batches of at most METRICS_BATCH_SIZE names and METRICS_BATCH_MAX_CHARS of
 * escaped regex, so a `service=~` / `remoteService=~` name list never makes a query scan every
 * series or exceed the PromQL length limit. Order is preserved (callers put the most
 * important names first).
 */
export function chunkNames(names: string[]): string[][] {
  const { METRICS_BATCH_SIZE, METRICS_BATCH_MAX_CHARS } = APPLICATION_MAP_CONSTANTS;
  const batches: string[][] = [];
  let current: string[] = [];
  let chars = 0;
  names.forEach((name) => {
    const len = escapePromQLRegex(name).length + 1;
    if (
      current.length > 0 &&
      (current.length >= METRICS_BATCH_SIZE || chars + len > METRICS_BATCH_MAX_CHARS)
    ) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(name);
    chars += len;
  });
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Caps how many tasks run at once. One limiter can be shared by every hook on a page, so the
 * cap holds across all of the page's batched queries rather than per call.
 */
export interface BatchLimiter {
  /**
   * Run `task` once a slot is free. If `signal` aborts first, the task is never started; if it
   * aborts while the task runs, the slot is freed at once (the request was cancelled). Either
   * way the returned promise rejects with an AbortError.
   */
  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

const abortError = (): Error => {
  const err = new Error('Batch aborted');
  err.name = 'AbortError';
  return err;
};

export function createBatchLimiter(
  concurrency: number = APPLICATION_MAP_CONSTANTS.METRICS_MAX_CONCURRENT_BATCHES
): BatchLimiter {
  let active = 0;
  const queue: Array<() => void> = [];
  const pump = () => {
    while (active < concurrency && queue.length > 0) {
      const start = queue.shift();
      if (start) start();
    }
  };
  return {
    run: <T>(task: () => Promise<T>, signal?: AbortSignal) =>
      new Promise<T>((resolve, reject) => {
        if (signal?.aborted) {
          reject(abortError());
          return;
        }
        let settled = false;
        let holding = false;
        const finish = () => {
          if (settled) return false;
          settled = true;
          signal?.removeEventListener('abort', onAbort);
          if (holding) {
            holding = false;
            active -= 1;
            pump();
          }
          return true;
        };
        const start = () => {
          if (settled) return;
          // Aborted, but this task's abort listener has not run yet (another's freed the slot).
          if (signal?.aborted) {
            onAbort();
            return;
          }
          active += 1;
          holding = true;
          let running: Promise<T>;
          try {
            running = task();
          } catch (err) {
            running = Promise.reject(err);
          }
          running.then(
            (value) => {
              if (finish()) resolve(value);
            },
            (reason) => {
              if (finish()) reject(reason);
            }
          );
        };
        function onAbort() {
          const i = queue.indexOf(start);
          if (i >= 0) queue.splice(i, 1);
          if (finish()) reject(abortError());
        }
        signal?.addEventListener('abort', onAbort);
        queue.push(start);
        pump();
      }),
  };
}

/**
 * One limiter for the Services page's batched whole-range instant queries (the table's
 * dependency metrics and the fault widgets), so the cap holds across the page's jobs.
 */
export const servicesPageBatchLimiter: BatchLimiter = createBatchLimiter();

export interface RunBatchedOptions {
  /** Max batches in flight for this call; ignored when `limiter` is given. */
  concurrency?: number;
  /** Once aborted, no further batch starts; the unstarted ones reject with an AbortError. */
  signal?: AbortSignal;
  /**
   * All-or-nothing callers: after the first rejection no further batch starts (the unstarted
   * ones reject with a "skipped" error), so no query is sent only to be discarded.
   */
  failFast?: boolean;
  /** Shared limiter (see BatchLimiter), so the concurrency cap holds across calls. */
  limiter?: BatchLimiter;
}

/** Reason given to batches not started because an earlier batch failed (`failFast`). */
export const BATCH_SKIPPED_MESSAGE = 'Batch skipped after an earlier batch failed';

/**
 * Run `run` for every batch with a bounded number in flight; results are in batch order.
 * The third argument is the per-call concurrency, or options (signal, fail-fast, limiter).
 */
export async function runBatched<B, R>(
  batches: B[],
  run: (batch: B) => Promise<R>,
  concurrencyOrOptions: number | RunBatchedOptions = {}
): Promise<Array<PromiseSettledResult<R>>> {
  const options: RunBatchedOptions =
    typeof concurrencyOrOptions === 'number'
      ? { concurrency: concurrencyOrOptions }
      : concurrencyOrOptions;
  const { signal, failFast = false } = options;
  const limiter = options.limiter ?? createBatchLimiter(options.concurrency);
  let failed = false;
  return Promise.all(
    batches.map((batch) =>
      limiter
        .run(() => {
          if (failFast && failed) return Promise.reject(new Error(BATCH_SKIPPED_MESSAGE));
          // Marked before the limiter frees the slot, so the next queued batch sees it.
          return new Promise<R>((resolve) => resolve(run(batch))).catch((reason) => {
            failed = true;
            throw reason;
          });
        }, signal)
        .then(
          (value): PromiseSettledResult<R> => ({ status: 'fulfilled', value }),
          (reason): PromiseSettledResult<R> => ({ status: 'rejected', reason })
        )
    )
  );
}

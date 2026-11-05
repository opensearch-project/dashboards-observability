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
 * Run `run` for every batch with at most `concurrency` in flight; results are in batch order.
 */
export async function runBatched<B, R>(
  batches: B[],
  run: (batch: B) => Promise<R>,
  concurrency: number = APPLICATION_MAP_CONSTANTS.METRICS_MAX_CONCURRENT_BATCHES
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array(batches.length);
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await run(batches[i]) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));
  return results;
}

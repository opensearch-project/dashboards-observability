/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BATCH_SKIPPED_MESSAGE, chunkNames, createBatchLimiter, runBatched } from '../name_batches';
import { APPLICATION_MAP_CONSTANTS } from '../../../common/constants';
import { escapePromQLRegex } from '../../../query_services/query_requests/escape_utils';

const { METRICS_BATCH_MAX_CHARS } = APPLICATION_MAP_CONSTANTS;

describe('chunkNames', () => {
  it('measures the escaped regex, not the raw names', () => {
    // Host names are mostly dots, which escape to `\\\\.` inside the PromQL string.
    const hosts = Array.from({ length: 60 }, (_, i) => `api.${i}.partner.example.com`);
    const batches = chunkNames(hosts);
    expect(batches.flat()).toEqual(hosts);
    batches.forEach((b) => {
      const regex = b.map(escapePromQLRegex).join('|');
      expect(regex.length).toBeLessThanOrEqual(METRICS_BATCH_MAX_CHARS);
    });
    // The raw names alone would fit in fewer batches than the escaped ones need.
    const rawChars = hosts.reduce((n, h) => n + h.length + 1, 0);
    const escapedChars = hosts.reduce((n, h) => n + escapePromQLRegex(h).length + 1, 0);
    expect(escapedChars).toBeGreaterThan(rawChars);
  });

  it('keeps a single over-long name as its own batch', () => {
    const long = 'x'.repeat(METRICS_BATCH_MAX_CHARS + 10);
    expect(chunkNames(['a', long, 'b'])).toEqual([['a'], [long], ['b']]);
  });
});

describe('runBatched', () => {
  it('limits concurrency and keeps results in batch order, including failures', async () => {
    let inFlight = 0;
    let max = 0;
    const results = await runBatched(
      [1, 2, 3, 4, 5],
      async (n) => {
        inFlight += 1;
        max = Math.max(max, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        if (n === 3) throw new Error('three');
        return n * 10;
      },
      2
    );
    expect(max).toBe(2);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : 'x'))).toEqual([
      10,
      20,
      'x',
      40,
      50,
    ]);
  });

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('stops starting batches once the signal aborts', async () => {
    const controller = new AbortController();
    const started: number[] = [];
    const pending = runBatched(
      [1, 2, 3, 4],
      async (n) => {
        started.push(n);
        await delay(20);
        return n;
      },
      { concurrency: 2, signal: controller.signal }
    );
    await delay(5);
    controller.abort();
    const results = await pending;
    expect(started).toEqual([1, 2]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    results.forEach((r) => {
      if (r.status === 'rejected') expect(r.reason.name).toBe('AbortError');
    });
  });

  it('does not start any batch when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const run = jest.fn(async (n: number) => n);
    const results = await runBatched([1, 2], run, { signal: controller.signal });
    expect(run).not.toHaveBeenCalled();
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
  });

  it('fail-fast: no batch starts after the first rejection', async () => {
    const started: number[] = [];
    const results = await runBatched(
      [1, 2, 3, 4, 5],
      async (n) => {
        started.push(n);
        await delay(n === 1 ? 1 : 10);
        if (n === 1) throw new Error('one');
        return n;
      },
      { concurrency: 2, failFast: true }
    );
    // 1 and 2 were in flight together; 1 failed, so 3..5 never started (2 still completes).
    expect(started).toEqual([1, 2]);
    expect(results[0]).toEqual({ status: 'rejected', reason: new Error('one') });
    expect(results[1]).toEqual({ status: 'fulfilled', value: 2 });
    results.slice(2).forEach((r) => {
      expect(r.status).toBe('rejected');
      if (r.status === 'rejected') expect(r.reason.message).toBe(BATCH_SKIPPED_MESSAGE);
    });
  });

  it('without fail-fast, later batches still run after a rejection', async () => {
    const run = jest.fn(async (n: number) => {
      if (n === 1) throw new Error('one');
      return n;
    });
    const results = await runBatched([1, 2, 3], run, { concurrency: 1 });
    expect(run).toHaveBeenCalledTimes(3);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled', 'fulfilled']);
  });

  it('a shared limiter caps concurrency across calls', async () => {
    const limiter = createBatchLimiter(2);
    let inFlight = 0;
    let max = 0;
    const run = async (n: number) => {
      inFlight += 1;
      max = Math.max(max, inFlight);
      await delay(5);
      inFlight -= 1;
      return n;
    };
    const [a, b, c] = await Promise.all([
      runBatched([1, 2, 3], run, { limiter }),
      runBatched([4, 5, 6], run, { limiter }),
      runBatched([7, 8], run, { limiter }),
    ]);
    expect(max).toBe(2);
    expect([...a, ...b, ...c].map((r) => (r.status === 'fulfilled' ? r.value : 0))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it('an aborted call frees its slots in a shared limiter at once', async () => {
    const limiter = createBatchLimiter(1);
    const controller = new AbortController();
    const hung = runBatched([1], () => new Promise<number>(() => {}), {
      limiter,
      signal: controller.signal,
    });
    const other = jest.fn(async (n: number) => n);
    const next = runBatched([2], other, { limiter });
    await delay(5);
    expect(other).not.toHaveBeenCalled();
    controller.abort();
    expect((await hung)[0].status).toBe('rejected');
    expect(await next).toEqual([{ status: 'fulfilled', value: 2 }]);
  });
});

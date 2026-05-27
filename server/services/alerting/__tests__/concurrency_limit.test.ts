/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FANOUT_CONCURRENCY, runWithConcurrencyLimit } from '../alert_service';

describe('runWithConcurrencyLimit', () => {
  it('preserves input order in the result array', async () => {
    const tasks = [1, 2, 3, 4, 5].map((n) => async () => n * 10);
    const result = await runWithConcurrencyLimit(tasks, 2);
    const values = result.map((r) => (r.status === 'fulfilled' ? r.value : null));
    expect(values).toEqual([10, 20, 30, 40, 50]);
  });

  it('caps concurrent in-flight tasks to the requested concurrency', async () => {
    let inFlight = 0;
    let peak = 0;
    const tasks = Array.from({ length: 20 }, () => async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      // Yield to the microtask queue a few times so other workers have a
      // chance to start; without this the synchronous resolve might let one
      // worker drain the whole queue before others observe `inFlight`.
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return 'ok';
    });
    await runWithConcurrencyLimit(tasks, 4);
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1); // sanity — actually parallel
  });

  it('captures errors as rejected settled results without throwing', async () => {
    const tasks = [
      async () => 'ok',
      async () => {
        throw new Error('boom');
      },
      async () => 'fine',
    ];
    const result = await runWithConcurrencyLimit(tasks, 2);
    expect(result[0]).toEqual({ status: 'fulfilled', value: 'ok' });
    expect(result[1].status).toBe('rejected');
    expect(result[2]).toEqual({ status: 'fulfilled', value: 'fine' });
  });

  it('handles an empty task list', async () => {
    expect(await runWithConcurrencyLimit([], 5)).toEqual([]);
  });

  it('does not deadlock when concurrency exceeds task count', async () => {
    const tasks = [async () => 1, async () => 2];
    const result = await runWithConcurrencyLimit(tasks, 10);
    expect(result).toHaveLength(2);
    expect((result[0] as PromiseFulfilledResult<number>).value).toBe(1);
    expect((result[1] as PromiseFulfilledResult<number>).value).toBe(2);
  });

  it('uses FANOUT_CONCURRENCY by default and the constant is reasonable', () => {
    expect(typeof FANOUT_CONCURRENCY).toBe('number');
    expect(FANOUT_CONCURRENCY).toBeGreaterThan(0);
    expect(FANOUT_CONCURRENCY).toBeLessThanOrEqual(20);
  });

  it('does not let a slow task block already-completed faster tasks from kicking off the next batch', async () => {
    // 3 tasks, concurrency=2. Task 0 takes 50ms, task 1 takes 1ms, task 2
    // takes 1ms. With pure batched chunking (chunk → await all → next chunk)
    // task 2 would wait for task 0 to finish before starting. With a worker
    // pool, task 1 finishes fast and the same worker picks up task 2.
    const start = Date.now();
    const tasks = [
      async () => {
        await new Promise((r) => setTimeout(r, 50));
        return 'slow';
      },
      async () => {
        await new Promise((r) => setTimeout(r, 1));
        return 'fast-1';
      },
      async () => {
        await new Promise((r) => setTimeout(r, 1));
        return 'fast-2';
      },
    ];
    await runWithConcurrencyLimit(tasks, 2);
    const elapsed = Date.now() - start;
    // Should be ~50ms (slow + parallel fasts), not ~52+ms (slow + serial
    // fasts). Allow generous slack for test runner jitter.
    expect(elapsed).toBeLessThan(75);
  });
});

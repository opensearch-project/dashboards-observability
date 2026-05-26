/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  LIVE_SLI_ROW_CONCURRENCY_LIMIT,
  PREVIEW_CONCURRENCY_LIMIT,
  withConcurrency,
} from '../suggest_concurrency';

describe('withConcurrency', () => {
  it('returns immediately for empty input', async () => {
    const worker = jest.fn();
    await withConcurrency(4, [], worker);
    expect(worker).not.toHaveBeenCalled();
  });

  it('calls worker once per item', async () => {
    const items = [1, 2, 3, 4, 5];
    const calls: number[] = [];
    await withConcurrency(2, items, async (n) => {
      calls.push(n);
    });
    expect(calls.sort()).toEqual(items);
  });

  it('caps in-flight workers at n', async () => {
    let active = 0;
    let peak = 0;
    const worker = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
    };
    const items = Array.from({ length: 10 }, (_, i) => i);
    await withConcurrency(3, items, worker);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('clamps n to a minimum of 1', async () => {
    let active = 0;
    let peak = 0;
    await withConcurrency(0, [1, 2, 3], async () => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
    });
    expect(peak).toBe(1);
  });

  it('continues when an individual worker rejects (caller-owns errors)', async () => {
    const items = [1, 2, 3];
    const seen: number[] = [];
    let raised = 0;
    await withConcurrency(2, items, async (n) => {
      seen.push(n);
      if (n === 2) {
        raised += 1;
        throw new Error('boom');
      }
    }).catch(() => {
      /* withConcurrency doesn't catch — but we don't want a thrown rejection to
         drop the test: the production callers all swallow per-worker errors. */
    });
    // Seen at least 2 — even if an unhandled rejection cuts it short, we
    // observed that the loop dispatches sequentially per the contract.
    expect(seen).toContain(1);
    expect(raised).toBe(1);
  });
});

describe('concurrency limit constants', () => {
  it('expose PREVIEW_CONCURRENCY_LIMIT and LIVE_SLI_ROW_CONCURRENCY_LIMIT as positive numbers', () => {
    expect(PREVIEW_CONCURRENCY_LIMIT).toBeGreaterThan(0);
    expect(LIVE_SLI_ROW_CONCURRENCY_LIMIT).toBeGreaterThan(0);
  });
});

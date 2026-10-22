/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OutdatedRuleRepairer } from '../outdated_rule_repairer';
import type { Logger } from '../../../../common/types/alerting';

function logger(): Logger & { warn: jest.Mock; debug: jest.Mock } {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as never;
}

describe('OutdatedRuleRepairer', () => {
  let now = 0;
  const clock = () => now;
  beforeEach(() => {
    now = 1_000_000;
  });

  it('runs once per cooldown per SLO', async () => {
    const r = new OutdatedRuleRepairer(logger(), { cooldownMs: 1000, now: clock });
    const repair = jest.fn(async () => undefined);
    await r.schedule('a', repair);
    expect(r.schedule('a', repair)).toBeUndefined();
    now += 1001;
    await r.schedule('a', repair);
    expect(repair).toHaveBeenCalledTimes(2);
  });

  it('caps concurrency and queues the rest so one poll heals every SLO', async () => {
    const r = new OutdatedRuleRepairer(logger(), { maxInFlight: 1, now: clock });
    let running = 0;
    let maxRunning = 0;
    const order: string[] = [];
    const job = (key: string) => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((res) => setTimeout(res, 5));
      order.push(key);
      running--;
    };
    const pa = r.schedule('a', job('a'));
    // Same SLO while running or queued: skipped.
    expect(r.schedule('a', job('a'))).toBeUndefined();
    const pb = r.schedule('b', job('b'));
    const pc = r.schedule('c', job('c'));
    expect(r.schedule('b', job('b'))).toBeUndefined();
    await Promise.all([pa, pb, pc]);
    expect(order).toEqual(['a', 'b', 'c']);
    expect(maxRunning).toBe(1);
  });

  it('drops requests beyond the queue bound', () => {
    const r = new OutdatedRuleRepairer(logger(), { maxInFlight: 1, maxQueued: 1, now: clock });
    const never = () => new Promise<void>(() => undefined);
    expect(r.schedule('a', never)).toBeDefined(); // running
    expect(r.schedule('b', never)).toBeDefined(); // queued
    expect(r.schedule('c', never)).toBeUndefined(); // queue full
  });

  it('backs off exponentially on failure, warns once, and never throws', async () => {
    const log = logger();
    const r = new OutdatedRuleRepairer(log, { cooldownMs: 1000, maxBackoffMs: 3000, now: clock });
    const fail = jest.fn(async () => {
      throw new Error('ruler 503');
    });
    await expect(r.schedule('a', fail)).resolves.toBeUndefined();
    now += 1001;
    await r.schedule('a', fail); // 2nd failure → 2000 ms backoff
    now += 1500;
    expect(r.schedule('a', fail)).toBeUndefined();
    now += 600;
    await r.schedule('a', fail); // 3rd failure → capped at 3000 ms
    expect(fail).toHaveBeenCalledTimes(3);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.debug).toHaveBeenCalledTimes(2);
  });
});

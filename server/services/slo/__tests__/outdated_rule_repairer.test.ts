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

  it('never runs the same SLO twice concurrently and caps total in-flight', async () => {
    const r = new OutdatedRuleRepairer(logger(), { maxInFlight: 1, now: clock });
    let release: () => void = () => undefined;
    const slow = jest.fn(() => new Promise<void>((res) => (release = res)));
    const p = r.schedule('a', slow);
    expect(r.schedule('a', slow)).toBeUndefined();
    expect(
      r.schedule(
        'b',
        jest.fn(async () => undefined)
      )
    ).toBeUndefined();
    release();
    await p;
    expect(
      r.schedule(
        'b',
        jest.fn(async () => undefined)
      )
    ).toBeDefined();
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

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatasourceCircuitBreaker } from '../datasource_circuit_breaker';

describe('DatasourceCircuitBreaker', () => {
  it('is closed by default', () => {
    const cb = new DatasourceCircuitBreaker({ now: () => 0 });
    expect(cb.isOpen('ds-1')).toBe(false);
  });

  it('opens after threshold failures within the window', () => {
    const t = 0;
    const cb = new DatasourceCircuitBreaker({ now: () => t });
    cb.recordFailure('ds-1');
    cb.recordFailure('ds-1');
    expect(cb.isOpen('ds-1')).toBe(false);
    cb.recordFailure('ds-1');
    expect(cb.isOpen('ds-1')).toBe(true);
  });

  it('does not open if failures fall outside the window', () => {
    let t = 0;
    const cb = new DatasourceCircuitBreaker({ now: () => t, windowMs: 60_000 });
    cb.recordFailure('ds-1');
    t = 30_000;
    cb.recordFailure('ds-1');
    t = 91_000; // older two are now > 60s away from this third failure
    cb.recordFailure('ds-1');
    expect(cb.isOpen('ds-1')).toBe(false);
  });

  it('a successful call closes the breaker and clears failures', () => {
    const t = 0;
    const cb = new DatasourceCircuitBreaker({ now: () => t });
    cb.recordFailure('ds-1');
    cb.recordFailure('ds-1');
    cb.recordFailure('ds-1');
    expect(cb.isOpen('ds-1')).toBe(true);
    cb.recordSuccess('ds-1');
    expect(cb.isOpen('ds-1')).toBe(false);
  });

  it('cools down: half-open after cooldownMs, success closes', () => {
    let t = 0;
    const cb = new DatasourceCircuitBreaker({ now: () => t, cooldownMs: 60_000 });
    cb.recordFailure('ds-1');
    cb.recordFailure('ds-1');
    cb.recordFailure('ds-1');
    expect(cb.isOpen('ds-1')).toBe(true);
    t = 30_000;
    expect(cb.isOpen('ds-1')).toBe(true);
    t = 61_000; // past cooldown
    expect(cb.isOpen('ds-1')).toBe(false);
    cb.recordSuccess('ds-1');
    expect(cb.isOpen('ds-1')).toBe(false);
  });

  it('half-open trial that fails re-opens with full cooldown', () => {
    let t = 0;
    const cb = new DatasourceCircuitBreaker({ now: () => t, cooldownMs: 60_000 });
    cb.recordFailure('ds-1');
    cb.recordFailure('ds-1');
    cb.recordFailure('ds-1');
    t = 70_000; // half-open
    cb.recordFailure('ds-1'); // trial fails
    expect(cb.isOpen('ds-1')).toBe(true);
    t = 70_000 + 30_000; // 30s into new cooldown
    expect(cb.isOpen('ds-1')).toBe(true);
    t = 70_000 + 60_001;
    expect(cb.isOpen('ds-1')).toBe(false);
  });

  it('failures on one datasource do not affect another', () => {
    const t = 0;
    const cb = new DatasourceCircuitBreaker({ now: () => t });
    cb.recordFailure('ds-1');
    cb.recordFailure('ds-1');
    cb.recordFailure('ds-1');
    expect(cb.isOpen('ds-1')).toBe(true);
    expect(cb.isOpen('ds-2')).toBe(false);
  });

  it('fires onTransition once per state change', () => {
    const t = 0;
    const events: Array<[string, 'open' | 'close']> = [];
    const cb = new DatasourceCircuitBreaker({
      now: () => t,
      onTransition: (id, kind) => events.push([id, kind]),
    });
    cb.recordFailure('ds-1');
    cb.recordFailure('ds-1');
    cb.recordFailure('ds-1');
    cb.recordFailure('ds-1'); // already open; no second open event
    expect(events).toEqual([['ds-1', 'open']]);
    cb.recordSuccess('ds-1');
    expect(events).toEqual([
      ['ds-1', 'open'],
      ['ds-1', 'close'],
    ]);
  });
});

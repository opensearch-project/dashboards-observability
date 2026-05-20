/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ReconcilerMetrics tests.
 *
 * Exercises the dumb-counter contract the Phase 2 reconciler depends on:
 *   - zero-state snapshot
 *   - each counter increments (default +1 and custom n)
 *   - snapshot is frozen (no reach-around mutation)
 *   - reset zeros everything
 *   - negative inputs are clamped + logged at debug, not thrown
 *   - every increment emits a debug log with counter name + new total
 */

import { createReconcilerMetrics } from '../reconciler_metrics';
import type { Logger } from '../../../../common/types/alerting/types';

function mockLogger(): Logger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

describe('ReconcilerMetrics — zero state', () => {
  it('returns all zeros before any increment', () => {
    const metrics = createReconcilerMetrics(mockLogger());
    expect(metrics.snapshot()).toEqual({
      sweeps: 0,
      orphans: 0,
      missingRuleGroups: 0,
      errors: 0,
      danglingRefs: 0,
      graceDeletions: 0,
      adoptableOrphans: 0,
      unknownOrphans: 0,
    });
  });
});

describe('ReconcilerMetrics — increments', () => {
  it('incSweeps() defaults to +1 per call', () => {
    const metrics = createReconcilerMetrics(mockLogger());
    metrics.incSweeps();
    metrics.incSweeps();
    metrics.incSweeps();
    expect(metrics.snapshot().sweeps).toBe(3);
  });

  it('incOrphans() defaults to +1 per call', () => {
    const metrics = createReconcilerMetrics(mockLogger());
    metrics.incOrphans();
    expect(metrics.snapshot().orphans).toBe(1);
  });

  it('incMissingRuleGroups() defaults to +1 per call', () => {
    const metrics = createReconcilerMetrics(mockLogger());
    metrics.incMissingRuleGroups();
    metrics.incMissingRuleGroups();
    expect(metrics.snapshot().missingRuleGroups).toBe(2);
  });

  it('incErrors() defaults to +1 per call', () => {
    const metrics = createReconcilerMetrics(mockLogger());
    metrics.incErrors();
    expect(metrics.snapshot().errors).toBe(1);
  });

  it('accepts a custom n and adds exactly that much', () => {
    const metrics = createReconcilerMetrics(mockLogger());
    metrics.incMissingRuleGroups(5);
    metrics.incMissingRuleGroups(2);
    expect(metrics.snapshot().missingRuleGroups).toBe(7);
  });

  it('increments each counter independently', () => {
    const metrics = createReconcilerMetrics(mockLogger());
    metrics.incSweeps(1);
    metrics.incOrphans(2);
    metrics.incMissingRuleGroups(3);
    metrics.incErrors(4);
    expect(metrics.snapshot()).toEqual({
      sweeps: 1,
      orphans: 2,
      missingRuleGroups: 3,
      errors: 4,
      danglingRefs: 0,
      graceDeletions: 0,
      adoptableOrphans: 0,
      unknownOrphans: 0,
    });
  });

  // Phase 4 W4.2 — the detector splits `orphans` into adoptable/unknown buckets;
  // the reconciler bumps these counters in parallel with `orphans` so operators
  // can graph the adoption vs drift split separately.
  it('incAdoptableOrphans() defaults to +1 per call', () => {
    const metrics = createReconcilerMetrics(mockLogger());
    metrics.incAdoptableOrphans();
    metrics.incAdoptableOrphans();
    expect(metrics.snapshot().adoptableOrphans).toBe(2);
  });

  it('incUnknownOrphans() defaults to +1 per call', () => {
    const metrics = createReconcilerMetrics(mockLogger());
    metrics.incUnknownOrphans();
    expect(metrics.snapshot().unknownOrphans).toBe(1);
  });

  it('incAdoptableOrphans / incUnknownOrphans accept custom n', () => {
    const metrics = createReconcilerMetrics(mockLogger());
    metrics.incAdoptableOrphans(3);
    metrics.incUnknownOrphans(7);
    expect(metrics.snapshot().adoptableOrphans).toBe(3);
    expect(metrics.snapshot().unknownOrphans).toBe(7);
  });

  it('treats n=0 as a no-op but still emits a debug log', () => {
    const logger = mockLogger();
    const metrics = createReconcilerMetrics(logger);
    metrics.incSweeps(0);
    expect(metrics.snapshot().sweeps).toBe(0);
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('sweeps incremented to 0'));
  });
});

describe('ReconcilerMetrics — snapshot is frozen', () => {
  it('returns a frozen object', () => {
    const metrics = createReconcilerMetrics(mockLogger());
    metrics.incSweeps(1);
    const snap = metrics.snapshot();
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it('mutating the returned snapshot does not affect subsequent snapshots', () => {
    const metrics = createReconcilerMetrics(mockLogger());
    metrics.incOrphans(4);
    const snap = metrics.snapshot();

    // Attempt to mutate. In strict mode this throws; in sloppy mode it's a
    // silent no-op. Either way the internal state must remain intact, so we
    // wrap the assignment in a try/catch and assert on the post-condition.
    try {
      (snap as { orphans: number }).orphans = 999;
    } catch {
      /* strict-mode TypeError is expected; still verify internals below */
    }

    metrics.incOrphans(1);
    expect(metrics.snapshot().orphans).toBe(5);
  });

  it('returns a fresh object on each call (not a shared reference)', () => {
    const metrics = createReconcilerMetrics(mockLogger());
    metrics.incErrors(1);
    const a = metrics.snapshot();
    const b = metrics.snapshot();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('ReconcilerMetrics — reset', () => {
  it('zeros every counter', () => {
    const metrics = createReconcilerMetrics(mockLogger());
    metrics.incSweeps(10);
    metrics.incOrphans(20);
    metrics.incMissingRuleGroups(30);
    metrics.incErrors(40);
    metrics.incAdoptableOrphans(50);
    metrics.incUnknownOrphans(60);

    metrics.reset();

    expect(metrics.snapshot()).toEqual({
      sweeps: 0,
      orphans: 0,
      missingRuleGroups: 0,
      errors: 0,
      danglingRefs: 0,
      graceDeletions: 0,
      adoptableOrphans: 0,
      unknownOrphans: 0,
    });
  });

  it('subsequent increments accumulate from zero after reset', () => {
    const metrics = createReconcilerMetrics(mockLogger());
    metrics.incSweeps(99);
    metrics.reset();
    metrics.incSweeps();
    expect(metrics.snapshot().sweeps).toBe(1);
  });

  it('reset on a never-used instance is a no-op', () => {
    const metrics = createReconcilerMetrics(mockLogger());
    expect(() => metrics.reset()).not.toThrow();
    expect(metrics.snapshot()).toEqual({
      sweeps: 0,
      orphans: 0,
      missingRuleGroups: 0,
      errors: 0,
      danglingRefs: 0,
      graceDeletions: 0,
      adoptableOrphans: 0,
      unknownOrphans: 0,
    });
  });
});

describe('ReconcilerMetrics — negative-n clamping', () => {
  it('clamps a negative n to 0 rather than throwing', () => {
    const metrics = createReconcilerMetrics(mockLogger());
    metrics.incSweeps(3);
    expect(() => metrics.incSweeps(-5)).not.toThrow();
    expect(metrics.snapshot().sweeps).toBe(3);
  });

  it('logs the clamp event at debug with the counter name and the requested value', () => {
    const logger = mockLogger();
    const metrics = createReconcilerMetrics(logger);
    metrics.incMissingRuleGroups(-7);

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringMatching(
        /negative increment clamped to 0.*counter=missingRuleGroups.*requested=-7/
      )
    );
    // A clamped increment must not emit warn/error — the plan says this
    // is a programmer-error diagnostic, not an operational alarm.
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not cross-contaminate other counters on clamped input', () => {
    const metrics = createReconcilerMetrics(mockLogger());
    metrics.incOrphans(2);
    metrics.incErrors(-1);
    expect(metrics.snapshot()).toEqual({
      sweeps: 0,
      orphans: 2,
      missingRuleGroups: 0,
      errors: 0,
      danglingRefs: 0,
      graceDeletions: 0,
      adoptableOrphans: 0,
      unknownOrphans: 0,
    });
  });

  it('clamps negative incAdoptableOrphans / incUnknownOrphans', () => {
    const logger = mockLogger();
    const metrics = createReconcilerMetrics(logger);
    metrics.incAdoptableOrphans(-2);
    metrics.incUnknownOrphans(-3);
    expect(metrics.snapshot().adoptableOrphans).toBe(0);
    expect(metrics.snapshot().unknownOrphans).toBe(0);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringMatching(/negative increment clamped to 0.*counter=adoptableOrphans/)
    );
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringMatching(/negative increment clamped to 0.*counter=unknownOrphans/)
    );
  });
});

describe('ReconcilerMetrics — debug logging on every increment', () => {
  it('emits a debug log with counter name and new total for each counter', () => {
    const logger = mockLogger();
    const metrics = createReconcilerMetrics(logger);

    metrics.incSweeps();
    expect(logger.debug).toHaveBeenCalledWith('ReconcilerMetrics: sweeps incremented to 1');

    metrics.incOrphans(3);
    expect(logger.debug).toHaveBeenCalledWith('ReconcilerMetrics: orphans incremented to 3');

    metrics.incMissingRuleGroups(2);
    expect(logger.debug).toHaveBeenCalledWith(
      'ReconcilerMetrics: missingRuleGroups incremented to 2'
    );

    metrics.incErrors();
    expect(logger.debug).toHaveBeenCalledWith('ReconcilerMetrics: errors incremented to 1');
  });

  it('log reflects the running total, not the delta', () => {
    const logger = mockLogger();
    const metrics = createReconcilerMetrics(logger);
    metrics.incSweeps(2);
    metrics.incSweeps(3);

    // Second call's log must show 5 (cumulative), not 3 (delta).
    expect(logger.debug).toHaveBeenLastCalledWith('ReconcilerMetrics: sweeps incremented to 5');
  });

  it('emits exactly one debug log per non-negative increment', () => {
    const logger = mockLogger();
    const metrics = createReconcilerMetrics(logger);
    metrics.incSweeps();
    metrics.incOrphans();
    expect(logger.debug).toHaveBeenCalledTimes(2);
  });

  it('emits two debug logs on a clamped negative increment (clamp notice + final total)', () => {
    const logger = mockLogger();
    const metrics = createReconcilerMetrics(logger);
    metrics.incSweeps(-1);
    expect(logger.debug).toHaveBeenCalledTimes(2);
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the shared time-range helpers.
 *
 * `@elastic/datemath` anchors `"now"` to the real clock, so each
 * `parseDateMath*` test pins `Date.now()` via `jest.useFakeTimers()` to keep
 * assertions stable.
 *
 * Timezone robustness: datemath delegates rounding (`/d`, `/h`, etc.) to
 * `moment`, and `moment().startOf('day')` rounds relative to the process's
 * local timezone — NOT UTC. `jest.config.js` sets `process.env.TZ = 'UTC'`
 * globally for this repo, but we also compute expected values via `moment`
 * itself in the rounding tests rather than hard-coding `Date.UTC(...)`
 * constants. This way the tests stay green even if the TZ-setter fires
 * after datemath has already cached moment's locale.
 */
// Set TZ=UTC before any imports that reach `moment` / `@elastic/datemath`.
// Jest runs setupFiles before test modules load, but being explicit here is
// belt-and-suspenders — some environments load `moment` from cached lazy
// imports in other test modules.
process.env.TZ = 'UTC';

import moment from 'moment';
import {
  parseDateMath,
  parseDateMathMs,
  dateMathToDSLString,
  computeStep,
  validateDateMath,
  validateTimeRangeQuery,
} from '../time_range';

describe('time_range helpers', () => {
  // Use a stable "now" so `now-1h`, `now`, etc. resolve deterministically.
  // 2024-01-15T12:00:00.000Z
  const FIXED_NOW_MS = 1705320000000;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(FIXED_NOW_MS));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // =========================================================================
  // parseDateMath / parseDateMathMs
  // =========================================================================

  describe('parseDateMath', () => {
    it('parses "now" at the fixed system time (epoch seconds)', () => {
      expect(parseDateMath('now', false)).toBe(Math.floor(FIXED_NOW_MS / 1000));
    });

    it('parses "now-1h" to one hour before now', () => {
      expect(parseDateMath('now-1h', false)).toBe(Math.floor((FIXED_NOW_MS - 3600_000) / 1000));
    });

    it('parses an absolute ISO timestamp', () => {
      const iso = '2024-06-01T00:00:00.000Z';
      expect(parseDateMath(iso, false)).toBe(Math.floor(new Date(iso).getTime() / 1000));
    });

    it('roundUp=false floors "now/d" to start-of-day (isEndTime=false)', () => {
      const start = parseDateMathMs('now/d', /* isEndTime */ false);
      // Datemath delegates `/d` rounding to moment's `startOf('day')`, which
      // is TZ-dependent. Compute the same value via moment so the assertion
      // holds regardless of process TZ.
      expect(start).toBe(moment(FIXED_NOW_MS).startOf('day').valueOf());
    });

    it('roundUp=true ceils "now/d" to end-of-day (isEndTime=true)', () => {
      const end = parseDateMathMs('now/d', /* isEndTime */ true);
      expect(end).toBe(moment(FIXED_NOW_MS).endOf('day').valueOf());
    });

    it('throws on a malformed expression', () => {
      expect(() => parseDateMath('not-a-date', false)).toThrow(/Invalid date-math/);
      expect(() => parseDateMathMs('', true)).toThrow();
    });
  });

  // =========================================================================
  // dateMathToDSLString
  // =========================================================================

  describe('dateMathToDSLString', () => {
    it('is a pass-through for valid expressions', () => {
      expect(dateMathToDSLString('now-1h')).toBe('now-1h');
      expect(dateMathToDSLString('2024-06-01T00:00:00Z')).toBe('2024-06-01T00:00:00Z');
    });
  });

  // =========================================================================
  // computeStep
  // =========================================================================

  describe('computeStep', () => {
    // Representative windows: 5m, 1h, 24h, 7d, 30d.

    it('5m window ⇒ 15s floor (point-based < 15)', () => {
      // span = 300s, 300/500 = 0.6 → 0 → clamped to 15.
      const start = 0;
      const end = 5 * 60;
      expect(computeStep(start, end)).toBe(15);
    });

    it('1h window ⇒ 15s (exactly the floor)', () => {
      // span = 3600s, 3600/500 = 7.2 → 7 → clamped to 15.
      const start = 0;
      const end = 60 * 60;
      expect(computeStep(start, end)).toBe(15);
    });

    it('24h window ⇒ floor(86400/500) = 172s', () => {
      const start = 0;
      const end = 24 * 3600;
      expect(computeStep(start, end)).toBe(172);
    });

    it('7d window ⇒ capped at 300s ceiling', () => {
      // span = 604800s, /500 = 1209.6 → 1209 → clamped to 300.
      const start = 0;
      const end = 7 * 24 * 3600;
      expect(computeStep(start, end)).toBe(300);
    });

    it('30d window ⇒ capped at 300s ceiling', () => {
      const start = 0;
      const end = 30 * 24 * 3600;
      expect(computeStep(start, end)).toBe(300);
    });

    it('zero-length window ⇒ 15s floor (no divide-by-zero)', () => {
      expect(computeStep(100, 100)).toBe(15);
    });

    it('negative (inverted) window treated as zero span ⇒ 15s floor', () => {
      expect(computeStep(200, 100)).toBe(15);
    });
  });

  // =========================================================================
  // validateDateMath
  // =========================================================================

  describe('validateDateMath', () => {
    it.each([['now'], ['now-1h'], ['now-7d/d'], ['now+5m'], ['2024-06-01T00:00:00Z']])(
      'accepts "%s"',
      (expr) => {
        expect(validateDateMath(expr)).toBe(true);
      }
    );

    it.each([['gibberish'], ['now-'], [''], ['now+notaunit']])('rejects "%s"', (expr) => {
      expect(validateDateMath(expr)).toBe(false);
    });

    it('rejects non-string input', () => {
      // Route-layer validators may get garbage; guard explicitly.
      expect(validateDateMath((null as unknown) as string)).toBe(false);
      expect(validateDateMath((123 as unknown) as string)).toBe(false);
    });
  });

  // =========================================================================
  // validateTimeRangeQuery — cross-field rules (one-sided + inverted)
  // =========================================================================

  describe('validateTimeRangeQuery', () => {
    it('accepts both absent (legacy no-range path)', () => {
      expect(validateTimeRangeQuery({})).toBeUndefined();
    });

    it('accepts both present and well-ordered', () => {
      expect(validateTimeRangeQuery({ startTime: 'now-1h', endTime: 'now' })).toBeUndefined();
    });

    it('rejects startTime without endTime', () => {
      expect(validateTimeRangeQuery({ startTime: 'now-1h' })).toMatch(/supplied together/);
    });

    it('rejects endTime without startTime', () => {
      expect(validateTimeRangeQuery({ endTime: 'now' })).toMatch(/supplied together/);
    });

    it('rejects inverted ranges', () => {
      expect(validateTimeRangeQuery({ startTime: 'now', endTime: 'now-1h' })).toMatch(
        /on or after/
      );
    });

    it('allows equal bounds (zero-length window)', () => {
      expect(validateTimeRangeQuery({ startTime: 'now', endTime: 'now' })).toBeUndefined();
    });

    it('silently accepts malformed input (per-field validator handles it)', () => {
      // Malformed inputs are rejected upstream by `validateDateMath`; the
      // cross-field validator stays silent on them so we don't double-report.
      expect(validateTimeRangeQuery({ startTime: 'gibberish', endTime: 'now' })).toBeUndefined();
    });
  });
});

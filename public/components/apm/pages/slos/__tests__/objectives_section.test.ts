/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Allowed-downtime formatter sanity. The formatter is the visible
 * "99.9% over 28d → 40m 20s of error budget" preview — getting it wrong
 * pushes users towards picking targets without seeing the actual budget.
 */

import { formatAllowedDowntime } from '../objectives_section';

describe('formatAllowedDowntime', () => {
  it('renders the two-largest non-zero units', () => {
    expect(formatAllowedDowntime(2 * 86_400_000 + 3 * 3_600_000)).toBe('2d 3h');
    expect(formatAllowedDowntime(83 * 60_000 + 19_000)).toBe('1h 23m');
    expect(formatAllowedDowntime(60_000 + 5_000)).toBe('1m 5s');
  });

  it('drops zero-valued leading units', () => {
    expect(formatAllowedDowntime(45_000)).toBe('45s');
    expect(formatAllowedDowntime(60_000)).toBe('1m');
  });

  it('renders 0s for zero or sub-second durations', () => {
    expect(formatAllowedDowntime(0)).toBe('0s');
    expect(formatAllowedDowntime(400)).toBe('0s');
  });

  it('returns empty string for invalid inputs (no NaN%, no negatives)', () => {
    expect(formatAllowedDowntime(NaN)).toBe('');
    expect(formatAllowedDowntime(-1)).toBe('');
    expect(formatAllowedDowntime(Infinity)).toBe('');
  });

  it("rounds the ms→sec boundary so IEEE-754 noise doesn't flip the seconds digit", () => {
    // 99.9% over 30d. Without rounding, `Math.floor` would tick this back to
    // 43m 11s (one second short).
    const ms = (1 - 99.9 / 100) * 30 * 86_400_000;
    expect(formatAllowedDowntime(ms)).toBe('43m 12s');
  });

  it('preserves seconds precision for tight targets (the cases most worth scrutinizing)', () => {
    // 99.99% over 28d → 4m 1.92s of budget. Round to 4m 2s.
    const ms = (1 - 99.99 / 100) * 28 * 86_400_000;
    expect(formatAllowedDowntime(ms)).toBe('4m 2s');
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { calculateStep, RESOLUTION_LOW, RESOLUTION_MEDIUM } from '../step_utils';

describe('step_utils', () => {
  describe('calculateStep', () => {
    const now = 1700000000; // Fixed reference time in seconds

    it('returns minimum step for very short time ranges', () => {
      // 1 minute range: raw interval = 60000ms / 258 ≈ 232ms → rounds to 200ms → 0.2s → clamped to 15s
      const step = calculateStep(now, now + 60, RESOLUTION_MEDIUM);
      expect(step).toBe(15);
    });

    it('calculates step for 1h range with medium resolution', () => {
      // 1h = 3600s → durationMs = 3,600,000 → raw = 3600000/258 ≈ 13953ms → rounds to 20000ms → 20s
      const step = calculateStep(now, now + 3600, RESOLUTION_MEDIUM);
      expect(step).toBe(20);
    });

    it('calculates step for 1h range with low resolution', () => {
      // 1h = 3600s → durationMs = 3,600,000 → raw = 3600000/101 ≈ 35643ms → rounds to 50000ms → 50s
      const step = calculateStep(now, now + 3600, RESOLUTION_LOW);
      expect(step).toBe(50);
    });

    it('calculates step for 24h range with medium resolution', () => {
      // 24h = 86400s → durationMs = 86,400,000 → raw = 86400000/258 ≈ 334884ms → rounds to 500000ms → 500s
      const step = calculateStep(now, now + 86400, RESOLUTION_MEDIUM);
      expect(step).toBeGreaterThan(15);
    });

    it('calculates step for 24h range with low resolution', () => {
      // 24h = 86400s → durationMs = 86,400,000 → raw = 86400000/101 ≈ 855445ms → rounds to 1000000ms → 1000s
      const step = calculateStep(now, now + 86400, RESOLUTION_LOW);
      expect(step).toBeGreaterThan(calculateStep(now, now + 86400, RESOLUTION_MEDIUM));
    });

    it('calculates step for 7d range with medium resolution', () => {
      const sevenDays = 7 * 86400;
      const step = calculateStep(now, now + sevenDays, RESOLUTION_MEDIUM);
      expect(step).toBeGreaterThan(15);
    });

    it('uses default resolution (MEDIUM) when not specified', () => {
      const step = calculateStep(now, now + 86400);
      expect(step).toBe(calculateStep(now, now + 86400, RESOLUTION_MEDIUM));
    });

    it('respects custom minimum interval', () => {
      // Very short range with custom min of 60s
      const step = calculateStep(now, now + 60, RESOLUTION_MEDIUM, 60);
      expect(step).toBe(60);
    });

    it('low resolution always produces larger or equal step than medium', () => {
      const ranges = [3600, 86400, 7 * 86400, 30 * 86400];
      ranges.forEach((range) => {
        const lowStep = calculateStep(now, now + range, RESOLUTION_LOW);
        const medStep = calculateStep(now, now + range, RESOLUTION_MEDIUM);
        expect(lowStep).toBeGreaterThanOrEqual(medStep);
      });
    });
  });

  describe('resolution constants', () => {
    it('RESOLUTION_LOW is 101', () => {
      expect(RESOLUTION_LOW).toBe(101);
    });

    it('RESOLUTION_MEDIUM is 258', () => {
      expect(RESOLUTION_MEDIUM).toBe(258);
    });
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  formatCount,
  formatPercentage,
  formatPercentageValue,
  formatLatency,
  formatLatencyFromSeconds,
} from '../format_utils';

describe('format_utils', () => {
  describe('formatCount', () => {
    it('returns "-" for undefined', () => {
      expect(formatCount(undefined)).toBe('-');
    });

    it('returns "-" for NaN', () => {
      expect(formatCount(NaN)).toBe('-');
    });

    it('formats millions with 1 decimal', () => {
      expect(formatCount(1500000)).toBe('1.5M');
      expect(formatCount(1000000)).toBe('1.0M');
      expect(formatCount(2500000)).toBe('2.5M');
    });

    it('formats thousands with 1 decimal', () => {
      expect(formatCount(1500)).toBe('1.5K');
      expect(formatCount(1000)).toBe('1.0K');
      expect(formatCount(2500)).toBe('2.5K');
    });

    it('formats small numbers without suffix', () => {
      expect(formatCount(500)).toBe('500');
      expect(formatCount(999)).toBe('999');
      expect(formatCount(0)).toBe('0');
    });

    it('handles edge cases at boundaries', () => {
      expect(formatCount(999999)).toBe('1000.0K');
      expect(formatCount(1000001)).toBe('1.0M');
    });
  });

  describe('formatPercentage', () => {
    it('returns "-" for undefined', () => {
      expect(formatPercentage(undefined)).toBe('-');
    });

    it('returns "-" for NaN', () => {
      expect(formatPercentage(NaN)).toBe('-');
    });

    it('formats with 1 decimal place', () => {
      // Note: 50.55 rounds to 50.5 due to floating point representation
      expect(formatPercentage(50.56)).toBe('50.6%');
      expect(formatPercentage(50.54)).toBe('50.5%');
      expect(formatPercentage(0)).toBe('0.0%');
      expect(formatPercentage(100)).toBe('100.0%');
    });

    it('ignores second parameter (for ECharts axis formatter compatibility)', () => {
      // The second parameter is ignored to prevent ECharts from passing tick index as decimals
      expect(formatPercentage(50.56, 5)).toBe('50.6%');
    });
  });

  describe('formatPercentageValue', () => {
    it('returns "-" for undefined', () => {
      expect(formatPercentageValue(undefined)).toBe('-');
    });

    it('returns "-" for NaN', () => {
      expect(formatPercentageValue(NaN)).toBe('-');
    });

    it('formats with 2 decimal places for precision', () => {
      // Note: 50.555 rounds to 50.55 due to floating point representation
      expect(formatPercentageValue(50.556)).toBe('50.56%');
      expect(formatPercentageValue(50.554)).toBe('50.55%');
      expect(formatPercentageValue(0)).toBe('0.00%');
      expect(formatPercentageValue(99.999)).toBe('100.00%');
    });
  });

  describe('formatLatency', () => {
    it('returns "-" for undefined', () => {
      expect(formatLatency(undefined)).toBe('-');
    });

    it('returns "-" for NaN', () => {
      expect(formatLatency(NaN)).toBe('-');
    });

    it('formats as seconds for >= 1000ms', () => {
      expect(formatLatency(1500)).toBe('1.50s');
      expect(formatLatency(1000)).toBe('1.00s');
      expect(formatLatency(2500)).toBe('2.50s');
    });

    it('formats as milliseconds for < 1000ms', () => {
      expect(formatLatency(500)).toBe('500 ms');
      expect(formatLatency(999)).toBe('999 ms');
      expect(formatLatency(0)).toBe('0 ms');
    });

    it('handles edge cases at 1000ms boundary', () => {
      expect(formatLatency(999)).toBe('999 ms');
      expect(formatLatency(1000)).toBe('1.00s');
    });
  });

  describe('formatLatencyFromSeconds', () => {
    it('returns "-" for undefined', () => {
      expect(formatLatencyFromSeconds(undefined)).toBe('-');
    });

    it('returns "-" for NaN', () => {
      expect(formatLatencyFromSeconds(NaN)).toBe('-');
    });

    it('converts from seconds and formats >= 1s as seconds', () => {
      expect(formatLatencyFromSeconds(1.5)).toBe('1.50s');
      expect(formatLatencyFromSeconds(1)).toBe('1.00s');
      expect(formatLatencyFromSeconds(2.5)).toBe('2.50s');
    });

    it('converts from seconds and formats < 1s as milliseconds', () => {
      expect(formatLatencyFromSeconds(0.5)).toBe('500 ms');
      expect(formatLatencyFromSeconds(0.999)).toBe('999 ms');
      expect(formatLatencyFromSeconds(0)).toBe('0 ms');
    });

    it('handles edge cases at 1s boundary', () => {
      expect(formatLatencyFromSeconds(0.999)).toBe('999 ms');
      expect(formatLatencyFromSeconds(1)).toBe('1.00s');
    });
  });
});

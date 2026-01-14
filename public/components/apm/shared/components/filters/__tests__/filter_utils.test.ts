/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FAILURE_RATE_THRESHOLDS,
  getThresholdColor,
  matchesFailureRateThreshold,
  matchesAnyFailureRateThreshold,
} from '../filter_utils';

describe('filter_utils', () => {
  describe('FAILURE_RATE_THRESHOLDS', () => {
    it('should have correct threshold values', () => {
      expect(FAILURE_RATE_THRESHOLDS).toEqual(['< 1%', '1-5%', '> 5%']);
    });
  });

  describe('getThresholdColor', () => {
    it('should return danger color for > 5%', () => {
      expect(getThresholdColor('> 5%')).toBe('#BD271E');
    });

    it('should return warning color for 1-5%', () => {
      expect(getThresholdColor('1-5%')).toBe('#F5A700');
    });

    it('should return success color for < 1%', () => {
      expect(getThresholdColor('< 1%')).toBe('#017D73');
    });

    it('should return subdued gray for unknown threshold', () => {
      expect(getThresholdColor('unknown')).toBe('#69707D');
    });

    it('should return subdued gray for empty string', () => {
      expect(getThresholdColor('')).toBe('#69707D');
    });
  });

  describe('matchesFailureRateThreshold', () => {
    describe('< 1% threshold', () => {
      it('should return true for 0%', () => {
        expect(matchesFailureRateThreshold(0, '< 1%')).toBe(true);
      });

      it('should return true for 0.5%', () => {
        expect(matchesFailureRateThreshold(0.5, '< 1%')).toBe(true);
      });

      it('should return true for 0.99%', () => {
        expect(matchesFailureRateThreshold(0.99, '< 1%')).toBe(true);
      });

      it('should return false for exactly 1%', () => {
        expect(matchesFailureRateThreshold(1, '< 1%')).toBe(false);
      });

      it('should return false for 5%', () => {
        expect(matchesFailureRateThreshold(5, '< 1%')).toBe(false);
      });
    });

    describe('1-5% threshold', () => {
      it('should return false for 0.99%', () => {
        expect(matchesFailureRateThreshold(0.99, '1-5%')).toBe(false);
      });

      it('should return true for exactly 1%', () => {
        expect(matchesFailureRateThreshold(1, '1-5%')).toBe(true);
      });

      it('should return true for 3%', () => {
        expect(matchesFailureRateThreshold(3, '1-5%')).toBe(true);
      });

      it('should return true for exactly 5%', () => {
        expect(matchesFailureRateThreshold(5, '1-5%')).toBe(true);
      });

      it('should return false for 5.01%', () => {
        expect(matchesFailureRateThreshold(5.01, '1-5%')).toBe(false);
      });
    });

    describe('> 5% threshold', () => {
      it('should return false for exactly 5%', () => {
        expect(matchesFailureRateThreshold(5, '> 5%')).toBe(false);
      });

      it('should return true for 5.01%', () => {
        expect(matchesFailureRateThreshold(5.01, '> 5%')).toBe(true);
      });

      it('should return true for 10%', () => {
        expect(matchesFailureRateThreshold(10, '> 5%')).toBe(true);
      });

      it('should return true for 100%', () => {
        expect(matchesFailureRateThreshold(100, '> 5%')).toBe(true);
      });
    });

    describe('invalid threshold', () => {
      it('should return false for unknown threshold', () => {
        expect(matchesFailureRateThreshold(5, 'unknown' as '< 1%' | '1-5%' | '> 5%')).toBe(false);
      });
    });
  });

  describe('matchesAnyFailureRateThreshold', () => {
    it('should return true when no thresholds selected (show all)', () => {
      expect(matchesAnyFailureRateThreshold(0, [])).toBe(true);
      expect(matchesAnyFailureRateThreshold(3, [])).toBe(true);
      expect(matchesAnyFailureRateThreshold(10, [])).toBe(true);
    });

    it('should return true when matches single selected threshold', () => {
      expect(matchesAnyFailureRateThreshold(0.5, ['< 1%'])).toBe(true);
      expect(matchesAnyFailureRateThreshold(3, ['1-5%'])).toBe(true);
      expect(matchesAnyFailureRateThreshold(10, ['> 5%'])).toBe(true);
    });

    it('should return false when does not match single selected threshold', () => {
      expect(matchesAnyFailureRateThreshold(3, ['< 1%'])).toBe(false);
      expect(matchesAnyFailureRateThreshold(0.5, ['1-5%'])).toBe(false);
      expect(matchesAnyFailureRateThreshold(3, ['> 5%'])).toBe(false);
    });

    it('should return true when matches any of multiple thresholds (OR logic)', () => {
      // 0.5% matches '< 1%'
      expect(matchesAnyFailureRateThreshold(0.5, ['< 1%', '> 5%'])).toBe(true);

      // 10% matches '> 5%'
      expect(matchesAnyFailureRateThreshold(10, ['< 1%', '> 5%'])).toBe(true);

      // 3% matches '1-5%'
      expect(matchesAnyFailureRateThreshold(3, ['< 1%', '1-5%', '> 5%'])).toBe(true);
    });

    it('should return false when does not match any of multiple thresholds', () => {
      // 3% does not match '< 1%' or '> 5%'
      expect(matchesAnyFailureRateThreshold(3, ['< 1%', '> 5%'])).toBe(false);
    });

    it('should handle edge cases at threshold boundaries', () => {
      // Exactly 1% - only matches '1-5%'
      expect(matchesAnyFailureRateThreshold(1, ['< 1%'])).toBe(false);
      expect(matchesAnyFailureRateThreshold(1, ['1-5%'])).toBe(true);

      // Exactly 5% - only matches '1-5%'
      expect(matchesAnyFailureRateThreshold(5, ['> 5%'])).toBe(false);
      expect(matchesAnyFailureRateThreshold(5, ['1-5%'])).toBe(true);
    });
  });
});

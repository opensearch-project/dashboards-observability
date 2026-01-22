/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FAILURE_RATE_THRESHOLDS,
  AVAILABILITY_THRESHOLDS,
  getThemeAwareThresholdColor,
  matchesFailureRateThreshold,
  matchesAnyFailureRateThreshold,
} from '../filter_utils';

// Mock euiThemeVars for testing
jest.mock('@osd/ui-shared-deps/theme', () => ({
  euiThemeVars: {
    euiColorDanger: '#FF0000',
    euiColorWarning: '#FFFF00',
    euiColorSuccess: '#00FF00',
    euiColorMediumShade: '#888888',
  },
}));

describe('filter_utils', () => {
  describe('FAILURE_RATE_THRESHOLDS', () => {
    it('should have correct threshold values', () => {
      expect(FAILURE_RATE_THRESHOLDS).toEqual(['< 1%', '1-5%', '> 5%']);
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

  describe('AVAILABILITY_THRESHOLDS', () => {
    it('should have correct threshold values', () => {
      expect(AVAILABILITY_THRESHOLDS).toEqual(['< 95%', '95-99%', '≥ 99%']);
    });
  });

  describe('getThemeAwareThresholdColor', () => {
    describe('availability thresholds', () => {
      it('should return danger color for < 95%', () => {
        expect(getThemeAwareThresholdColor('< 95%', 'availability')).toBe('#FF0000');
      });

      it('should return warning color for 95-99%', () => {
        expect(getThemeAwareThresholdColor('95-99%', 'availability')).toBe('#FFFF00');
      });

      it('should return success color for ≥ 99%', () => {
        expect(getThemeAwareThresholdColor('≥ 99%', 'availability')).toBe('#00FF00');
      });

      it('should return medium shade for unknown threshold', () => {
        expect(getThemeAwareThresholdColor('unknown', 'availability')).toBe('#888888');
      });
    });

    describe('errorRate thresholds', () => {
      it('should return danger color for > 5%', () => {
        expect(getThemeAwareThresholdColor('> 5%', 'errorRate')).toBe('#FF0000');
      });

      it('should return warning color for 1-5%', () => {
        expect(getThemeAwareThresholdColor('1-5%', 'errorRate')).toBe('#FFFF00');
      });

      it('should return success color for < 1%', () => {
        expect(getThemeAwareThresholdColor('< 1%', 'errorRate')).toBe('#00FF00');
      });

      it('should return medium shade for unknown threshold', () => {
        expect(getThemeAwareThresholdColor('unknown', 'errorRate')).toBe('#888888');
      });
    });
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AvailabilityThreshold,
  ErrorRateThreshold,
  THRESHOLD_LABELS,
  AVAILABILITY_THRESHOLD_OPTIONS,
  ERROR_RATE_THRESHOLD_OPTIONS,
  matchesAvailabilityThreshold,
  matchesErrorRateThreshold,
  getThresholdLabel,
  getThemeAwareThresholdColor,
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
  describe('AvailabilityThreshold enum', () => {
    it('should have correct enum values', () => {
      expect(AvailabilityThreshold.LOW).toBe('LOW');
      expect(AvailabilityThreshold.MEDIUM).toBe('MEDIUM');
      expect(AvailabilityThreshold.HIGH).toBe('HIGH');
    });
  });

  describe('ErrorRateThreshold enum', () => {
    it('should have correct enum values', () => {
      expect(ErrorRateThreshold.LOW).toBe('LOW');
      expect(ErrorRateThreshold.MEDIUM).toBe('MEDIUM');
      expect(ErrorRateThreshold.HIGH).toBe('HIGH');
    });
  });

  describe('THRESHOLD_LABELS', () => {
    it('should have correct availability labels', () => {
      expect(THRESHOLD_LABELS.availability[AvailabilityThreshold.LOW]).toBe('< 95%');
      expect(THRESHOLD_LABELS.availability[AvailabilityThreshold.MEDIUM]).toBe('95-99%');
      expect(THRESHOLD_LABELS.availability[AvailabilityThreshold.HIGH]).toBe('≥ 99%');
    });

    it('should have correct error rate labels', () => {
      expect(THRESHOLD_LABELS.errorRate[ErrorRateThreshold.LOW]).toBe('< 1%');
      expect(THRESHOLD_LABELS.errorRate[ErrorRateThreshold.MEDIUM]).toBe('1-5%');
      expect(THRESHOLD_LABELS.errorRate[ErrorRateThreshold.HIGH]).toBe('> 5%');
    });
  });

  describe('AVAILABILITY_THRESHOLD_OPTIONS', () => {
    it('should have correct ordered options', () => {
      expect(AVAILABILITY_THRESHOLD_OPTIONS).toEqual([
        AvailabilityThreshold.LOW,
        AvailabilityThreshold.MEDIUM,
        AvailabilityThreshold.HIGH,
      ]);
    });
  });

  describe('ERROR_RATE_THRESHOLD_OPTIONS', () => {
    it('should have correct ordered options', () => {
      expect(ERROR_RATE_THRESHOLD_OPTIONS).toEqual([
        ErrorRateThreshold.LOW,
        ErrorRateThreshold.MEDIUM,
        ErrorRateThreshold.HIGH,
      ]);
    });
  });

  describe('matchesAvailabilityThreshold', () => {
    describe('LOW threshold (< 95%)', () => {
      it('should return true for 0%', () => {
        expect(matchesAvailabilityThreshold(0, AvailabilityThreshold.LOW)).toBe(true);
      });

      it('should return true for 94%', () => {
        expect(matchesAvailabilityThreshold(94, AvailabilityThreshold.LOW)).toBe(true);
      });

      it('should return true for 94.99%', () => {
        expect(matchesAvailabilityThreshold(94.99, AvailabilityThreshold.LOW)).toBe(true);
      });

      it('should return false for exactly 95%', () => {
        expect(matchesAvailabilityThreshold(95, AvailabilityThreshold.LOW)).toBe(false);
      });

      it('should return false for 99%', () => {
        expect(matchesAvailabilityThreshold(99, AvailabilityThreshold.LOW)).toBe(false);
      });
    });

    describe('MEDIUM threshold (95-99%)', () => {
      it('should return false for 94.99%', () => {
        expect(matchesAvailabilityThreshold(94.99, AvailabilityThreshold.MEDIUM)).toBe(false);
      });

      it('should return true for exactly 95%', () => {
        expect(matchesAvailabilityThreshold(95, AvailabilityThreshold.MEDIUM)).toBe(true);
      });

      it('should return true for 97%', () => {
        expect(matchesAvailabilityThreshold(97, AvailabilityThreshold.MEDIUM)).toBe(true);
      });

      it('should return true for 98.99%', () => {
        expect(matchesAvailabilityThreshold(98.99, AvailabilityThreshold.MEDIUM)).toBe(true);
      });

      it('should return false for exactly 99%', () => {
        expect(matchesAvailabilityThreshold(99, AvailabilityThreshold.MEDIUM)).toBe(false);
      });
    });

    describe('HIGH threshold (≥ 99%)', () => {
      it('should return false for 98.99%', () => {
        expect(matchesAvailabilityThreshold(98.99, AvailabilityThreshold.HIGH)).toBe(false);
      });

      it('should return true for exactly 99%', () => {
        expect(matchesAvailabilityThreshold(99, AvailabilityThreshold.HIGH)).toBe(true);
      });

      it('should return true for 99.9%', () => {
        expect(matchesAvailabilityThreshold(99.9, AvailabilityThreshold.HIGH)).toBe(true);
      });

      it('should return true for 100%', () => {
        expect(matchesAvailabilityThreshold(100, AvailabilityThreshold.HIGH)).toBe(true);
      });
    });

    describe('invalid threshold', () => {
      it('should return false for unknown threshold', () => {
        expect(matchesAvailabilityThreshold(95, 'UNKNOWN' as AvailabilityThreshold)).toBe(false);
      });
    });
  });

  describe('matchesErrorRateThreshold', () => {
    describe('LOW threshold (< 1%)', () => {
      it('should return true for 0%', () => {
        expect(matchesErrorRateThreshold(0, ErrorRateThreshold.LOW)).toBe(true);
      });

      it('should return true for 0.5%', () => {
        expect(matchesErrorRateThreshold(0.5, ErrorRateThreshold.LOW)).toBe(true);
      });

      it('should return true for 0.99%', () => {
        expect(matchesErrorRateThreshold(0.99, ErrorRateThreshold.LOW)).toBe(true);
      });

      it('should return false for exactly 1%', () => {
        expect(matchesErrorRateThreshold(1, ErrorRateThreshold.LOW)).toBe(false);
      });

      it('should return false for 5%', () => {
        expect(matchesErrorRateThreshold(5, ErrorRateThreshold.LOW)).toBe(false);
      });
    });

    describe('MEDIUM threshold (1-5%)', () => {
      it('should return false for 0.99%', () => {
        expect(matchesErrorRateThreshold(0.99, ErrorRateThreshold.MEDIUM)).toBe(false);
      });

      it('should return true for exactly 1%', () => {
        expect(matchesErrorRateThreshold(1, ErrorRateThreshold.MEDIUM)).toBe(true);
      });

      it('should return true for 3%', () => {
        expect(matchesErrorRateThreshold(3, ErrorRateThreshold.MEDIUM)).toBe(true);
      });

      it('should return true for exactly 5%', () => {
        expect(matchesErrorRateThreshold(5, ErrorRateThreshold.MEDIUM)).toBe(true);
      });

      it('should return false for 5.01%', () => {
        expect(matchesErrorRateThreshold(5.01, ErrorRateThreshold.MEDIUM)).toBe(false);
      });
    });

    describe('HIGH threshold (> 5%)', () => {
      it('should return false for exactly 5%', () => {
        expect(matchesErrorRateThreshold(5, ErrorRateThreshold.HIGH)).toBe(false);
      });

      it('should return true for 5.01%', () => {
        expect(matchesErrorRateThreshold(5.01, ErrorRateThreshold.HIGH)).toBe(true);
      });

      it('should return true for 10%', () => {
        expect(matchesErrorRateThreshold(10, ErrorRateThreshold.HIGH)).toBe(true);
      });

      it('should return true for 100%', () => {
        expect(matchesErrorRateThreshold(100, ErrorRateThreshold.HIGH)).toBe(true);
      });
    });

    describe('invalid threshold', () => {
      it('should return false for unknown threshold', () => {
        expect(matchesErrorRateThreshold(5, 'UNKNOWN' as ErrorRateThreshold)).toBe(false);
      });
    });
  });

  describe('getThresholdLabel', () => {
    it('should return correct availability labels', () => {
      expect(getThresholdLabel(AvailabilityThreshold.LOW, 'availability')).toBe('< 95%');
      expect(getThresholdLabel(AvailabilityThreshold.MEDIUM, 'availability')).toBe('95-99%');
      expect(getThresholdLabel(AvailabilityThreshold.HIGH, 'availability')).toBe('≥ 99%');
    });

    it('should return correct error rate labels', () => {
      expect(getThresholdLabel(ErrorRateThreshold.LOW, 'errorRate')).toBe('< 1%');
      expect(getThresholdLabel(ErrorRateThreshold.MEDIUM, 'errorRate')).toBe('1-5%');
      expect(getThresholdLabel(ErrorRateThreshold.HIGH, 'errorRate')).toBe('> 5%');
    });
  });

  describe('getThemeAwareThresholdColor', () => {
    describe('availability thresholds', () => {
      it('should return danger color for LOW', () => {
        expect(getThemeAwareThresholdColor(AvailabilityThreshold.LOW, 'availability')).toBe(
          '#FF0000'
        );
      });

      it('should return warning color for MEDIUM', () => {
        expect(getThemeAwareThresholdColor(AvailabilityThreshold.MEDIUM, 'availability')).toBe(
          '#FFFF00'
        );
      });

      it('should return success color for HIGH', () => {
        expect(getThemeAwareThresholdColor(AvailabilityThreshold.HIGH, 'availability')).toBe(
          '#00FF00'
        );
      });

      it('should return medium shade for unknown threshold', () => {
        expect(
          getThemeAwareThresholdColor('unknown' as AvailabilityThreshold, 'availability')
        ).toBe('#888888');
      });
    });

    describe('errorRate thresholds', () => {
      it('should return success color for LOW', () => {
        expect(getThemeAwareThresholdColor(ErrorRateThreshold.LOW, 'errorRate')).toBe('#00FF00');
      });

      it('should return warning color for MEDIUM', () => {
        expect(getThemeAwareThresholdColor(ErrorRateThreshold.MEDIUM, 'errorRate')).toBe('#FFFF00');
      });

      it('should return danger color for HIGH', () => {
        expect(getThemeAwareThresholdColor(ErrorRateThreshold.HIGH, 'errorRate')).toBe('#FF0000');
      });

      it('should return medium shade for unknown threshold', () => {
        expect(getThemeAwareThresholdColor('unknown' as ErrorRateThreshold, 'errorRate')).toBe(
          '#888888'
        );
      });
    });
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getTimeInSeconds,
  parseTimeRange,
  formatDate,
  calculateTimeRangeDuration,
  getTimeAxisConfig,
} from '../time_utils';

// Mock @elastic/datemath
jest.mock('@elastic/datemath', () => ({
  parse: jest.fn(),
}));

import dateMath from '@elastic/datemath';

describe('time_utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getTimeInSeconds', () => {
    it('should convert Date to Unix timestamp in seconds', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const result = getTimeInSeconds(date);

      expect(result).toBe(Math.floor(date.getTime() / 1000));
    });

    it('should floor milliseconds', () => {
      const date = new Date('2024-01-15T10:30:00.500Z');
      const result = getTimeInSeconds(date);

      // Should floor, not round
      expect(result).toBe(Math.floor(date.getTime() / 1000));
    });

    it('should handle epoch time', () => {
      const date = new Date(0);
      const result = getTimeInSeconds(date);

      expect(result).toBe(0);
    });

    it('should handle current time', () => {
      const now = new Date();
      const result = getTimeInSeconds(now);

      expect(result).toBe(Math.floor(now.getTime() / 1000));
    });
  });

  describe('parseTimeRange', () => {
    it('should parse valid time range', () => {
      const mockStartDate = new Date('2024-01-15T10:00:00.000Z');
      const mockEndDate = new Date('2024-01-15T10:30:00.000Z');

      (dateMath.parse as jest.Mock)
        .mockReturnValueOnce({ toDate: () => mockStartDate })
        .mockReturnValueOnce({ toDate: () => mockEndDate });

      const result = parseTimeRange({ from: 'now-30m', to: 'now' });

      expect(dateMath.parse).toHaveBeenCalledWith('now-30m');
      expect(dateMath.parse).toHaveBeenCalledWith('now', { roundUp: true });
      expect(result.startTime).toEqual(mockStartDate);
      expect(result.endTime).toEqual(mockEndDate);
    });

    it('should throw error for invalid start time', () => {
      (dateMath.parse as jest.Mock).mockReturnValueOnce(null);

      expect(() => parseTimeRange({ from: 'invalid', to: 'now' })).toThrow('Invalid time range');
    });

    it('should throw error for invalid end time', () => {
      const mockStartDate = new Date('2024-01-15T10:00:00.000Z');

      (dateMath.parse as jest.Mock)
        .mockReturnValueOnce({ toDate: () => mockStartDate })
        .mockReturnValueOnce(null);

      expect(() => parseTimeRange({ from: 'now-30m', to: 'invalid' })).toThrow(
        'Invalid time range'
      );
    });

    it('should pass roundUp option for end time', () => {
      const mockStartDate = new Date('2024-01-15T10:00:00.000Z');
      const mockEndDate = new Date('2024-01-15T10:30:00.000Z');

      (dateMath.parse as jest.Mock)
        .mockReturnValueOnce({ toDate: () => mockStartDate })
        .mockReturnValueOnce({ toDate: () => mockEndDate });

      parseTimeRange({ from: 'now-1h', to: 'now' });

      expect(dateMath.parse).toHaveBeenNthCalledWith(2, 'now', { roundUp: true });
    });
  });

  describe('formatDate', () => {
    it('should format date to locale string', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const result = formatDate(date);

      expect(result).toBe(date.toLocaleString());
    });

    it('should handle different dates', () => {
      const date1 = new Date('2023-06-01T00:00:00.000Z');
      const date2 = new Date('2024-12-31T23:59:59.000Z');

      expect(formatDate(date1)).toBe(date1.toLocaleString());
      expect(formatDate(date2)).toBe(date2.toLocaleString());
    });
  });

  describe('calculateTimeRangeDuration', () => {
    describe('positive test cases', () => {
      it('should return minutes for < 60 min range', () => {
        const startTime = new Date('2024-01-15T10:00:00.000Z');
        const endTime = new Date('2024-01-15T10:15:00.000Z'); // 15 minutes

        const result = calculateTimeRangeDuration(startTime, endTime);

        expect(result).toBe('15m');
      });

      it('should return minutes for exactly 60 min', () => {
        const startTime = new Date('2024-01-15T10:00:00.000Z');
        const endTime = new Date('2024-01-15T11:00:00.000Z'); // 60 minutes

        const result = calculateTimeRangeDuration(startTime, endTime);

        expect(result).toBe('60m');
      });

      it('should return hours for 1-24 hour range', () => {
        const startTime = new Date('2024-01-15T10:00:00.000Z');
        const endTime = new Date('2024-01-15T13:00:00.000Z'); // 3 hours

        const result = calculateTimeRangeDuration(startTime, endTime);

        expect(result).toBe('3h');
      });

      it('should return hours for 24 hour range', () => {
        const startTime = new Date('2024-01-15T00:00:00.000Z');
        const endTime = new Date('2024-01-16T00:00:00.000Z'); // 24 hours

        const result = calculateTimeRangeDuration(startTime, endTime);

        expect(result).toBe('24h');
      });

      it('should return days for > 24 hour range', () => {
        const startTime = new Date('2024-01-15T00:00:00.000Z');
        const endTime = new Date('2024-01-18T00:00:00.000Z'); // 3 days

        const result = calculateTimeRangeDuration(startTime, endTime);

        expect(result).toBe('3d');
      });

      it('should return days for 7 day range', () => {
        const startTime = new Date('2024-01-01T00:00:00.000Z');
        const endTime = new Date('2024-01-08T00:00:00.000Z'); // 7 days

        const result = calculateTimeRangeDuration(startTime, endTime);

        expect(result).toBe('7d');
      });
    });

    describe('ceiling behavior', () => {
      it('should ceil minutes for partial minutes', () => {
        const startTime = new Date('2024-01-15T10:00:00.000Z');
        const endTime = new Date('2024-01-15T10:14:30.000Z'); // 14.5 minutes

        const result = calculateTimeRangeDuration(startTime, endTime);

        expect(result).toBe('15m'); // Should ceil to 15
      });

      it('should ceil hours for partial hours', () => {
        const startTime = new Date('2024-01-15T10:00:00.000Z');
        const endTime = new Date('2024-01-15T12:30:00.000Z'); // 2.5 hours

        const result = calculateTimeRangeDuration(startTime, endTime);

        expect(result).toBe('3h'); // Should ceil to 3
      });

      it('should ceil days for partial days', () => {
        const startTime = new Date('2024-01-15T00:00:00.000Z');
        const endTime = new Date('2024-01-17T12:00:00.000Z'); // 2.5 days

        const result = calculateTimeRangeDuration(startTime, endTime);

        expect(result).toBe('3d'); // Should ceil to 3
      });
    });

    describe('edge cases', () => {
      it('should handle 1 minute range', () => {
        const startTime = new Date('2024-01-15T10:00:00.000Z');
        const endTime = new Date('2024-01-15T10:01:00.000Z'); // 1 minute

        const result = calculateTimeRangeDuration(startTime, endTime);

        expect(result).toBe('1m');
      });

      it('should handle transition from minutes to hours', () => {
        const startTime = new Date('2024-01-15T10:00:00.000Z');
        const endTime = new Date('2024-01-15T11:01:00.000Z'); // 61 minutes

        const result = calculateTimeRangeDuration(startTime, endTime);

        expect(result).toBe('2h'); // 61 min = 1.017h, ceil to 2h
      });

      it('should handle transition from hours to days', () => {
        const startTime = new Date('2024-01-15T00:00:00.000Z');
        const endTime = new Date('2024-01-16T01:00:00.000Z'); // 25 hours

        const result = calculateTimeRangeDuration(startTime, endTime);

        expect(result).toBe('2d'); // 25h = 1.04d, ceil to 2d
      });
    });
  });

  describe('getTimeAxisConfig', () => {
    const MINUTE_MS = 60 * 1000;
    const HOUR_MS = 60 * MINUTE_MS;
    const DAY_MS = 24 * HOUR_MS;

    describe('positive test cases', () => {
      it('should return 1 min interval and HH:mm format for < 15 min range', () => {
        const startTime = new Date('2024-01-15T10:00:00.000Z');
        const endTime = new Date('2024-01-15T10:10:00.000Z'); // 10 minutes

        const result = getTimeAxisConfig(startTime, endTime);

        expect(result.minInterval).toBe(MINUTE_MS);
        expect(result.labelFormat).toBe('{HH}:{mm}');
      });

      it('should return 5 min interval and HH:mm format for 15 min - 1 hour range', () => {
        const startTime = new Date('2024-01-15T10:00:00.000Z');
        const endTime = new Date('2024-01-15T10:30:00.000Z'); // 30 minutes

        const result = getTimeAxisConfig(startTime, endTime);

        expect(result.minInterval).toBe(5 * MINUTE_MS);
        expect(result.labelFormat).toBe('{HH}:{mm}');
      });

      it('should return 30 min interval and HH:mm format for 1-6 hour range', () => {
        const startTime = new Date('2024-01-15T10:00:00.000Z');
        const endTime = new Date('2024-01-15T13:00:00.000Z'); // 3 hours

        const result = getTimeAxisConfig(startTime, endTime);

        expect(result.minInterval).toBe(30 * MINUTE_MS);
        expect(result.labelFormat).toBe('{HH}:{mm}');
      });

      it('should return 2 hour interval and HH:mm format for 6-24 hour range', () => {
        const startTime = new Date('2024-01-15T00:00:00.000Z');
        const endTime = new Date('2024-01-15T12:00:00.000Z'); // 12 hours

        const result = getTimeAxisConfig(startTime, endTime);

        expect(result.minInterval).toBe(2 * HOUR_MS);
        expect(result.labelFormat).toBe('{HH}:{mm}');
      });

      it('should return 6 hour interval and MMM DD HH:mm format for 1-7 day range', () => {
        const startTime = new Date('2024-01-15T00:00:00.000Z');
        const endTime = new Date('2024-01-18T00:00:00.000Z'); // 3 days

        const result = getTimeAxisConfig(startTime, endTime);

        expect(result.minInterval).toBe(6 * HOUR_MS);
        expect(result.labelFormat).toBe('{MMM} {dd} {HH}:{mm}');
      });

      it('should return 1 day interval and MMM DD format for > 7 day range', () => {
        const startTime = new Date('2024-01-01T00:00:00.000Z');
        const endTime = new Date('2024-01-15T00:00:00.000Z'); // 14 days

        const result = getTimeAxisConfig(startTime, endTime);

        expect(result.minInterval).toBe(DAY_MS);
        expect(result.labelFormat).toBe('{MMM} {dd}');
      });
    });

    describe('boundary test cases', () => {
      it('should return 1 min interval at exactly 14 minutes', () => {
        const startTime = new Date('2024-01-15T10:00:00.000Z');
        const endTime = new Date('2024-01-15T10:14:00.000Z'); // 14 minutes

        const result = getTimeAxisConfig(startTime, endTime);

        expect(result.minInterval).toBe(MINUTE_MS);
        expect(result.labelFormat).toBe('{HH}:{mm}');
      });

      it('should return 5 min interval at exactly 15 minutes', () => {
        const startTime = new Date('2024-01-15T10:00:00.000Z');
        const endTime = new Date('2024-01-15T10:15:00.000Z'); // 15 minutes

        const result = getTimeAxisConfig(startTime, endTime);

        expect(result.minInterval).toBe(5 * MINUTE_MS);
        expect(result.labelFormat).toBe('{HH}:{mm}');
      });

      it('should return HH:mm format at exactly 59 minutes', () => {
        const startTime = new Date('2024-01-15T10:00:00.000Z');
        const endTime = new Date('2024-01-15T10:59:00.000Z'); // 59 minutes

        const result = getTimeAxisConfig(startTime, endTime);

        expect(result.minInterval).toBe(5 * MINUTE_MS);
        expect(result.labelFormat).toBe('{HH}:{mm}');
      });

      it('should return HH:mm format at exactly 1 hour', () => {
        const startTime = new Date('2024-01-15T10:00:00.000Z');
        const endTime = new Date('2024-01-15T11:00:00.000Z'); // 1 hour

        const result = getTimeAxisConfig(startTime, endTime);

        expect(result.minInterval).toBe(30 * MINUTE_MS);
        expect(result.labelFormat).toBe('{HH}:{mm}');
      });

      it('should return 30 min interval at exactly 5 hours 59 minutes', () => {
        const startTime = new Date('2024-01-15T10:00:00.000Z');
        const endTime = new Date('2024-01-15T15:59:00.000Z'); // 5h 59m

        const result = getTimeAxisConfig(startTime, endTime);

        expect(result.minInterval).toBe(30 * MINUTE_MS);
        expect(result.labelFormat).toBe('{HH}:{mm}');
      });

      it('should return 2 hour interval at exactly 6 hours', () => {
        const startTime = new Date('2024-01-15T10:00:00.000Z');
        const endTime = new Date('2024-01-15T16:00:00.000Z'); // 6 hours

        const result = getTimeAxisConfig(startTime, endTime);

        expect(result.minInterval).toBe(2 * HOUR_MS);
        expect(result.labelFormat).toBe('{HH}:{mm}');
      });

      it('should return 2 hour interval at exactly 23 hours', () => {
        const startTime = new Date('2024-01-15T00:00:00.000Z');
        const endTime = new Date('2024-01-15T23:00:00.000Z'); // 23 hours

        const result = getTimeAxisConfig(startTime, endTime);

        expect(result.minInterval).toBe(2 * HOUR_MS);
        expect(result.labelFormat).toBe('{HH}:{mm}');
      });

      it('should return 6 hour interval at exactly 24 hours', () => {
        const startTime = new Date('2024-01-15T00:00:00.000Z');
        const endTime = new Date('2024-01-16T00:00:00.000Z'); // 24 hours

        const result = getTimeAxisConfig(startTime, endTime);

        expect(result.minInterval).toBe(6 * HOUR_MS);
        expect(result.labelFormat).toBe('{MMM} {dd} {HH}:{mm}');
      });

      it('should return 6 hour interval at exactly 6 days 23 hours', () => {
        const startTime = new Date('2024-01-15T00:00:00.000Z');
        const endTime = new Date('2024-01-21T23:00:00.000Z'); // 6d 23h

        const result = getTimeAxisConfig(startTime, endTime);

        expect(result.minInterval).toBe(6 * HOUR_MS);
        expect(result.labelFormat).toBe('{MMM} {dd} {HH}:{mm}');
      });

      it('should return 1 day interval at exactly 7 days', () => {
        const startTime = new Date('2024-01-15T00:00:00.000Z');
        const endTime = new Date('2024-01-22T00:00:00.000Z'); // 7 days

        const result = getTimeAxisConfig(startTime, endTime);

        expect(result.minInterval).toBe(DAY_MS);
        expect(result.labelFormat).toBe('{MMM} {dd}');
      });
    });

    describe('negative/edge test cases', () => {
      it('should handle very short duration (1 minute)', () => {
        const startTime = new Date('2024-01-15T10:00:00.000Z');
        const endTime = new Date('2024-01-15T10:01:00.000Z'); // 1 minute

        const result = getTimeAxisConfig(startTime, endTime);

        // 1 minute is < 15 min, so 1 min interval
        expect(result.minInterval).toBe(MINUTE_MS);
        expect(result.labelFormat).toBe('{HH}:{mm}');
      });

      it('should handle very long duration (30 days)', () => {
        const startTime = new Date('2024-01-01T00:00:00.000Z');
        const endTime = new Date('2024-01-31T00:00:00.000Z'); // 30 days

        const result = getTimeAxisConfig(startTime, endTime);

        expect(result.minInterval).toBe(DAY_MS);
        expect(result.labelFormat).toBe('{MMM} {dd}');
      });

      it('should handle zero duration', () => {
        const startTime = new Date('2024-01-15T10:00:00.000Z');
        const endTime = new Date('2024-01-15T10:00:00.000Z'); // 0 duration

        const result = getTimeAxisConfig(startTime, endTime);

        // Zero duration is < 15 min
        expect(result.minInterval).toBe(MINUTE_MS);
        expect(result.labelFormat).toBe('{HH}:{mm}');
      });

      it('should handle negative duration (end before start)', () => {
        const startTime = new Date('2024-01-15T10:00:00.000Z');
        const endTime = new Date('2024-01-15T09:00:00.000Z'); // -1 hour

        const result = getTimeAxisConfig(startTime, endTime);

        // Negative duration results in negative minutes, which is < 15
        expect(result.minInterval).toBe(MINUTE_MS);
        expect(result.labelFormat).toBe('{HH}:{mm}');
      });
    });
  });
});

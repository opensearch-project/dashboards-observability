/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getTimeInSeconds, parseTimeRange, formatDate } from '../time_utils';

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
});

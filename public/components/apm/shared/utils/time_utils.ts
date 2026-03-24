/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import moment from 'moment-timezone';
import dateMath from '@elastic/datemath';
import { TimeRange, ParsedTimeRange, TimeAxisConfig } from '../../common/types/service_types';

/**
 * Convert time string to Unix timestamp in seconds
 */
export const getTimeInSeconds = (time: Date): number => {
  return Math.floor(time.getTime() / 1000);
};

/**
 * Parse time range string (e.g., 'now-15m', 'now') to Date objects
 */
export const parseTimeRange = (timeRange: TimeRange): ParsedTimeRange => {
  const startTime = dateMath.parse(timeRange.from);
  const endTime = dateMath.parse(timeRange.to, { roundUp: true });

  if (!startTime || !endTime) {
    throw new Error('Invalid time range');
  }

  return {
    startTime: startTime.toDate(),
    endTime: endTime.toDate(),
  };
};

/**
 * Format date to human-readable string
 */
export const formatDate = (date: Date): string => {
  return date.toLocaleString();
};

/**
 * Format a Date to PPL-compatible timestamp string: 'YYYY-MM-DD HH:mm:ss.SSS'
 * Uses UTC values for consistent cross-timezone query results.
 *
 * Similar to query_enhancements/common/utils.ts:formatDate, but that function
 * uses local time (getMonth, getHours) whereas PPL timestamp filtering requires
 * UTC (getUTCMonth, getUTCHours) to match stored data consistently across timezones.
 */
export const formatPPLTimestamp = (date: Date): string => {
  return (
    date.getUTCFullYear() +
    '-' +
    ('0' + (date.getUTCMonth() + 1)).slice(-2) +
    '-' +
    ('0' + date.getUTCDate()).slice(-2) +
    ' ' +
    ('0' + date.getUTCHours()).slice(-2) +
    ':' +
    ('0' + date.getUTCMinutes()).slice(-2) +
    ':' +
    ('0' + date.getUTCSeconds()).slice(-2) +
    '.' +
    ('00' + date.getUTCMilliseconds()).slice(-3)
  );
};

/**
 * Format a timestamp string for display, respecting the user's configured timezone.
 * Reads 'dateFormat' and 'dateFormat:tz' from uiSettings, resolving 'Browser'
 * to the browser's local timezone. This matches how Discover formats timestamps.
 */
export const formatDisplayTimestamp = (
  time: string,
  uiSettingsService: { get: (key: string) => any }
): string => {
  const dateFormat = uiSettingsService.get('dateFormat') || 'MMM D, YYYY @ HH:mm:ss.SSS';
  let timezone = uiSettingsService.get('dateFormat:tz');
  if (!timezone || timezone === 'Browser') {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  // PPL returns UTC timestamps without 'Z' suffix — parse as UTC first, then convert
  return moment.utc(time).tz(timezone).format(dateFormat);
};

// Time interval constants in milliseconds
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Calculate PromQL time range duration string from start/end times.
 * Returns format like "15m", "1h", "24h", "7d"
 *
 * @param startTime - Start time of the range
 * @param endTime - End time of the range
 * @returns Duration string for PromQL queries (e.g., "15m", "1h", "7d")
 */
export const calculateTimeRangeDuration = (startTime: Date, endTime: Date): string => {
  const durationMs = endTime.getTime() - startTime.getTime();
  const minutes = Math.ceil(durationMs / (1000 * 60));

  if (minutes <= 60) return `${minutes}m`;

  const hours = Math.ceil(minutes / 60);
  if (hours <= 24) return `${hours}h`;

  const days = Math.ceil(hours / 24);
  return `${days}d`;
};

/**
 * Get ECharts time axis configuration based on time range duration.
 * Determines appropriate tick intervals and label formats for optimal readability.
 *
 * | Time Range Duration | Tick Interval | Label Format |
 * |---------------------|---------------|--------------|
 * | < 15 min            | 1 min         | HH:mm        |
 * | 15 min - 1 hour     | 5 min         | HH:mm        |
 * | 1-6 hours           | 30 min        | HH:mm        |
 * | 6-24 hours          | 2 hours       | HH:mm        |
 * | 1-7 days            | 6 hours       | MMM DD HH:mm |
 * | > 7 days            | 1 day         | MMM DD       |
 */
export const getTimeAxisConfig = (startTime: Date, endTime: Date): TimeAxisConfig => {
  const durationMs = endTime.getTime() - startTime.getTime();
  const durationMinutes = durationMs / MINUTE_MS;
  const durationHours = durationMs / HOUR_MS;

  if (durationMinutes < 15) {
    // < 15 min: 1 min intervals, show HH:mm
    return {
      minInterval: MINUTE_MS,
      labelFormat: '{HH}:{mm}',
    };
  } else if (durationHours < 1) {
    // 15 min - 1 hour: 5 min intervals, show HH:mm
    return {
      minInterval: 5 * MINUTE_MS,
      labelFormat: '{HH}:{mm}',
    };
  } else if (durationHours < 6) {
    // 1-6 hours: 30 min intervals, show HH:mm
    return {
      minInterval: 30 * MINUTE_MS,
      labelFormat: '{HH}:{mm}',
    };
  } else if (durationHours < 24) {
    // 6-24 hours: 2 hour intervals, show HH:mm
    return {
      minInterval: 2 * HOUR_MS,
      labelFormat: '{HH}:{mm}',
    };
  } else if (durationHours < 7 * 24) {
    // 1-7 days: 6 hour intervals, show MMM DD HH:mm
    return {
      minInterval: 6 * HOUR_MS,
      labelFormat: '{MMM} {dd} {HH}:{mm}',
    };
  } else {
    // > 7 days: 1 day intervals, show MMM DD
    return {
      minInterval: DAY_MS,
      labelFormat: '{MMM} {dd}',
    };
  }
};

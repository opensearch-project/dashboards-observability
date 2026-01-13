/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import dateMath from '@elastic/datemath';
import { TimeRange, ParsedTimeRange } from '../../types/service_types';

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

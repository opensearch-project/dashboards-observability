/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Timestamp filtering strategies for integration materialized views.
 *
 * Each integration has different source data formats and timestamp fields.
 * This module provides a centralized configuration and utility to generate
 * appropriate WHERE clauses for time-range filtering.
 */

export type TimestampStrategyType =
  | 'unix_seconds' // Unix timestamp in seconds (e.g., VPC Flow)
  | 'unix_milliseconds' // Unix timestamp in milliseconds (e.g., WAF)
  | 'timestamp_field' // Already TIMESTAMP type (e.g., ELB)
  | 'string_cast' // STRING that needs CAST to TIMESTAMP (e.g., CloudTrail)
  | 'date_string' // ISO date string YYYY-MM-DD (e.g., CloudFront)
  | 'complex'; // Complex parsing (e.g., nginx, apache) - skip filtering

export interface TimestampStrategy {
  type: TimestampStrategyType;
  sourceField: string;
  requiresCast?: boolean;
}

/**
 * Mapping of integration names to their timestamp handling strategies.
 *
 * To add a new integration:
 * 1. Identify the source timestamp field in the table schema
 * 2. Determine the data type (unix seconds/ms, timestamp, string)
 * 3. Add configuration entry below
 */
export const TIMESTAMP_STRATEGIES: Record<string, TimestampStrategy> = {
  // VPC Flow: Uses Unix seconds in 'start' field
  amazon_vpc_flow: {
    type: 'unix_seconds',
    sourceField: 'start',
  },

  // WAF: Uses Unix milliseconds in 'timestamp' field
  aws_waf: {
    type: 'unix_milliseconds',
    sourceField: 'timestamp',
  },

  // ELB: 'time' field is already TIMESTAMP type
  amazon_elb: {
    type: 'timestamp_field',
    sourceField: 'time',
  },

  // CloudTrail: 'eventTime' is STRING, needs CAST
  aws_cloudtrail: {
    type: 'string_cast',
    sourceField: 'eventTime',
    requiresCast: true,
  },

  // Network Firewall: 'event.timestamp' is STRING, needs CAST
  amazon_networkfirewall: {
    type: 'string_cast',
    sourceField: 'event.timestamp',
    requiresCast: true,
  },

  // CloudFront: Has clean ISO date field, can filter directly
  amazon_cloudfront: {
    type: 'date_string',
    sourceField: 'date',
  },

  // S3: Complex parsing with multiple string operations
  amazon_s3: {
    type: 'complex',
    sourceField: 'request_time',
  },

  // Nginx: Complex parsing with trim and concat operations
  nginx: {
    type: 'complex',
    sourceField: 'time_local_1',
  },

  // Apache: Complex parsing similar to nginx
  apache: {
    type: 'complex',
    sourceField: 'time_local_1',
  },

  // HAProxy: Complex regex extraction
  haproxy: {
    type: 'complex',
    sourceField: 'record',
  },
};

/**
 * Generates a WHERE clause for filtering data by timestamp based on refresh range.
 *
 * @param integrationName - Name of the integration (e.g., 'amazon_vpc_flow')
 * @param refreshRangeDays - Number of days to look back (0 = no limit)
 * @returns SQL WHERE clause string, or empty string if no filtering needed
 *
 * @example
 * // VPC Flow with 7 days
 * generateTimestampFilter('amazon_vpc_flow', 7)
 * // Returns: "WHERE start >= 1765242601"
 *
 * @example
 * // ELB with 1 day
 * generateTimestampFilter('amazon_elb', 1)
 * // Returns: "WHERE time >= '2025-12-14 12:00:00'"
 *
 * @example
 * // CloudFront with 7 days
 * generateTimestampFilter('amazon_cloudfront', 7)
 * // Returns: "WHERE `date` >= '2025-12-08'"
 */
export function generateTimestampFilter(integrationName: string, refreshRangeDays: number): string {
  // No filtering if refresh range is 0 (no limit)
  if (refreshRangeDays === 0) {
    return '';
  }

  const strategy = TIMESTAMP_STRATEGIES[integrationName];

  if (!strategy) {
    console.warn(
      `[Timestamp Filter] No strategy found for integration: ${integrationName}. Skipping time filter.`
    );
    return '';
  }

  // Skip complex timestamp transformations
  if (strategy.type === 'complex') {
    console.info(
      `[Timestamp Filter] Integration '${integrationName}' uses complex timestamp parsing. Skipping time filter.`
    );
    return '';
  }

  // Calculate the start date based on refresh range
  const now = new Date();
  const startDate = new Date(now.getTime() - refreshRangeDays * 24 * 60 * 60 * 1000);

  switch (strategy.type) {
    case 'unix_seconds': {
      const unixSeconds = Math.floor(startDate.getTime() / 1000);
      return `WHERE ${strategy.sourceField} >= ${unixSeconds}`;
    }

    case 'unix_milliseconds': {
      const unixMilliseconds = startDate.getTime();
      return `WHERE \`${strategy.sourceField}\` >= ${unixMilliseconds}`;
    }

    case 'timestamp_field': {
      const isoString = startDate
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d{3}Z$/, '');
      return `WHERE ${strategy.sourceField} >= '${isoString}'`;
    }

    case 'string_cast': {
      const isoString = startDate
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d{3}Z$/, '');
      if (strategy.requiresCast) {
        return `WHERE CAST(${strategy.sourceField} AS TIMESTAMP) >= '${isoString}'`;
      }
      return `WHERE ${strategy.sourceField} >= '${isoString}'`;
    }

    case 'date_string': {
      const dateString = startDate.toISOString().split('T')[0]; // "2025-12-08"
      return `WHERE \`${strategy.sourceField}\` >= '${dateString}'`;
    }

    default:
      console.warn(`[Timestamp Filter] Unknown strategy type for integration: ${integrationName}`);
      return '';
  }
}

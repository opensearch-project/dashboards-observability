/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * App ID for Explore application used in navigation
 */
export const EXPLORE_APP_ID = 'explore';

/**
 * Constants for APM components
 */
export const APM_CONSTANTS = {
  // Filter sidebar
  ATTRIBUTE_VALUES_INITIAL_LIMIT: 5,

  // Table pagination
  DEFAULT_PAGE_SIZE: 10,
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100] as const,

  // Sparklines
  SPARKLINE_HEIGHT: 20,
  SPARKLINE_WIDTH: 100,

  // Colors for metrics
  COLORS: {
    LATENCY: '#6092C0',
    THROUGHPUT: '#54B399',
    FAILURE_RATE: '#D36086',
    ERROR: '#D36086',
    FAULT: '#BD271E',
    SUCCESS: '#54B399',
    WARNING: '#D6BF57',
  },

  // Query limits for fetching data
  QUERY_LIMITS: {
    SPANS: 50,
    LOGS_PER_DATASET: 10,
  },

  // Truncation length for log messages in table display
  MESSAGE_TRUNCATION_LENGTH: 200,
} as const;

/**
 * Service Details page constants
 */
export const SERVICE_DETAILS_CONSTANTS = {
  // Default time range
  DEFAULT_TIME_RANGE: {
    from: 'now-15m',
    to: 'now',
  },

  // Chart heights
  METRIC_CARD_HEIGHT: 120,

  // Trend indicator threshold (percentage change below this is considered neutral)
  TREND_THRESHOLD_PERCENT: 0.1,
  LINE_CHART_HEIGHT: 300,
  EXPANDED_ROW_CHART_HEIGHT: 250,

  // Threshold values for availability filters
  AVAILABILITY_THRESHOLDS: ['< 95%', '95-99%', '≥ 99%'] as const,

  // Threshold values for error/fault rate filters
  RATE_THRESHOLDS: ['< 1%', '1-5%', '> 5%'] as const,

  // Default slider ranges
  DEFAULT_LATENCY_RANGE: [0, 10000] as [number, number],
  DEFAULT_REQUESTS_RANGE: [0, 100000] as [number, number],

  // Tab IDs
  TABS: {
    OVERVIEW: 'overview',
    OPERATIONS: 'operations',
    DEPENDENCIES: 'dependencies',
  } as const,

  // URL param keys
  URL_PARAMS: {
    TAB: 'tab',
    FROM: 'from',
    TO: 'to',
    FILTER_PREFIX: 'filter.',
  } as const,
} as const;

/**
 * Chart colors for multi-series line charts
 */
export const CHART_COLORS = [
  '#54B399', // Green
  '#6092C0', // Blue
  '#D36086', // Pink
  '#9170B8', // Purple
  '#CA8EAE', // Light Pink
  '#D6BF57', // Yellow
  '#B9A888', // Tan
  '#DA8B45', // Orange
  '#AA6556', // Brown
  '#E7664C', // Red-Orange
] as const;

/**
 * Maps uppercase platform type to display key for environment filter
 */
export const ENVIRONMENT_PLATFORM_MAP: Record<string, string> = {
  GENERIC: 'generic',
  EKS: 'EKS',
  ECS: 'ECS',
  EC2: 'EC2',
  LAMBDA: 'Lambda',
};

/**
 * Maps raw environment values to display-friendly names
 * Example: "generic:default" → "generic"
 */
export const ENVIRONMENT_DISPLAY_MAP: Record<string, string> = {
  'generic:default': 'generic',
};

/**
 * Get display-friendly environment name
 * @param environment - Raw environment string (e.g., "generic:default", "eks:cluster/namespace")
 * @returns Display-friendly name (e.g., "generic", "eks")
 */
export function getEnvironmentDisplayName(environment: string): string {
  if (!environment) {
    return '';
  }

  // Check if there's a direct mapping
  if (ENVIRONMENT_DISPLAY_MAP[environment]) {
    return ENVIRONMENT_DISPLAY_MAP[environment];
  }

  // Default: return environment prefix (before colon)
  const colonIndex = environment.indexOf(':');
  if (colonIndex > 0) {
    return environment.substring(0, colonIndex);
  }

  return environment;
}

/**
 * Correlation constants for log-trace correlation
 */
export const CORRELATION_CONSTANTS = {
  /**
   * Buffer time in milliseconds for log correlation queries.
   * Used to account for telemetry lag between spans and logs.
   * 5 minutes on each side of the span time range.
   */
  TELEMETRY_LAG_BUFFER_MS: 5 * 60 * 1000, // 5 minutes
} as const;

/**
 * Query constants for Prometheus/PromQL queries
 */
export const PROMQL_CONSTANTS = {
  /**
   * Time window in milliseconds for instant-like queries.
   * Used to simulate instant queries with range query API.
   */
  INSTANT_QUERY_WINDOW_MS: 5 * 60 * 1000, // 5 minutes
} as const;

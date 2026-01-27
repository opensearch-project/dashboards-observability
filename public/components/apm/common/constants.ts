/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { euiThemeVars } from '@osd/ui-shared-deps/theme';

/**
 * APM Documentation URL
 */
export const APM_DOCS_URL = 'https://docs.opensearch.org/latest/observing-your-data/';

/**
 * App ID for Explore application used in navigation
 */
export const EXPLORE_APP_ID = 'explore';

/**
 * LocalStorage key for tracking if the legacy banner has been dismissed
 */
export const LEGACY_BANNER_DISMISSED_KEY = 'apm.legacyBannerDismissed';

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

  // Colors for metrics (using EUI theme variables for dark/light mode support)
  COLORS: {
    LATENCY: euiThemeVars.euiColorVis1,
    THROUGHPUT: euiThemeVars.euiColorVis0,
    FAILURE_RATE: euiThemeVars.euiColorVis2,
    ERROR: euiThemeVars.euiColorVis2,
    FAULT: euiThemeVars.euiColorDanger,
    SUCCESS: euiThemeVars.euiColorVis0,
    WARNING: euiThemeVars.euiColorVis5,
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
 * Semantic keys for availability threshold filters
 */
export enum AvailabilityThreshold {
  LOW = 'LOW', // < 95%
  MEDIUM = 'MEDIUM', // 95-99%
  HIGH = 'HIGH', // ≥ 99%
}

/**
 * Semantic keys for error/fault rate threshold filters
 */
export enum ErrorRateThreshold {
  LOW = 'LOW', // < 1%
  MEDIUM = 'MEDIUM', // 1-5%
  HIGH = 'HIGH', // > 5%
}

/**
 * Display labels for threshold filters
 * Separated from logic keys for i18n support
 */
export const THRESHOLD_LABELS = {
  availability: {
    [AvailabilityThreshold.LOW]: '< 95%',
    [AvailabilityThreshold.MEDIUM]: '95-99%',
    [AvailabilityThreshold.HIGH]: '≥ 99%',
  },
  errorRate: {
    [ErrorRateThreshold.LOW]: '< 1%',
    [ErrorRateThreshold.MEDIUM]: '1-5%',
    [ErrorRateThreshold.HIGH]: '> 5%',
  },
} as const;

/**
 * Ordered arrays for UI rendering
 */
export const AVAILABILITY_THRESHOLD_OPTIONS = [
  AvailabilityThreshold.LOW,
  AvailabilityThreshold.MEDIUM,
  AvailabilityThreshold.HIGH,
] as const;

export const ERROR_RATE_THRESHOLD_OPTIONS = [
  ErrorRateThreshold.LOW,
  ErrorRateThreshold.MEDIUM,
  ErrorRateThreshold.HIGH,
] as const;

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
 * Using EUI theme visualization colors for dark/light mode support
 */
export const CHART_COLORS = [
  euiThemeVars.euiColorVis0, // Green
  euiThemeVars.euiColorVis1, // Blue
  euiThemeVars.euiColorVis2, // Pink
  euiThemeVars.euiColorVis3, // Purple
  euiThemeVars.euiColorVis4, // Light Pink
  euiThemeVars.euiColorVis5, // Yellow
  euiThemeVars.euiColorVis6, // Tan
  euiThemeVars.euiColorVis7, // Orange
  euiThemeVars.euiColorVis8, // Brown
  euiThemeVars.euiColorVis9, // Red-Orange
];

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

/**
 * Application Map constants
 */
export const APPLICATION_MAP_CONSTANTS = {
  /** Default time range for the map */
  DEFAULT_TIME_RANGE: {
    from: 'now-15m',
    to: 'now',
  },

  /** Health status thresholds */
  HEALTH_THRESHOLDS: {
    /** Failure rate below this is considered healthy */
    HEALTHY_FAILURE_RATE: 1,
    /** Failure rate above this is considered critical */
    CRITICAL_FAILURE_RATE: 5,
  },

  /** Service details panel chart heights */
  CHART_HEIGHT: 150,
  HEALTH_DONUT_SIZE: 100,

  /** Filter sidebar width */
  SIDEBAR_INITIAL_WIDTH: 15,
  SIDEBAR_MIN_WIDTH: '10%',

  /** Map container minimum height */
  MAP_MIN_HEIGHT: 500,
} as const;

// Platform utility functions moved to shared/utils/platform_utils.ts
export {
  PLATFORM_TYPE_MAP,
  getPlatformDisplayName,
  getPlatformTypeFromEnvironment,
  toPrometheusLabel,
} from '../shared/utils/platform_utils';

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
 * APM Documentation URLs for settings modal
 */
export const APM_TRACES_DOCS_URL =
  'https://docs.opensearch.org/latest/observing-your-data/exploring-observability-data/datasets/#creating-a-traces-dataset';
export const APM_SERVICE_MAP_DOCS_URL =
  'https://github.com/opensearch-project/data-prepper/tree/main/data-prepper-plugins/otel-apm-service-map-processor';
export const APM_RED_METRICS_DOCS_URL =
  'https://github.com/opensearch-project/data-prepper/tree/main/data-prepper-plugins/otel-apm-service-map-processor#generated-metrics';
export const APM_PIPELINE_DOCS_URL = 'https://observability.opensearch.org/docs/apm/';
export const APM_CORRELATIONS_DOCS_URL =
  'https://docs.opensearch.org/latest/observing-your-data/exploring-observability-data/correlations/#creating-a-trace-to-logs-correlation';

/**
 * APM dataset naming conventions and field requirements.
 *
 * These describe the OpenTelemetry index shapes APM depends on and are shared
 * domain knowledge — the setup wizard uses them to detect and auto-create
 * datasets, and the manual "APM Settings" flow validates the same datasets. A
 * match requires BOTH the naming convention AND that the required fields exist.
 * Values were confirmed against a live OpenTelemetry demo cluster (indices
 * otel-v1-apm-span-*, logs-otel-v1-*, otel-v2-apm-service-map-*) and the working
 * DataViews on the datasets page.
 */

/** Traces: OpenTelemetry span index pattern (Data Prepper otel-v1). */
export const APM_TRACES_INDEX_PATTERN = 'otel-v1-apm-span*';
/** Fields that must exist for a span index to qualify as traces. */
export const APM_TRACES_REQUIRED_FIELDS = ['traceId', 'spanId', 'serviceName'] as const;
/**
 * Preferred trace time field. The working DataView uses `endTime`; `startTime`
 * is an accepted fallback (both are date_nanos). Order matters — highest first.
 */
export const APM_TRACES_TIME_FIELD_CANDIDATES = ['endTime', 'startTime'] as const;

/** Logs: OpenTelemetry log index pattern (correlated with traces). */
export const APM_LOGS_INDEX_PATTERN = 'logs-otel-v1*';
/** Fields that must exist for a log index to qualify as correlatable logs. */
export const APM_LOGS_REQUIRED_FIELDS = ['traceId', 'spanId', 'time'] as const;
/** Log time field (matches the working DataView). */
export const APM_LOGS_TIME_FIELD = 'time';
/**
 * schemaMappings written on the correlated-logs DataView, matching the working
 * example exactly. Used by the runtime log-correlation queries.
 */
export const APM_LOGS_SCHEMA_MAPPINGS = {
  otelLogs: {
    timestamp: 'time',
    traceId: 'traceId',
    spanId: 'spanId',
    serviceName: 'resource.attributes.service.name',
  },
} as const;

/** Service map: newer v2 convention (nested source/target node schema). */
export const APM_SERVICE_MAP_INDEX_PATTERN = 'otel-v2-apm-service-map*';
/** Fields that must exist for a v2 service-map index to qualify. */
export const APM_SERVICE_MAP_REQUIRED_FIELDS = [
  'sourceNode',
  'targetNode',
  'sourceOperation',
  'targetOperation',
  'nodeConnectionHash',
  'timestamp',
] as const;
/** Service-map time field. The v2 DataView has no signalType / schemaMappings. */
export const APM_SERVICE_MAP_TIME_FIELD = 'timestamp';

/**
 * RED metrics (Rate / Errors / Duration) the wizard checks for on a direct-query
 * Prometheus data source. These are the span-derived metrics emitted by Data
 * Prepper (confirmed present on the live source). A data source must expose all
 * of these to be offered as a RED-metrics source. The wizard never creates a
 * Prometheus data source — it only detects and reuses existing ones.
 */
export const APM_RED_REQUIRED_METRICS = ['request', 'fault', 'latency_seconds_bucket'] as const;

/**
 * App ID for Explore application used in navigation
 */
export const EXPLORE_APP_ID = 'explore';

/**
 * LocalStorage key for tracking if the legacy banner has been dismissed
 */
export const LEGACY_BANNER_DISMISSED_KEY = 'apm.legacyBannerDismissed';

/**
 * sessionStorage key for the shared APM time range. All APM pages (services,
 * service details, application map, SLO detail) read and write this key so the
 * selected time range persists across reloads/navigation and is shared between
 * pages instead of resetting to the default. Uses sessionStorage to match the
 * Trace Analytics convention (see trace_analytics/home.tsx).
 */
export const APM_TIME_RANGE_STORAGE_KEY = 'apm.timeRange';

/**
 * Default APM time range used when nothing has been persisted yet.
 */
export const DEFAULT_APM_TIME_RANGE = {
  from: 'now-15m',
  to: 'now',
} as const;

/**
 * Constants for APM components
 */
export const APM_CONSTANTS = {
  // Filter sidebar
  ATTRIBUTE_VALUES_INITIAL_LIMIT: 5,

  // Table pagination
  DEFAULT_PAGE_SIZE: 10,
  PAGE_SIZE_OPTIONS: [10, 25, 50] as const,

  // Sparkline height is fixed; width is now fluid (sparkline cells in the
  // Service Catalog table use a min/max-bounded flex slot so the chart
  // expands on wide screens and contracts on narrow ones). The
  // SPARKLINE_WIDTH constant is retained at 60 only as a fallback for
  // any consumer that still passes it — services-home no longer does.
  SPARKLINE_HEIGHT: 20,
  SPARKLINE_WIDTH: 60,

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
    SLOS: 'slos',
  } as const,

  // Table pagination
  DEFAULT_PAGE_SIZE: 10,
  PAGE_SIZE_OPTIONS: [10, 25, 50] as const,

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
   * Applied only to the lower bound (before span start) to catch early-arriving
   * logs whose spans already exist, without fetching logs beyond the latest span.
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
 * Topology Map constants
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

  /**
   * Max nodes rendered in the Services / groupByValue graph. Above this the
   * graph switches to a "narrow your selection" notice instead of laying out
   * the full graph (dagre layout is O(N+E)). Set as a pathological-case guard;
   * layout only recomputes on structural change now, so typical large fleets
   * (a few hundred services) still render.
   */
  MAX_RENDERED_NODES: 500,
} as const;

// Platform utility functions moved to shared/utils/platform_utils.ts
export {
  PLATFORM_TYPE_MAP,
  getPlatformDisplayName,
  getPlatformTypeFromEnvironment,
  toPrometheusLabel,
} from '../shared/utils/platform_utils';

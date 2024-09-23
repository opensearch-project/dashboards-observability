/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const JAEGER_INDEX_NAME = '*jaeger-span-*';
export const JAEGER_SERVICE_INDEX_NAME = '*jaeger-service*';
export const DATA_PREPPER_INDEX_NAME = 'otel-v1-apm-span-*';
export const DATA_PREPPER_SERVICE_INDEX_NAME = 'otel-v1-apm-service-map*';
export const TRACE_ANALYTICS_DATE_FORMAT = 'MM/DD/YYYY HH:mm:ss.SSS';
export const TRACE_ANALYTICS_PLOTS_DATE_FORMAT = 'MMM D, YYYY HH:mm:ss.SSS';
export const SERVICE_MAP_MAX_NODES = 500;
// size limit when requesting edge related queries, not necessarily the number of edges
export const SERVICE_MAP_MAX_EDGES = 1000;
export const TRACES_MAX_NUM = 3000;
export const TRACE_ANALYTICS_DOCUMENTATION_LINK =
  'https://opensearch.org/docs/latest/observability-plugin/trace/index/';

export const TRACE_ANALYTICS_JAEGER_INDICES_ROUTE =
  '/api/observability/trace_analytics/jaeger_indices';
export const TRACE_ANALYTICS_DATA_PREPPER_INDICES_ROUTE =
  '/api/observability/trace_analytics/data_prepper_indices';
export const TRACE_ANALYTICS_DSL_ROUTE = '/api/observability/trace_analytics/query';

export const TRACE_CUSTOM_SPAN_INDEX_SETTING = 'observability:traceAnalyticsSpanIndices';
export const TRACE_CUSTOM_SERVICE_INDEX_SETTING = 'observability:traceAnalyticsServiceIndices';

export enum TRACE_TABLE_TITLES {
  all_spans = 'All Spans',
  root_spans = 'Root Spans',
  entry_spans = 'Service Entry Spans',
  traces = 'Traces',
}

const getDescription = (key: keyof typeof TRACE_TABLE_TITLES): string => {
  const descriptions: Record<keyof typeof TRACE_TABLE_TITLES, string> = {
    all_spans: 'Spans representing all activities in all traces across the system',
    root_spans: 'Spans marking the root or starting point of each trace',
    entry_spans: 'Spans that indicate the entry point of service-side processing',
    traces: 'Spans grouped by traceId to show a complete trace lifecycle',
  };
  return descriptions[key];
};

export const TRACE_TABLE_OPTIONS = Object.entries(TRACE_TABLE_TITLES).map(([key, label]) => ({
  label,
  key,
  'aria-describedby': getDescription(key as keyof typeof TRACE_TABLE_TITLES),
}));

export const TRACE_TABLE_TYPE_KEY = 'TraceAnalyticsTraceTableType';

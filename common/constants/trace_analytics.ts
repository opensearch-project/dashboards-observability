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
  all_spans = 'Spans',
  trace_root_spans = 'Trace root spans',
  service_entry_spans = 'Service entry spans',
  traces = 'Traces',
}

export const TRACE_TABLE_OPTIONS = [
  {
    label: TRACE_TABLE_TITLES.all_spans,
    key: 'all_spans',
    'aria-describedby': 'All spans from all traces',
  },
  {
    label: TRACE_TABLE_TITLES.trace_root_spans,
    key: 'trace_root_spans',
    'aria-describedby': 'The root spans which represent the starting point of a trace',
  },
  {
    label: TRACE_TABLE_TITLES.service_entry_spans,
    key: 'service_entry_spans',
    'aria-describedby': 'The spans that mark start of server-side processing (SPAN_KIND_SERVER)',
  },
  {
    label: TRACE_TABLE_TITLES.traces,
    key: 'traces',
    'aria-describedby': 'Aggregates all spans by traceId to show all traces',
  },
];

export const TRACE_TABLE_TYPE_KEY = 'TraceAnalyticsTraceTableType';

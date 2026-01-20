/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Prometheus query request interfaces
export interface PrometheusQueryRequest {
  query: string;
  time?: string;
  timeout?: string;
}

export interface PrometheusRangeQueryRequest {
  query: string;
  start: string;
  end: string;
  step?: string;
  timeout?: string;
}

// Prometheus metric value (timestamp, value pair)
export interface PrometheusMetricValue {
  timestamp: number;
  value: string;
}

// Prometheus metric with labels
export interface PrometheusMetric {
  metric: Record<string, string>;
  value?: [number, string]; // For instant queries
  values?: Array<[number, string]>; // For range queries
}

// Prometheus query result
export interface PrometheusQueryResult {
  resultType: 'matrix' | 'vector' | 'scalar' | 'string';
  result: PrometheusMetric[];
}

// Prometheus API response
export interface PrometheusResponse {
  status: 'success' | 'error';
  data?: PrometheusQueryResult;
  errorType?: string;
  error?: string;
  warnings?: string[];
}

// ExecuteMetricRequest params (matches our API)
// Note: step is calculated automatically by OSD core
export interface ExecuteMetricRequestParams {
  query: string;
  startTime: number;
  endTime: number;
}

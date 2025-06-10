/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TRACE_TABLE_TITLES } from '../constants/trace_analytics';

export type SpanField =
  | 'SPAN_ID'
  | 'PARENT_SPAN_ID'
  | 'SERVICE'
  | 'OPERATION'
  | 'DURATION'
  | 'START_TIME'
  | 'END_TIME'
  | 'ERRORS';

export interface ServiceTrends {
  [serviceName: string]: {
    latency_trend: { x: number[]; y: number[] };
    throughput: {
      customdata: string[];
      x: number[];
      y: number[];
    };
    error_rate: { x: number[]; y: number[]; customdata: string[] };
  };
}

export interface ServiceNodeDetails {
  label: string;
  average_latency: string;
  error_rate: string;
  throughput: string;
}

export interface GraphVisNode {
  id: number;
  label: string;
  size: number;
  title: string;
  average_latency: string;
  error_rate: string;
  throughput: string;
  borderWidth: number;
  color: string | { border: string; background: string };
  font?: { color: string };
  shapeProperties?: { borderDashes: number[] };
  chosen?: boolean;
}

export interface GraphVisEdge {
  from: number;
  to: number;
  color: string;
}

export type TraceAnalyticsMode = 'jaeger' | 'data_prepper';
export type TraceQueryMode = keyof typeof TRACE_TABLE_TITLES;

export interface CorrelatedLogsFieldMappings {
  serviceName: string;
  spanId: string;
  timestamp: string;
  traceId: string;
}

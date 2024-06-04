/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

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
      customdata: Array<string>;
      x: number[];
      y: number[];
    };
    error_rate: { x: number[]; y: number[]; customdata: Array<string> };
  };
}

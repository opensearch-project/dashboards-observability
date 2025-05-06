/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Conversion factor for nanoseconds to milliseconds
export const NANOS_TO_MS = 1e6;

export const MILI_TO_SEC = 1000;

export const MAX_DISPLAY_ROWS = 10000;

export const pieChartColors = [
  '#7492e7',
  '#c33d69',
  '#2ea597',
  '#8456ce',
  '#e07941',
  '#3759ce',
  '#ce567c',
  '#9469d6',
  '#4066df',
  '#da7596',
];

export interface Span {
  traceId: string;
  spanId: string;
  traceState: string;
  parentSpanId: string;
  name: string;
  kind: string;
  startTime: string;
  endTime: string;
  durationInNanos: number;
  serviceName: string;
  events: any[];
  links: any[];
  droppedAttributesCount: number;
  droppedEventsCount: number;
  droppedLinksCount: number;
  traceGroup: string;
  traceGroupFields: {
    endTime: string;
    durationInNanos: number;
    statusCode: number;
  };
  status: {
    code: number;
  };
  instrumentationLibrary: {
    name: string;
    version: string;
  };
}

export interface ParsedHit {
  _index: string;
  _id: string;
  _score: number;
  _source: Span;
  sort?: any[];
}

export interface TraceFilter {
  field: string;
  value: any;
}

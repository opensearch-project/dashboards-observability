/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DateMath } from '@opensearch-project/opensearch/api/types';
import { SavedObjectAttributes } from '../../../../src/core/server';
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

export type TraceAnalyticsMode = 'jaeger' | 'data_prepper' | 'custom_data_prepper';
export type TraceQueryMode = keyof typeof TRACE_TABLE_TITLES;

export enum TracingSchema {
  DATA_PREPPER = 'data-prepper',
  JAEGER = 'jaeger',
  OTEL = 'otel',
}

export enum LanguageTypes {
  DQL = "kuery",
}

export enum FilterOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
  EXISTS = 'exists',
  NOT_EXISTS = 'not_exists',
}

export interface SemVer extends SavedObjectAttributes {
  major: number;
  minor: number;
  patch: number;
}

export interface TracesFilter extends SavedObjectAttributes {
  field: string;
  operator: FilterOperator;
  value: string;
  inverted: boolean;
  disabled: boolean;
}

export interface PersistedComponent extends SavedObjectAttributes {
  id: string;
  settings: Record<string, any>;
}

export interface SavedTraceView extends SavedObjectAttributes {
  name: string;
  schemaVersion: TracingSchema;
  schemaType: SemVer;
  startTime: DateMath;
  endTime: DateMath;
  filters: TracesFilter[];
  searchBarFilters: {
    language: LanguageTypes;
    query: string;
  };
  spanIndices: string;
  serviceIndices: string;
  persistedViews: Record<string, PersistedComponent>;
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents a span data row in the correlations flyout
 */
export interface SpanData {
  _id: string;
  startTime: string;
  status: number;
  httpStatus: number | string;
  kind: string;
  operation: string;
  spanId: string;
  raw: Record<string, any>;
}

/**
 * Represents a log data row in the correlations flyout
 */
export interface LogData {
  _id: string;
  timestamp: string;
  level: string;
  severityNumber?: number;
  message: string;
  spanId: string;
  raw: Record<string, any>;
}

/**
 * Represents a correlated log dataset result with its logs
 */
export interface LogDatasetResult {
  datasetId: string;
  displayName: string;
  title: string;
  serviceNameField: string;
  logs: LogData[];
  loading: boolean;
  error?: Error;
}

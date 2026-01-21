/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Service item for display in the services table
 */
export interface ServiceTableItem {
  serviceName: string;
  environment: string;
  groupByAttributes?: Record<string, any>;
}

/**
 * Service fault metric for TOP-K widget
 */
export interface ServiceFaultMetric {
  service: string;
  environment: string;
  faultRate: number;
  relativePercentage: number;
}

/**
 * Connection info for APM API requests
 */
export interface ApmApiConnection {
  id: string;
  type: string;
}

/**
 * Request format for APM API
 */
export interface ApmApiRequest {
  connection: ApmApiConnection;
  operation: string;
  params: Record<string, any>;
}

/**
 * Time range for queries
 */
export interface TimeRange {
  from: string;
  to: string;
}

/**
 * Parsed time range with Date objects
 */
export interface ParsedTimeRange {
  startTime: Date;
  endTime: Date;
}

/**
 * Time axis configuration for ECharts
 */
export interface TimeAxisConfig {
  /** Minimum interval between ticks in milliseconds */
  minInterval: number;
  /** Date format string for axis labels */
  labelFormat: string;
}

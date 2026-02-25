/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Time range for APM queries
 */
export interface TimeRange {
  from: string; // e.g., 'now-15m', ISO string, or epoch
  to: string; // e.g., 'now', ISO string, or epoch
}

/**
 * Service details metadata from PPL query
 */
export interface ServiceDetailsData {
  serviceName: string;
  environment: string;
  type?: string;
}

/**
 * Service operation from PPL query
 */
export interface ServiceOperation {
  operationName: string;
  requestCount: number;
  errorRate: number; // 4xx error rate (0-1)
  faultRate: number; // 5xx fault rate (0-1)
  avgDuration: number; // ms
  p50Duration: number; // ms
  p90Duration: number; // ms
  p99Duration: number; // ms
  availability: number; // 0-1
  dependencyCount: number;
}

/**
 * Enriched operation with metrics from PromQL
 */
export interface EnrichedOperation extends ServiceOperation {
  latencySparklineData?: MetricDataPoint[];
  throughputSparklineData?: MetricDataPoint[];
}

/**
 * Service dependency from PPL query
 */
export interface ServiceDependency {
  serviceName: string;
  serviceOperation: string;
  remoteOperation: string;
  environment: string;
  callCount: number;
}

/**
 * Enriched dependency with metrics from PromQL
 */
export interface EnrichedDependency extends ServiceDependency {
  p50Duration?: number;
  p90Duration?: number;
  p99Duration?: number;
  faultRate?: number;
  errorRate?: number;
  availability?: number;
}

/**
 * Grouped dependency for table display
 * Groups by (serviceName + remoteOperation), aggregating service operations
 */
export interface GroupedDependency {
  serviceName: string;
  environment: string;
  remoteOperation: string;
  serviceOperations: string[];
  callCount: number; // From PPL (document count)
  requestCount?: number; // From Prometheus (actual request count)
  p50Duration?: number;
  p90Duration?: number;
  p99Duration?: number;
  faultRate?: number;
  errorRate?: number;
  availability?: number;
}

/**
 * Metric data point for charts
 */
export interface MetricDataPoint {
  timestamp: number;
  value: number;
}

/**
 * Chart series data for multi-series charts
 */
export interface ChartSeriesData {
  name: string;
  data: MetricDataPoint[];
  color?: string;
}

/**
 * PromQL chart data response
 */
export interface PromQLChartData {
  series: ChartSeriesData[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * Tab IDs for service details page
 */
export type ServiceDetailsTabId = 'overview' | 'operations' | 'dependencies';

/**
 * URL parameters for service details page
 */
export interface ServiceDetailsUrlParams {
  serviceName: string;
  environment?: string;
  tab?: ServiceDetailsTabId;
  from?: string;
  to?: string;
  filters?: Record<string, string | string[]>;
}

/**
 * Filter sidebar state for operations
 */
export interface OperationFiltersState {
  selectedOperations: string[];
  availabilityThresholds: string[];
  errorRateThresholds: string[];
  faultRateThresholds: string[];
  latencyRange: [number, number];
  requestsRange: [number, number];
}

/**
 * Filter sidebar state for dependencies
 */
export interface DependencyFiltersState {
  selectedDependencies: string[];
  selectedServiceOperations: string[];
  selectedRemoteOperations: string[];
  availabilityThresholds: string[];
  errorRateThresholds: string[];
  faultRateThresholds: string[];
  latencyRange: [number, number];
  requestsRange: [number, number];
}

/**
 * Operation metrics from PromQL
 */
export interface OperationMetrics {
  p50Duration: number;
  p90Duration: number;
  p99Duration: number;
  faultRate: number;
  errorRate: number;
  availability: number;
  dependencyCount: number;
  requestCount: number;
}

/**
 * Dependency metrics from PromQL
 */
export interface DependencyMetrics {
  p50Duration: number;
  p90Duration: number;
  p99Duration: number;
  faultRate: number;
  errorRate: number;
  availability: number;
  requestCount: number;
}

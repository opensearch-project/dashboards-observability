/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PromQL queries for APM metrics
 *
 * Metrics available from Prometheus:
 * - error: Error count metric (gauge)
 * - request: Request count metric (gauge)
 * - fault: Fault count metric (gauge)
 * - latency_seconds_seconds_bucket: Histogram buckets for latency
 * - latency_seconds_seconds_count: Count of latency observations
 * - latency_seconds_seconds_sum: Sum of latency values
 * - latency_seconds_seconds_max: Maximum latency
 * - latency_seconds_seconds_min: Minimum latency
 *
 * Common labels: service, environment, operation, remoteService
 * Note: span_kind label may not be available in all metrics
 */

// Time range for rate calculations (5 minutes)
const RATE_INTERVAL = '5m';

/**
 * Top Operations by Latency (P95)
 * Returns top 5 operations by 95th percentile latency
 * Note: latency_seconds_seconds_bucket is a gauge, so we don't use rate()
 */
export const QUERY_TOP_OPERATIONS_BY_LATENCY = `
topk(5,
  histogram_quantile(0.95,
    sum by (environment, service, operation, le) (
      latency_seconds_seconds_bucket
    )
  )
)
`;

/**
 * Top Operations by Volume (Request Count) - for specific service
 * Returns top 5 operations by request count for a given service
 */
export const getQueryTopOperationsByVolume = (environment: string, serviceName: string): string => `
topk(5,
  sum by (operation) (
    request{environment="${environment}",service="${serviceName}",namespace="span_derived"}
  )
)
or
label_replace(
  sum(request{environment="${environment}",service="${serviceName}",namespace="span_derived"}),
  "operation",
  "overall",
  "",
  ""
)
`;

/**
 * Legacy global query - kept for backward compatibility
 */
export const QUERY_TOP_OPERATIONS_BY_VOLUME = `
topk(5,
  sum by (environment, service, operation) (
    request{namespace="span_derived"}
  )
)
`;

/**
 * Top Operations by Fault Count
 * Returns top 5 operations by fault count
 */
export const QUERY_TOP_OPERATIONS_BY_FAULT = `
topk(5,
  sum by (environment, service, operation) (
    fault
  )
)
`;

/**
 * Top Dependencies by Latency - for specific service
 * Returns top 5 service dependencies by specified percentile latency
 * Note: latency_seconds_seconds_bucket is a gauge, so we don't use rate()
 */
export const getQueryTopDependenciesByLatency = (
  environment: string,
  serviceName: string,
  percentile: number = 0.95
): string => `
topk(5,
  histogram_quantile(${percentile},
    sum by (remoteService, le) (
      latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived"}
    )
  )
)
or
label_replace(
  histogram_quantile(${percentile},
    sum by (le) (
      latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived"}
    )
  ),
  "remoteService",
  "overall",
  "",
  ""
)
`;

/**
 * Legacy global query - kept for backward compatibility
 * Note: latency_seconds_seconds_bucket is a gauge, so we don't use rate()
 */
export const QUERY_TOP_DEPENDENCIES_BY_LATENCY = `
topk(5,
  histogram_quantile(0.95,
    sum by (environment, service, remoteService, le) (
      latency_seconds_seconds_bucket{namespace="span_derived"}
    )
  )
)
`;

/**
 * Top Dependencies by Volume (Call Count)
 * Returns top 5 dependencies by call count
 */
export const QUERY_TOP_DEPENDENCIES_BY_VOLUME = `
topk(5,
  sum by (environment, service, remoteService) (
    request
  )
)
`;

/**
 * Top Dependencies by Fault Count
 * Returns top 5 dependencies by fault count
 */
export const QUERY_TOP_DEPENDENCIES_BY_FAULT = `
topk(5,
  sum by (environment, service, remoteService) (
    fault
  )
)
`;

/**
 * Top Services by Fault Rate
 * Returns top 5 services by fault rate percentage
 * Formula: (faults / requests) * 100
 */
export const QUERY_TOP_SERVICES_BY_FAULT_RATE = `
topk(5,
  sum by (environment, service) (fault)
  /
  sum by (environment, service) (request) * 100
)
`;

/**
 * Top Dependencies by Fault Rate - Service-specific
 * Returns top 5 dependencies by fault rate percentage for a specific service
 * @param environment - Environment filter (e.g., "generic:default", "production")
 * @param serviceName - Service name to get dependencies for
 */
export const getQueryTopDependenciesByFaultRate = (
  environment: string,
  serviceName: string
): string => `
topk(5,
  sum by (remoteService) (fault{environment="${environment}",service="${serviceName}",remoteService!=""})
  /
  sum by (remoteService) (request{environment="${environment}",service="${serviceName}",remoteService!=""}) * 100
)
`;

/**
 * Top Dependencies by Fault Rate - Global View
 * Returns top 5 service-to-service dependencies by fault rate percentage across ALL services
 * Groups by environment, service, and remoteService to show the full dependency path
 * Note: Uses remoteService label (camelCase) not remote_service
 */
export const QUERY_TOP_DEPENDENCIES_BY_FAULT_RATE = `
topk(5,
  sum by (environment, service, remoteService) (fault{remoteService!=""})
  /
  sum by (environment, service, remoteService) (request{remoteService!=""}) * 100
)
`;

/**
 * Service Dependency Fault Rate for a specific service
 * Returns top 5 dependencies by fault rate percentage for a given service
 *
 * @param environment - Environment filter (e.g., "production", "generic:default")
 * @param serviceName - Service name to filter
 */
export const QUERY_SERVICE_DEPENDENCY_FAULT_RATE = (
  environment: string,
  serviceName: string
): string => `
topk(5,
  sum by (remoteService) (fault{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""})
  /
  sum by (remoteService) (request{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""}) * 100
)
`;

/**
 * Service Request Rate (RED - Rate)
 * Returns total request count for a service
 */
export const getQueryServiceRequestRate = (environment: string, serviceName: string): string => `
sum(request{environment="${environment}",service="${serviceName}"})
`;

/**
 * Service Error Rate (RED - Errors)
 * Returns error rate percentage for a service
 */
export const getQueryServiceErrorRate = (environment: string, serviceName: string): string => `
sum(error{environment="${environment}",service="${serviceName}"})
/
sum(request{environment="${environment}",service="${serviceName}"})
`;

/**
 * Service Latency P95 (RED - Duration)
 * Returns 95th percentile latency for a service
 * Note: latency_seconds_seconds_bucket is a gauge, so we don't use rate()
 */
export const getQueryServiceLatencyP95 = (environment: string, serviceName: string): string => `
histogram_quantile(0.95,
  sum by (le) (
    latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}"}
  )
)
`;

/**
 * Service Latency P50 (Median)
 * Returns median latency for a service
 * Note: latency_seconds_seconds_bucket is a gauge, so we don't use rate()
 */
export const getQueryServiceLatencyP50 = (environment: string, serviceName: string): string => `
histogram_quantile(0.50,
  sum by (le) (
    latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}"}
  )
)
`;

/**
 * Service Latency P99
 * Returns 99th percentile latency for a service
 * Note: latency_seconds_seconds_bucket is a gauge, so we don't use rate()
 */
export const getQueryServiceLatencyP99 = (environment: string, serviceName: string): string => `
histogram_quantile(0.99,
  sum by (le) (
    latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}"}
  )
)
`;

/**
 * Service Average Latency
 * Returns average latency for a service
 */
export const getQueryServiceLatencyAvg = (environment: string, serviceName: string): string => `
rate(latency_seconds_seconds_sum{environment="${environment}",service="${serviceName}"}[${RATE_INTERVAL}])
/
rate(latency_seconds_seconds_count{environment="${environment}",service="${serviceName}"}[${RATE_INTERVAL}])
`;

/**
 * Query builder for custom time ranges
 * Allows overriding the default 5m rate interval
 */
export const buildQueryWithInterval = (queryTemplate: string, interval: string): string => {
  return queryTemplate.replace(/\[5m\]/g, `[${interval}]`);
};

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
 * Returns top K operations by request count for a given service
 * @param environment - Environment filter
 * @param serviceName - Service name to filter
 * @param limit - Number of top operations to return (default: 5)
 */
export const getQueryTopOperationsByVolume = (
  environment: string,
  serviceName: string,
  limit: number = 5
): string => `
topk(${limit},
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
 * Returns top K service dependencies by specified percentile latency
 * Note: latency_seconds_seconds_bucket is a gauge, so we don't use rate()
 * @param environment - Environment filter
 * @param serviceName - Service name to filter
 * @param percentile - Latency percentile (default: 0.95)
 * @param limit - Number of top dependencies to return (default: 5)
 */
export const getQueryTopDependenciesByLatency = (
  environment: string,
  serviceName: string,
  percentile: number = 0.95,
  limit: number = 5
): string => `
topk(${limit},
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

// ============================================================================
// SERVICE DETAILS PAGE QUERIES
// ============================================================================

/**
 * Service Requests (total count)
 * For metric card display
 */
export const getQueryServiceRequests = (environment: string, serviceName: string): string => `
sum(request{environment="${environment}",service="${serviceName}",namespace="span_derived"})
`;

/**
 * Service Faults (5xx errors)
 * For metric card display
 */
export const getQueryServiceFaults = (environment: string, serviceName: string): string => `
sum(fault{environment="${environment}",service="${serviceName}",namespace="span_derived"})
`;

/**
 * Service Errors (4xx errors)
 * For metric card display
 */
export const getQueryServiceErrors = (environment: string, serviceName: string): string => `
sum(error{environment="${environment}",service="${serviceName}",namespace="span_derived"})
`;

/**
 * Service Availability (percentage of non-faulty requests)
 * For metric card display - single aggregated value
 * Formula: (1 - (faults / requests)) * 100
 */
export const getQueryServiceAvailability = (environment: string, serviceName: string): string => `
(1 - (sum(fault{environment="${environment}",service="${serviceName}",namespace="span_derived"}) / sum(request{environment="${environment}",service="${serviceName}",namespace="span_derived"}))) * 100
`;

/**
 * Service Latency P99
 * For metric card display
 */
export const getQueryServiceLatencyP99Card = (environment: string, serviceName: string): string => `
histogram_quantile(0.99,
  sum by (le) (
    latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived"}
  )
)
`;

/**
 * Service Fault Rate Over Time by Operations
 * For line chart display showing fault rate per operation (top K)
 * @param environment - Environment filter
 * @param serviceName - Service name to filter
 * @param limit - Number of top operations to return (default: 5)
 */
export const getQueryServiceFaultRate = (
  environment: string,
  serviceName: string,
  limit: number = 5
): string => `
topk(${limit},
  sum by (environment, service, operation) (fault{environment="${environment}",service="${serviceName}",namespace="span_derived"})
  /
  clamp_min(sum by (environment, service, operation) (request{environment="${environment}",service="${serviceName}",namespace="span_derived"}), 1)
  * 100
)
or
label_replace(
  sum(fault{environment="${environment}",service="${serviceName}",namespace="span_derived"})
  /
  clamp_min(sum(request{environment="${environment}",service="${serviceName}",namespace="span_derived"}), 1)
  * 100,
  "operation",
  "overall",
  "",
  ""
)
`;

/**
 * Service Error Rate Over Time by Operations
 * For line chart display showing error rate per operation (top K)
 * @param environment - Environment filter
 * @param serviceName - Service name to filter
 * @param limit - Number of top operations to return (default: 5)
 */
export const getQueryServiceErrorRateOverTime = (
  environment: string,
  serviceName: string,
  limit: number = 5
): string => `
topk(${limit},
  sum by (environment, service, operation) (error{environment="${environment}",service="${serviceName}",namespace="span_derived"})
  /
  clamp_min(sum by (environment, service, operation) (request{environment="${environment}",service="${serviceName}",namespace="span_derived"}), 1)
  * 100
)
or
label_replace(
  sum(error{environment="${environment}",service="${serviceName}",namespace="span_derived"})
  /
  clamp_min(sum(request{environment="${environment}",service="${serviceName}",namespace="span_derived"}), 1)
  * 100,
  "operation",
  "overall",
  "",
  ""
)
`;

/**
 * Service Availability by Operations Over Time
 * For line chart display showing availability per operation (bottom K - worst availability)
 * @param environment - Environment filter
 * @param serviceName - Service name to filter
 * @param limit - Number of operations to return (default: 5)
 */
export const getQueryServiceAvailabilityByOperations = (
  environment: string,
  serviceName: string,
  limit: number = 5
): string => `
bottomk(${limit},
  (1 - (
    sum by (environment, service, operation) (fault{environment="${environment}",service="${serviceName}",namespace="span_derived"})
    /
    clamp_min(sum by (environment, service, operation) (request{environment="${environment}",service="${serviceName}",namespace="span_derived"}), 1)
  )) * 100
)
or
label_replace(
  (1 - (
    sum(fault{environment="${environment}",service="${serviceName}",namespace="span_derived"})
    /
    clamp_min(sum(request{environment="${environment}",service="${serviceName}",namespace="span_derived"}), 1)
  )) * 100,
  "operation",
  "overall",
  "",
  ""
)
`;

// ============================================================================
// OPERATION QUERIES (for Operations Tab)
// ============================================================================

/**
 * CONSOLIDATED: Get all operations' fault rates for a service
 */
export const getQueryAllOperationsFaultRate = (
  environment: string,
  serviceName: string
): string => `
(
  sum by (operation) (fault{environment="${environment}",service="${serviceName}",namespace="span_derived"})
  /
  sum by (operation) (request{environment="${environment}",service="${serviceName}",namespace="span_derived"})
)
`;

/**
 * CONSOLIDATED: Get all operations' error rates (4xx) for a service
 */
export const getQueryAllOperationsErrorRate = (
  environment: string,
  serviceName: string
): string => `
(
  sum by (operation) (error{environment="${environment}",service="${serviceName}",namespace="span_derived"})
  /
  sum by (operation) (request{environment="${environment}",service="${serviceName}",namespace="span_derived"})
)
`;

/**
 * CONSOLIDATED: Get all operations' availability for a service
 */
export const getQueryAllOperationsAvailability = (
  environment: string,
  serviceName: string
): string => `
(1 - (
  sum by (operation) (fault{environment="${environment}",service="${serviceName}",namespace="span_derived"})
  /
  sum by (operation) (request{environment="${environment}",service="${serviceName}",namespace="span_derived"})
)) * 100
`;

/**
 * CONSOLIDATED: Get all operations' request counts for a service
 */
export const getQueryAllOperationsRequestCount = (
  environment: string,
  serviceName: string
): string => `
sum by (operation) (request{environment="${environment}",service="${serviceName}",namespace="span_derived"})
`;

/**
 * CONSOLIDATED: Get all operations' P50 latency for a service
 */
export const getQueryAllOperationsLatencyP50 = (
  environment: string,
  serviceName: string
): string => `
histogram_quantile(0.50,
  sum by (operation, le) (
    latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived"}
  )
)
`;

/**
 * CONSOLIDATED: Get all operations' P90 latency for a service
 */
export const getQueryAllOperationsLatencyP90 = (
  environment: string,
  serviceName: string
): string => `
histogram_quantile(0.90,
  sum by (operation, le) (
    latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived"}
  )
)
`;

/**
 * CONSOLIDATED: Get all operations' P99 latency for a service
 */
export const getQueryAllOperationsLatencyP99 = (
  environment: string,
  serviceName: string
): string => `
histogram_quantile(0.99,
  sum by (operation, le) (
    latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived"}
  )
)
`;

/**
 * COMBINED: Operation Requests and Availability Over Time
 * For expandable row charts
 */
export const getQueryOperationRequestsAndAvailabilityOverTime = (
  environment: string,
  serviceName: string,
  operation: string
): string => `
label_replace(
  sum(request{environment="${environment}",service="${serviceName}",operation="${operation}",namespace="span_derived"}),
  "metric_type", "Requests", "", ""
)
or
label_replace(
  (
    1 - (
      sum(fault{environment="${environment}",service="${serviceName}",operation="${operation}",namespace="span_derived"})
      /
      sum(request{environment="${environment}",service="${serviceName}",operation="${operation}",namespace="span_derived"})
    )
  ) * 100,
  "metric_type", "Availability (%)", "", ""
)
`;

/**
 * COMBINED: Operation Faults and Errors Over Time
 * For expandable row charts
 */
export const getQueryOperationFaultsAndErrorsOverTime = (
  environment: string,
  serviceName: string,
  operation: string
): string => `
label_replace(
  (
    sum(fault{environment="${environment}",service="${serviceName}",operation="${operation}",namespace="span_derived"})
    /
    sum(request{environment="${environment}",service="${serviceName}",operation="${operation}",namespace="span_derived"})
  ) * 100,
  "rate_type", "Fault rate (5xx)", "", ""
)
or
label_replace(
  (
    sum(error{environment="${environment}",service="${serviceName}",operation="${operation}",namespace="span_derived"})
    /
    sum(request{environment="${environment}",service="${serviceName}",operation="${operation}",namespace="span_derived"})
  ) * 100,
  "rate_type", "Error rate (4xx)", "", ""
)
`;

/**
 * COMBINED: Operation Latency Percentiles Over Time
 * For expandable row charts
 */
export const getQueryOperationLatencyPercentilesOverTime = (
  environment: string,
  serviceName: string,
  operation: string
): string => `
label_replace(
  histogram_quantile(0.50,
    sum by (le) (
      latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",operation="${operation}",namespace="span_derived"}
    )
  ),
  "percentile",
  "p50",
  "",
  ""
)
or
label_replace(
  histogram_quantile(0.90,
    sum by (le) (
      latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",operation="${operation}",namespace="span_derived"}
    )
  ),
  "percentile",
  "p90",
  "",
  ""
)
or
label_replace(
  histogram_quantile(0.99,
    sum by (le) (
      latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",operation="${operation}",namespace="span_derived"}
    )
  ),
  "percentile",
  "p99",
  "",
  ""
)
`;

// ============================================================================
// DEPENDENCY QUERIES (for Dependencies Tab)
// ============================================================================

/**
 * CONSOLIDATED: Get all dependencies' fault rates for a service
 */
export const getQueryAllDependenciesFaultRate = (
  environment: string,
  serviceName: string
): string => `
(
  sum by (remoteService, operation, remoteOperation) (fault{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""})
  /
  sum by (remoteService, operation, remoteOperation) (request{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""})
)
`;

/**
 * CONSOLIDATED: Get all dependencies' error rates for a service
 */
export const getQueryAllDependenciesErrorRate = (
  environment: string,
  serviceName: string
): string => `
(
  sum by (remoteService, operation, remoteOperation) (error{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""})
  /
  sum by (remoteService, operation, remoteOperation) (request{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""})
)
`;

/**
 * CONSOLIDATED: Get all dependencies' availability for a service
 */
export const getQueryAllDependenciesAvailability = (
  environment: string,
  serviceName: string
): string => `
(1 - (
  sum by (remoteService, operation, remoteOperation) (fault{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""})
  /
  sum by (remoteService, operation, remoteOperation) (request{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""})
)) * 100
`;

/**
 * CONSOLIDATED: Get all dependencies' p50 latency for a service
 */
export const getQueryAllDependenciesLatencyP50 = (
  environment: string,
  serviceName: string
): string => `
histogram_quantile(0.50,
  sum by (remoteService, operation, remoteOperation, le) (
    latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""}
  )
)
`;

/**
 * CONSOLIDATED: Get all dependencies' p90 latency for a service
 */
export const getQueryAllDependenciesLatencyP90 = (
  environment: string,
  serviceName: string
): string => `
histogram_quantile(0.90,
  sum by (remoteService, operation, remoteOperation, le) (
    latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""}
  )
)
`;

/**
 * CONSOLIDATED: Get all dependencies' p99 latency for a service
 */
export const getQueryAllDependenciesLatencyP99 = (
  environment: string,
  serviceName: string
): string => `
histogram_quantile(0.99,
  sum by (remoteService, operation, remoteOperation, le) (
    latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""}
  )
)
`;

/**
 * CONSOLIDATED: Get all dependencies' request counts for a service
 */
export const getQueryAllDependenciesRequestCount = (
  environment: string,
  serviceName: string
): string => `
sum by (remoteService, remoteOperation) (
  request{environment="${environment}",service="${serviceName}",remoteService!="",namespace="span_derived"}
)
`;

/**
 * Get requests and availability over time for a specific dependency
 * For expandable row charts
 */
export const getQueryDependencyRequestsAndAvailabilityOverTime = (
  environment: string,
  serviceName: string,
  remoteService: string,
  remoteOperation: string
): string => `
label_replace(
  sum(request{environment="${environment}",service="${serviceName}",remoteService="${remoteService}",remoteOperation="${remoteOperation}",namespace="span_derived",remoteService!=""}),
  "metric", "Requests", "", ""
)
or
label_replace(
  (1 - (
    sum(fault{environment="${environment}",service="${serviceName}",remoteService="${remoteService}",remoteOperation="${remoteOperation}",namespace="span_derived",remoteService!=""})
    /
    sum(request{environment="${environment}",service="${serviceName}",remoteService="${remoteService}",remoteOperation="${remoteOperation}",namespace="span_derived",remoteService!=""})
  )) * 100,
  "metric", "Availability (%)", "", ""
)
`;

/**
 * Get faults and errors over time for a specific dependency
 * For expandable row charts
 */
export const getQueryDependencyFaultsAndErrorsOverTime = (
  environment: string,
  serviceName: string,
  remoteService: string,
  remoteOperation: string
): string => `
label_replace(
  (
    sum(fault{environment="${environment}",service="${serviceName}",remoteService="${remoteService}",remoteOperation="${remoteOperation}",namespace="span_derived",remoteService!=""})
    /
    sum(request{environment="${environment}",service="${serviceName}",remoteService="${remoteService}",remoteOperation="${remoteOperation}",namespace="span_derived",remoteService!=""})
  ) * 100,
  "metric", "Fault Rate (%)", "", ""
)
or
label_replace(
  (
    sum(error{environment="${environment}",service="${serviceName}",remoteService="${remoteService}",remoteOperation="${remoteOperation}",namespace="span_derived",remoteService!=""})
    /
    sum(request{environment="${environment}",service="${serviceName}",remoteService="${remoteService}",remoteOperation="${remoteOperation}",namespace="span_derived",remoteService!=""})
  ) * 100,
  "metric", "Error Rate (%)", "", ""
)
`;

/**
 * Get latency percentiles over time for a specific dependency
 * For expandable row charts
 */
export const getQueryDependencyLatencyPercentilesOverTime = (
  environment: string,
  serviceName: string,
  remoteService: string,
  remoteOperation: string
): string => `
label_replace(
  histogram_quantile(0.50,
    sum by (le) (
      latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",remoteService="${remoteService}",remoteOperation="${remoteOperation}",namespace="span_derived",remoteService!=""}
    )
  ) * 1000,
  "metric", "p50", "", ""
)
or
label_replace(
  histogram_quantile(0.90,
    sum by (le) (
      latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",remoteService="${remoteService}",remoteOperation="${remoteOperation}",namespace="span_derived",remoteService!=""}
    )
  ) * 1000,
  "metric", "p90", "", ""
)
or
label_replace(
  histogram_quantile(0.99,
    sum by (le) (
      latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",remoteService="${remoteService}",remoteOperation="${remoteOperation}",namespace="span_derived",remoteService!=""}
    )
  ) * 1000,
  "metric", "p99", "", ""
)
`;

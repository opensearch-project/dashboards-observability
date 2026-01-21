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
 * Top Dependencies by Latency - for specific service
 * Returns top K service dependencies by specified percentile latency
 * Note: latency_seconds_seconds_bucket is a gauge, so we don't use rate()
 * Returns milliseconds
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
      latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""}
    )
  ) * 1000
)
or
label_replace(
  histogram_quantile(${percentile},
    sum by (le) (
      latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived"}
    )
  ) * 1000,
  "remoteService",
  "overall",
  "",
  ""
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
 * Top Services by Fault Rate over time range
 * Uses sum_over_time for accurate total rate calculation
 * @param timeRange - Time range (e.g., "1h", "24h")
 * @param limit - Number of top services (default: 5)
 */
export const getQueryTopServicesByFaultRateAvg = (timeRange: string, limit: number = 5): string => `
topk(${limit},
  (
    sum by (environment, service) (sum_over_time(fault{namespace="span_derived"}[${timeRange}:1m]))
    /
    sum by (environment, service) (sum_over_time(request{namespace="span_derived"}[${timeRange}:1m]))
  ) * 100
)
`;

/**
 * Top Dependencies by Fault Rate over time range - Global view
 * @param timeRange - Time range (e.g., "1h", "24h")
 * @param limit - Number of top dependencies (default: 5)
 */
export const getQueryTopDependenciesByFaultRateAvg = (
  timeRange: string,
  limit: number = 5
): string => `
topk(${limit},
  (
    sum by (environment, service, remoteService) (sum_over_time(fault{remoteService!="",namespace="span_derived"}[${timeRange}:1m]))
    /
    sum by (environment, service, remoteService) (sum_over_time(request{remoteService!="",namespace="span_derived"}[${timeRange}:1m]))
  ) * 100
)
`;

/**
 * Top Dependencies by Fault Rate - Service-specific
 * @param environment - Environment filter
 * @param serviceName - Service name
 * @param timeRange - Time range (e.g., "1h", "24h")
 */
export const getQueryServiceDependenciesByFaultRateAvg = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
topk(5,
  (
    sum by (remoteService) (sum_over_time(fault{environment="${environment}",service="${serviceName}",remoteService!="",namespace="span_derived"}[${timeRange}:1m]))
    /
    sum by (remoteService) (sum_over_time(request{environment="${environment}",service="${serviceName}",remoteService!="",namespace="span_derived"}[${timeRange}:1m]))
  ) * 100
)
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
 * Service Fault Rate (5xx) as percentage
 * For metric card display
 * Formula: (faults / requests) * 100
 */
export const getQueryServiceFaultRateCard = (environment: string, serviceName: string): string => `
(
  sum(fault{environment="${environment}",service="${serviceName}",namespace="span_derived"})
  /
  sum(request{environment="${environment}",service="${serviceName}",namespace="span_derived"})
) * 100
`;

/**
 * Service Error Rate (4xx) as percentage
 * For metric card display
 * Formula: (errors / requests) * 100
 */
export const getQueryServiceErrorRateCard = (environment: string, serviceName: string): string => `
(
  sum(error{environment="${environment}",service="${serviceName}",namespace="span_derived"})
  /
  sum(request{environment="${environment}",service="${serviceName}",namespace="span_derived"})
) * 100
`;

/**
 * Service Latency P99
 * For metric card display
 * Returns milliseconds
 */
export const getQueryServiceLatencyP99Card = (environment: string, serviceName: string): string => `
histogram_quantile(0.99,
  sum by (le) (
    latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived"}
  )
) * 1000
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
 * Returns percentage (0-100)
 */
export const getQueryAllOperationsFaultRate = (
  environment: string,
  serviceName: string
): string => `
(
  sum by (operation) (fault{environment="${environment}",service="${serviceName}",namespace="span_derived"})
  /
  sum by (operation) (request{environment="${environment}",service="${serviceName}",namespace="span_derived"})
) * 100
`;

/**
 * CONSOLIDATED: Get all operations' error rates (4xx) for a service
 * Returns percentage (0-100)
 */
export const getQueryAllOperationsErrorRate = (
  environment: string,
  serviceName: string
): string => `
(
  sum by (operation) (error{environment="${environment}",service="${serviceName}",namespace="span_derived"})
  /
  sum by (operation) (request{environment="${environment}",service="${serviceName}",namespace="span_derived"})
) * 100
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
 * CONSOLIDATED: Get all operations' request counts for a service (instant query)
 */
export const getQueryAllOperationsRequestCount = (
  environment: string,
  serviceName: string
): string => `
sum by (operation) (request{environment="${environment}",service="${serviceName}",namespace="span_derived"})
`;

/**
 * CONSOLIDATED: Get all operations' total request counts over time range
 * Uses sum_over_time for true total count
 */
export const getQueryAllOperationsRequestCountTotal = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
sum by (operation) (
  sum_over_time(request{environment="${environment}",service="${serviceName}",namespace="span_derived"}[${timeRange}:1m])
)
`;

/**
 * CONSOLIDATED: Get all operations' error rate over time range
 * Uses sum_over_time for accurate total rate calculation
 */
export const getQueryAllOperationsErrorRateAvg = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
(
  sum by (operation) (sum_over_time(error{environment="${environment}",service="${serviceName}",namespace="span_derived"}[${timeRange}:1m]))
  /
  sum by (operation) (sum_over_time(request{environment="${environment}",service="${serviceName}",namespace="span_derived"}[${timeRange}:1m]))
) * 100
`;

/**
 * CONSOLIDATED: Get all operations' availability over time range
 * Uses sum_over_time for accurate total rate calculation
 */
export const getQueryAllOperationsAvailabilityAvg = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
(1 - (
  sum by (operation) (sum_over_time(fault{environment="${environment}",service="${serviceName}",namespace="span_derived"}[${timeRange}:1m]))
  /
  sum by (operation) (sum_over_time(request{environment="${environment}",service="${serviceName}",namespace="span_derived"}[${timeRange}:1m]))
)) * 100
`;

/**
 * CONSOLIDATED: Get all operations' P50 latency for a service
 * Returns average P50 latency over the time range in milliseconds
 */
export const getQueryAllOperationsLatencyP50 = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
avg_over_time(
  histogram_quantile(0.50,
    sum by (operation, le) (
      latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived"}
    )
  )[${timeRange}:1m]
) * 1000
`;

/**
 * CONSOLIDATED: Get all operations' P90 latency for a service
 * Returns average P90 latency over the time range in milliseconds
 */
export const getQueryAllOperationsLatencyP90 = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
avg_over_time(
  histogram_quantile(0.90,
    sum by (operation, le) (
      latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived"}
    )
  )[${timeRange}:1m]
) * 1000
`;

/**
 * CONSOLIDATED: Get all operations' P99 latency for a service
 * Returns average P99 latency over the time range in milliseconds
 */
export const getQueryAllOperationsLatencyP99 = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
avg_over_time(
  histogram_quantile(0.99,
    sum by (operation, le) (
      latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived"}
    )
  )[${timeRange}:1m]
) * 1000
`;

/**
 * Operation Requests Over Time
 * For expandable row charts
 */
export const getQueryOperationRequestsOverTime = (
  environment: string,
  serviceName: string,
  operation: string
): string => `
sum(request{environment="${environment}",service="${serviceName}",operation="${operation}",namespace="span_derived"})
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
 * Returns milliseconds
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
  ) * 1000,
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
  ) * 1000,
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
  ) * 1000,
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
 * Returns percentage (0-100)
 */
export const getQueryAllDependenciesFaultRate = (
  environment: string,
  serviceName: string
): string => `
(
  sum by (remoteService, operation, remoteOperation) (fault{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""})
  /
  sum by (remoteService, operation, remoteOperation) (request{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""})
) * 100
`;

/**
 * CONSOLIDATED: Get all dependencies' error rates for a service
 * Returns percentage (0-100)
 */
export const getQueryAllDependenciesErrorRate = (
  environment: string,
  serviceName: string
): string => `
(
  sum by (remoteService, operation, remoteOperation) (error{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""})
  /
  sum by (remoteService, operation, remoteOperation) (request{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""})
) * 100
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
 * Returns average P50 latency over the time range in milliseconds
 */
export const getQueryAllDependenciesLatencyP50 = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
avg_over_time(
  histogram_quantile(0.50,
    sum by (remoteService, operation, remoteOperation, le) (
      latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""}
    )
  )[${timeRange}:1m]
) * 1000
`;

/**
 * CONSOLIDATED: Get all dependencies' p90 latency for a service
 * Returns average P90 latency over the time range in milliseconds
 */
export const getQueryAllDependenciesLatencyP90 = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
avg_over_time(
  histogram_quantile(0.90,
    sum by (remoteService, operation, remoteOperation, le) (
      latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""}
    )
  )[${timeRange}:1m]
) * 1000
`;

/**
 * CONSOLIDATED: Get all dependencies' p99 latency for a service
 * Returns average P99 latency over the time range in milliseconds
 */
export const getQueryAllDependenciesLatencyP99 = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
avg_over_time(
  histogram_quantile(0.99,
    sum by (remoteService, operation, remoteOperation, le) (
      latency_seconds_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""}
    )
  )[${timeRange}:1m]
) * 1000
`;

/**
 * CONSOLIDATED: Get all dependencies' request counts for a service (instant query)
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
 * CONSOLIDATED: Get all dependencies' total request counts over time range
 * Uses sum_over_time for true total count
 */
export const getQueryAllDependenciesRequestCountTotal = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
sum by (remoteService, remoteOperation) (
  sum_over_time(request{environment="${environment}",service="${serviceName}",remoteService!="",namespace="span_derived"}[${timeRange}:1m])
)
`;

/**
 * CONSOLIDATED: Get all dependencies' error rate over time range
 * Uses sum_over_time for accurate total rate calculation
 */
export const getQueryAllDependenciesErrorRateAvg = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
(
  sum by (remoteService, remoteOperation) (sum_over_time(error{environment="${environment}",service="${serviceName}",remoteService!="",namespace="span_derived"}[${timeRange}:1m]))
  /
  sum by (remoteService, remoteOperation) (sum_over_time(request{environment="${environment}",service="${serviceName}",remoteService!="",namespace="span_derived"}[${timeRange}:1m]))
) * 100
`;

/**
 * CONSOLIDATED: Get all dependencies' availability over time range
 * Uses sum_over_time for accurate total rate calculation
 */
export const getQueryAllDependenciesAvailabilityAvg = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
(1 - (
  sum by (remoteService, remoteOperation) (sum_over_time(fault{environment="${environment}",service="${serviceName}",remoteService!="",namespace="span_derived"}[${timeRange}:1m]))
  /
  sum by (remoteService, remoteOperation) (sum_over_time(request{environment="${environment}",service="${serviceName}",remoteService!="",namespace="span_derived"}[${timeRange}:1m]))
)) * 100
`;

/**
 * Dependency Requests Over Time
 * For expandable row charts
 */
export const getQueryDependencyRequestsOverTime = (
  environment: string,
  serviceName: string,
  remoteService: string,
  remoteOperation: string
): string => `
sum(request{environment="${environment}",service="${serviceName}",remoteService="${remoteService}",remoteOperation="${remoteOperation}",namespace="span_derived",remoteService!=""})
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

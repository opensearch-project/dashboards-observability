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
 * - latency_seconds_bucket: Histogram buckets for latency
 * - latency_seconds_count: Count of latency observations
 * - latency_seconds_sum: Sum of latency values
 * - latency_seconds_max: Maximum latency
 * - latency_seconds_min: Minimum latency
 *
 * Common labels: service, environment, operation, remoteService
 *
 * Span kind distinction (from Data Prepper ApmServiceMapMetricsUtil):
 * - SERVER span metrics: namespace, environment, service, operation (remoteService absent/empty)
 * - CLIENT span metrics: all above + remoteEnvironment, remoteService, remoteOperation
 *
 * Node-level queries filter with remoteService="" to select only SERVER (incoming) span metrics,
 * showing the load a service handles rather than the calls it makes.
 * Edge/dependency queries filter with remoteService!="" or remoteService="target" for CLIENT spans.
 */

// ============================================================================
// SERVICES HOME PAGE QUERIES
// ============================================================================

/**
 * Services throughput over time — grouped by service
 * @param serviceFilter - Service filter regex (e.g., service=~"svc1|svc2")
 * @page Services Home — Throughput sparkline column
 */
export const getQueryServicesThroughput = (serviceFilter: string): string =>
  `
sum by (service) (
  request{${serviceFilter},remoteService="",namespace="span_derived"}
)
`.trim();

/**
 * Services total request count over a time range — grouped by service
 * Uses sum_over_time to count actual TSDB samples (immune to stale lookback inflation).
 * @param serviceFilter - Service filter regex (e.g., service=~"svc1|svc2")
 * @param timeRange - Prometheus duration string (e.g., "15m", "1h")
 * @page Services Home — avgThroughput calculation
 */
export const getQueryServicesThroughputTotal = (serviceFilter: string, timeRange: string): string =>
  `
sum by (service) (
  sum_over_time(request{${serviceFilter},remoteService="",namespace="span_derived"}[${timeRange}])
)
`.trim();

/**
 * Services failure ratio over time — (error + fault) / request * 100
 * @param serviceFilter - Service filter regex (e.g., service=~"svc1|svc2")
 * @page Services Home — Failure ratio sparkline column
 */
export const getQueryServicesFailureRatio = (serviceFilter: string): string =>
  `
(
  sum by (service) (error{${serviceFilter},remoteService="",namespace="span_derived"})
  +
  sum by (service) (fault{${serviceFilter},remoteService="",namespace="span_derived"})
)
/
clamp_min(sum by (service) (request{${serviceFilter},remoteService="",namespace="span_derived"}), 1)
* 100
`.trim();

/**
 * Services latency percentile over time — grouped by service
 * @param serviceFilter - Service filter regex (e.g., service=~"svc1|svc2")
 * @param percentile - Percentile value (0.5, 0.9, 0.99)
 * @page Services Home — Latency sparkline column
 */
export const getQueryServicesLatency = (serviceFilter: string, percentile: number): string =>
  `
histogram_quantile(${percentile},
  sum by (service, le) (
    latency_seconds_bucket{${serviceFilter},remoteService="",namespace="span_derived"}
  )
) * 1000
`.trim();

/**
 * Top Operations by Volume (Request Count) - for specific service
 * Returns top K operations by request count for a given service
 * @param environment - Environment filter
 * @param serviceName - Service name to filter
 * @param limit - Number of top operations to return (default: 5)
 * @page Service Overview — Top operations chart
 */
export const getQueryTopOperationsByVolume = (
  environment: string,
  serviceName: string,
  limit: number = 5,
  window?: string
): string => {
  const metric = window
    ? `sum_over_time(request{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}[${window}])`
    : `request{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}`;
  return `
topk(${limit},
  sum by (operation) (
    ${metric}
  )
)
or
label_replace(
  sum(${metric}),
  "operation",
  "overall",
  "",
  ""
)
`;
};

/**
 * Top Dependencies by Latency - for specific service
 * Returns top K service dependencies by specified percentile latency
 * Note: latency_seconds_bucket is a gauge, so we don't use rate()
 * Returns milliseconds
 * @param environment - Environment filter
 * @param serviceName - Service name to filter
 * @param percentile - Latency percentile (default: 0.95)
 * @param limit - Number of top dependencies to return (default: 5)
 * @page Service Overview — Top dependencies by latency chart
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
      latency_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""}
    )
  ) * 1000
)
or
label_replace(
  histogram_quantile(${percentile},
    sum by (le) (
      latency_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived"}
    )
  ) * 1000,
  "remoteService",
  "overall",
  "",
  ""
)
`;

/**
 * Top Services by Fault Rate over time range
 * Uses sum_over_time for accurate total rate calculation
 * @param timeRange - Time range (e.g., "1h", "24h")
 * @param limit - Number of top services (default: 5)
 * @page Services Home — Top Services by Fault Rate widget
 * @page Service Overview — Top Services by Fault Rate widget
 */
export const getQueryTopServicesByFaultRateAvg = (timeRange: string, limit: number = 5): string => `
topk(${limit},
  (
    sum by (environment, service) (sum_over_time(fault{remoteService="",namespace="span_derived"}[${timeRange}]))
    /
    clamp_min(sum by (environment, service) (sum_over_time(request{remoteService="",namespace="span_derived"}[${timeRange}])), 1)
  ) * 100
)
`;

/**
 * Top Dependencies by Fault Rate over time range - Global view
 * @param timeRange - Time range (e.g., "1h", "24h")
 * @param limit - Number of top dependencies (default: 5)
 * @page Services Home — Top Dependencies by Fault Rate widget
 * @page Service Overview — Top Dependencies by Fault Rate widget
 */
export const getQueryTopDependenciesByFaultRateAvg = (
  timeRange: string,
  limit: number = 5
): string => `
topk(${limit},
  (
    sum by (environment, service, remoteService) (sum_over_time(fault{remoteService!="",namespace="span_derived"}[${timeRange}]))
    /
    clamp_min(sum by (environment, service, remoteService) (sum_over_time(request{remoteService!="",namespace="span_derived"}[${timeRange}])), 1)
  ) * 100
)
`;

/**
 * Top Dependencies by Fault Rate - Service-specific
 * @param environment - Environment filter
 * @param serviceName - Service name
 * @param timeRange - Time range (e.g., "1h", "24h")
 * @page Services Home — Service Dependencies by Fault Rate widget
 * @page Service Overview — Service Dependencies by Fault Rate widget
 */
export const getQueryServiceDependenciesByFaultRateAvg = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
topk(5,
  (
    sum by (remoteService) (sum_over_time(fault{environment="${environment}",service="${serviceName}",remoteService!="",namespace="span_derived"}[${timeRange}]))
    /
    clamp_min(sum by (remoteService) (sum_over_time(request{environment="${environment}",service="${serviceName}",remoteService!="",namespace="span_derived"}[${timeRange}])), 1)
  ) * 100
)
`;

// ============================================================================
// SERVICE DETAILS PAGE QUERIES
// ============================================================================

/**
 * Service Requests (total count)
 * For metric card display
 * @page Service Overview — Requests metric card
 * @page App Map Node Flyout — Requests chart
 */
export const getQueryServiceRequests = (
  environment: string,
  serviceName: string,
  window?: string
): string =>
  window
    ? `sum(sum_over_time(request{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}[${window}]))`
    : `sum(request{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"})`;

/**
 * Service Faults (5xx errors)
 * For metric card display
 * @page App Map Node Flyout — Faults chart
 */
export const getQueryServiceFaults = (
  environment: string,
  serviceName: string,
  window?: string
): string =>
  window
    ? `sum(sum_over_time(fault{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}[${window}]))`
    : `sum(fault{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"})`;

/**
 * Service Errors (4xx errors)
 * For metric card display
 * @page App Map Node Flyout — Errors chart
 */
export const getQueryServiceErrors = (
  environment: string,
  serviceName: string,
  window?: string
): string =>
  window
    ? `sum(sum_over_time(error{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}[${window}]))`
    : `sum(error{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"})`;

/**
 * Service Availability (percentage of non-faulty requests)
 * For metric card display - single aggregated value
 * Formula: (1 - (faults / requests)) * 100
 * @page Service Overview — Availability metric card
 */
export const getQueryServiceAvailability = (environment: string, serviceName: string): string => `
(1 - (sum(fault{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}) / clamp_min(sum(request{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}), 1))) * 100
`;

/**
 * Service Fault Rate (5xx) as percentage
 * For metric card display
 * Formula: (faults / requests) * 100
 * @page Service Overview — Fault rate metric card
 */
export const getQueryServiceFaultRateCard = (environment: string, serviceName: string): string => `
(
  sum(fault{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"})
  /
  clamp_min(sum(request{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}), 1)
) * 100
`;

/**
 * Service Error Rate (4xx) as percentage
 * For metric card display
 * Formula: (errors / requests) * 100
 * @page Service Overview — Error rate metric card
 */
export const getQueryServiceErrorRateCard = (environment: string, serviceName: string): string => `
(
  sum(error{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"})
  /
  clamp_min(sum(request{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}), 1)
) * 100
`;

/**
 * Service Latency P99
 * For metric card display
 * Returns milliseconds
 * @page Service Overview — P99 latency metric card
 */
export const getQueryServiceLatencyP99Card = (environment: string, serviceName: string): string => `
histogram_quantile(0.99,
  sum by (le) (
    latency_seconds_bucket{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}
  )
) * 1000
`;

/**
 * Service Fault Rate Over Time by Operations
 * For line chart display showing fault rate per operation (top K)
 * @param environment - Environment filter
 * @param serviceName - Service name to filter
 * @param limit - Number of top operations to return (default: 5)
 * @page Service Overview — Fault rate over time chart
 */
export const getQueryServiceFaultRate = (
  environment: string,
  serviceName: string,
  limit: number = 5
): string => `
topk(${limit},
  sum by (environment, service, operation) (fault{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"})
  /
  clamp_min(sum by (environment, service, operation) (request{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}), 1)
  * 100
)
or
label_replace(
  sum(fault{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"})
  /
  clamp_min(sum(request{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}), 1)
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
 * @page Service Overview — Error rate over time chart
 */
export const getQueryServiceErrorRateOverTime = (
  environment: string,
  serviceName: string,
  limit: number = 5
): string => `
topk(${limit},
  sum by (environment, service, operation) (error{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"})
  /
  clamp_min(sum by (environment, service, operation) (request{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}), 1)
  * 100
)
or
label_replace(
  sum(error{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"})
  /
  clamp_min(sum(request{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}), 1)
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
 * @page Service Overview — Availability by operations chart
 */
export const getQueryServiceAvailabilityByOperations = (
  environment: string,
  serviceName: string,
  limit: number = 5
): string => `
bottomk(${limit},
  (1 - (
    sum by (environment, service, operation) (fault{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"})
    /
    clamp_min(sum by (environment, service, operation) (request{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}), 1)
  )) * 100
)
or
label_replace(
  (1 - (
    sum(fault{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"})
    /
    clamp_min(sum(request{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}), 1)
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
 * @page Service Operations — Operations table fault rate column (via useOperationMetrics hook)
 */
export const getQueryAllOperationsFaultRate = (
  environment: string,
  serviceName: string
): string => `
(
  sum by (operation) (fault{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"})
  /
  clamp_min(sum by (operation) (request{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}), 1)
) * 100
`;

/**
 * CONSOLIDATED: Get all operations' total request counts over time range
 * Uses sum_over_time for true total count
 * @page Service Operations — Operations table request count column (via useOperationMetrics hook)
 */
export const getQueryAllOperationsRequestCountTotal = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
sum by (operation) (
  sum_over_time(request{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}[${timeRange}])
)
`;

/**
 * CONSOLIDATED: Get all operations' error rate over time range
 * Uses sum_over_time for accurate total rate calculation
 * @page Service Operations — Operations table error rate column (via useOperationMetrics hook)
 */
export const getQueryAllOperationsErrorRateAvg = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
(
  sum by (operation) (sum_over_time(error{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}[${timeRange}]))
  /
  clamp_min(sum by (operation) (sum_over_time(request{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}[${timeRange}])), 1)
) * 100
`;

/**
 * CONSOLIDATED: Get all operations' availability over time range
 * Uses sum_over_time for accurate total rate calculation
 * @page Service Operations — Operations table availability column (via useOperationMetrics hook)
 */
export const getQueryAllOperationsAvailabilityAvg = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
(1 - (
  sum by (operation) (sum_over_time(fault{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}[${timeRange}]))
  /
  clamp_min(sum by (operation) (sum_over_time(request{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}[${timeRange}])), 1)
)) * 100
`;

/**
 * CONSOLIDATED: Get all operations' latency percentiles (P50, P90, P99) for a service
 * Aggregates buckets with sum_over_time first, then computes histogram_quantile once per percentile.
 * Returns milliseconds. Results are labeled with a "percentile" label (p50, p90, p99).
 * @page Service Operations — Operations table P50/P90/P99 columns (via useOperationMetrics hook)
 */
export const getQueryAllOperationsLatencyPercentiles = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
label_replace(
  histogram_quantile(0.50,
    sum by (operation, le) (
      sum_over_time(latency_seconds_bucket{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}[${timeRange}])
    )
  ) * 1000,
  "percentile", "p50", "", ""
)
or
label_replace(
  histogram_quantile(0.90,
    sum by (operation, le) (
      sum_over_time(latency_seconds_bucket{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}[${timeRange}])
    )
  ) * 1000,
  "percentile", "p90", "", ""
)
or
label_replace(
  histogram_quantile(0.99,
    sum by (operation, le) (
      sum_over_time(latency_seconds_bucket{environment="${environment}",service="${serviceName}",remoteService="",namespace="span_derived"}[${timeRange}])
    )
  ) * 1000,
  "percentile", "p99", "", ""
)
`;

/**
 * Operation Requests Over Time
 * For expandable row charts
 * @page Service Operations — Expandable row requests chart
 */
export const getQueryOperationRequestsOverTime = (
  environment: string,
  serviceName: string,
  operation: string,
  window?: string
): string =>
  window
    ? `sum(sum_over_time(request{environment="${environment}",service="${serviceName}",operation="${operation}",remoteService="",namespace="span_derived"}[${window}]))`
    : `sum(request{environment="${environment}",service="${serviceName}",operation="${operation}",remoteService="",namespace="span_derived"})`;

/**
 * COMBINED: Operation Faults and Errors Over Time
 * For expandable row charts
 * @page Service Operations — Expandable row faults/errors chart
 */
export const getQueryOperationFaultsAndErrorsOverTime = (
  environment: string,
  serviceName: string,
  operation: string
): string => `
label_replace(
  (
    sum(fault{environment="${environment}",service="${serviceName}",operation="${operation}",remoteService="",namespace="span_derived"})
    /
    clamp_min(sum(request{environment="${environment}",service="${serviceName}",operation="${operation}",remoteService="",namespace="span_derived"}), 1)
  ) * 100,
  "rate_type", "Fault rate (5xx)", "", ""
)
or
label_replace(
  (
    sum(error{environment="${environment}",service="${serviceName}",operation="${operation}",remoteService="",namespace="span_derived"})
    /
    clamp_min(sum(request{environment="${environment}",service="${serviceName}",operation="${operation}",remoteService="",namespace="span_derived"}), 1)
  ) * 100,
  "rate_type", "Error rate (4xx)", "", ""
)
`;

/**
 * COMBINED: Operation Latency Percentiles Over Time
 * For expandable row charts
 * Returns milliseconds
 * @page Service Operations — Expandable row latency chart
 */
export const getQueryOperationLatencyPercentilesOverTime = (
  environment: string,
  serviceName: string,
  operation: string
): string => `
label_replace(
  histogram_quantile(0.50,
    sum by (le) (
      latency_seconds_bucket{environment="${environment}",service="${serviceName}",operation="${operation}",remoteService="",namespace="span_derived"}
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
      latency_seconds_bucket{environment="${environment}",service="${serviceName}",operation="${operation}",remoteService="",namespace="span_derived"}
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
      latency_seconds_bucket{environment="${environment}",service="${serviceName}",operation="${operation}",remoteService="",namespace="span_derived"}
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
 * @page Service Dependencies — Dependencies table fault rate column (via useDependencyMetrics hook)
 */
export const getQueryAllDependenciesFaultRate = (
  environment: string,
  serviceName: string
): string => `
(
  sum by (remoteService, operation, remoteOperation) (fault{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""})
  /
  clamp_min(sum by (remoteService, operation, remoteOperation) (request{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""}), 1)
) * 100
`;

/**
 * CONSOLIDATED: Get all dependencies' latency percentiles (P50, P90, P99) for a service
 * Aggregates buckets with sum_over_time first, then computes histogram_quantile once per percentile.
 * Returns milliseconds. Results are labeled with a "percentile" label (p50, p90, p99).
 * @page Service Dependencies — Dependencies table P50/P90/P99 columns (via useDependencyMetrics hook)
 */
export const getQueryAllDependenciesLatencyPercentiles = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
label_replace(
  histogram_quantile(0.50,
    sum by (remoteService, operation, remoteOperation, le) (
      sum_over_time(latency_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""}[${timeRange}])
    )
  ) * 1000,
  "percentile", "p50", "", ""
)
or
label_replace(
  histogram_quantile(0.90,
    sum by (remoteService, operation, remoteOperation, le) (
      sum_over_time(latency_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""}[${timeRange}])
    )
  ) * 1000,
  "percentile", "p90", "", ""
)
or
label_replace(
  histogram_quantile(0.99,
    sum by (remoteService, operation, remoteOperation, le) (
      sum_over_time(latency_seconds_bucket{environment="${environment}",service="${serviceName}",namespace="span_derived",remoteService!=""}[${timeRange}])
    )
  ) * 1000,
  "percentile", "p99", "", ""
)
`;

/**
 * CONSOLIDATED: Get all dependencies' total request counts over time range
 * Uses sum_over_time for true total count
 * @page Service Dependencies — Dependencies table request count column (via useDependencyMetrics hook)
 */
export const getQueryAllDependenciesRequestCountTotal = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
sum by (remoteService, remoteOperation) (
  sum_over_time(request{environment="${environment}",service="${serviceName}",remoteService!="",namespace="span_derived"}[${timeRange}])
)
`;

/**
 * CONSOLIDATED: Get all dependencies' error rate over time range
 * Uses sum_over_time for accurate total rate calculation
 * @page Service Dependencies — Dependencies table error rate column (via useDependencyMetrics hook)
 */
export const getQueryAllDependenciesErrorRateAvg = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
(
  sum by (remoteService, remoteOperation) (sum_over_time(error{environment="${environment}",service="${serviceName}",remoteService!="",namespace="span_derived"}[${timeRange}]))
  /
  clamp_min(sum by (remoteService, remoteOperation) (sum_over_time(request{environment="${environment}",service="${serviceName}",remoteService!="",namespace="span_derived"}[${timeRange}])), 1)
) * 100
`;

/**
 * CONSOLIDATED: Get all dependencies' availability over time range
 * Uses sum_over_time for accurate total rate calculation
 * @page Service Dependencies — Dependencies table availability column (via useDependencyMetrics hook)
 */
export const getQueryAllDependenciesAvailabilityAvg = (
  environment: string,
  serviceName: string,
  timeRange: string
): string => `
(1 - (
  sum by (remoteService, remoteOperation) (sum_over_time(fault{environment="${environment}",service="${serviceName}",remoteService!="",namespace="span_derived"}[${timeRange}]))
  /
  clamp_min(sum by (remoteService, remoteOperation) (sum_over_time(request{environment="${environment}",service="${serviceName}",remoteService!="",namespace="span_derived"}[${timeRange}])), 1)
)) * 100
`;

// ============================================================================
// APPLICATION-LEVEL QUERIES (aggregated across all services)
// ============================================================================

/**
 * Application-level total requests (aggregated across all services)
 * For Application Map root node
 * @page App Map Node Flyout — Application root requests chart
 */
export const getQueryApplicationRequests = (): string => `
sum(request{namespace="span_derived"})
`;

/**
 * Application-level total faults (5xx) (aggregated across all services)
 * For Application Map root node
 * @page App Map Node Flyout — Application root faults chart
 */
export const getQueryApplicationFaults = (): string => `
sum(fault{namespace="span_derived"})
`;

/**
 * Application-level total errors (4xx) (aggregated across all services)
 * For Application Map root node
 * @page App Map Node Flyout — Application root errors chart
 */
export const getQueryApplicationErrors = (): string => `
sum(error{namespace="span_derived"})
`;

/**
 * Application-level combined latency percentiles (aggregated across all services)
 * Returns P99, P90, P50 in milliseconds
 * For Application Map root node latency chart
 * @page App Map Node Flyout — Application root latency chart
 */
export const getQueryApplicationLatency = (): string => `
label_replace(
  histogram_quantile(0.99,
    sum by (le) (
      latency_seconds_bucket{namespace="span_derived"}
    )
  ) * 1000,
  "percentile", "p99", "", ""
)
or
label_replace(
  histogram_quantile(0.90,
    sum by (le) (
      latency_seconds_bucket{namespace="span_derived"}
    )
  ) * 1000,
  "percentile", "p90", "", ""
)
or
label_replace(
  histogram_quantile(0.50,
    sum by (le) (
      latency_seconds_bucket{namespace="span_derived"}
    )
  ) * 1000,
  "percentile", "p50", "", ""
)
`;

// ============================================================================
// EDGE METRICS QUERIES (for Edge Flyout)
// ============================================================================

/**
 * Get request count for a specific edge (service-to-service connection)
 * Uses sum_over_time to aggregate over the selected time range
 * @param service - Source service name
 * @param environment - Source environment
 * @param remoteService - Target service name
 * @param timeRange - Time range string (e.g., "3600s")
 * @page App Map Edge Flyout — Edge requests metric (via useSelectedEdgeMetrics hook)
 */
export const getQueryEdgeRequests = (
  service: string,
  environment: string,
  remoteService: string,
  timeRange: string
): string => `
sum(sum_over_time(request{namespace="span_derived",service="${service}",environment="${environment}",remoteService="${remoteService}"}[${timeRange}]))
`;

/**
 * Get P99 latency for a specific edge
 * Aggregates buckets with sum_over_time first, then computes histogram_quantile once.
 * Returns latency in milliseconds
 * @param service - Source service name
 * @param environment - Source environment
 * @param remoteService - Target service name
 * @param timeRange - Time range string (e.g., "3600s")
 * @page App Map Edge Flyout — Edge P99 latency metric (via useSelectedEdgeMetrics hook)
 */
export const getQueryEdgeLatencyP99 = (
  service: string,
  environment: string,
  remoteService: string,
  timeRange: string
): string => `
histogram_quantile(0.99,
  sum by (le) (
    sum_over_time(latency_seconds_bucket{namespace="span_derived",service="${service}",environment="${environment}",remoteService="${remoteService}"}[${timeRange}])
  )
) * 1000
`;

/**
 * Get fault count (5xx errors) for a specific edge
 * Uses sum_over_time to aggregate over the selected time range
 * @param service - Source service name
 * @param environment - Source environment
 * @param remoteService - Target service name
 * @param timeRange - Time range string (e.g., "3600s")
 * @page App Map Edge Flyout — Edge faults metric (via useSelectedEdgeMetrics hook)
 */
export const getQueryEdgeFaults = (
  service: string,
  environment: string,
  remoteService: string,
  timeRange: string
): string => `
sum(sum_over_time(fault{namespace="span_derived",service="${service}",environment="${environment}",remoteService="${remoteService}"}[${timeRange}]))
`;

/**
 * Get error count (4xx errors) for a specific edge
 * Uses sum_over_time to aggregate over the selected time range
 * @param service - Source service name
 * @param environment - Source environment
 * @param remoteService - Target service name
 * @param timeRange - Time range string (e.g., "3600s")
 * @page App Map Edge Flyout — Edge errors metric (via useSelectedEdgeMetrics hook)
 */
export const getQueryEdgeErrors = (
  service: string,
  environment: string,
  remoteService: string,
  timeRange: string
): string => `
sum(sum_over_time(error{namespace="span_derived",service="${service}",environment="${environment}",remoteService="${remoteService}"}[${timeRange}]))
`;

// ============================================================================
// DEPENDENCY CHART QUERIES
// ============================================================================

/**
 * Dependency Requests Over Time
 * For expandable row charts
 * @page Service Dependencies — Expandable row requests chart
 */
export const getQueryDependencyRequestsOverTime = (
  environment: string,
  serviceName: string,
  remoteService: string,
  remoteOperation: string,
  window?: string
): string =>
  window
    ? `sum(sum_over_time(request{environment="${environment}",service="${serviceName}",remoteService="${remoteService}",remoteOperation="${remoteOperation}",namespace="span_derived"}[${window}]))`
    : `sum(request{environment="${environment}",service="${serviceName}",remoteService="${remoteService}",remoteOperation="${remoteOperation}",namespace="span_derived"})`;

/**
 * Get faults and errors over time for a specific dependency
 * For expandable row charts
 * @page Service Dependencies — Expandable row faults/errors chart
 */
export const getQueryDependencyFaultsAndErrorsOverTime = (
  environment: string,
  serviceName: string,
  remoteService: string,
  remoteOperation: string
): string => `
label_replace(
  (
    sum(fault{environment="${environment}",service="${serviceName}",remoteService="${remoteService}",remoteOperation="${remoteOperation}",namespace="span_derived"})
    /
    clamp_min(sum(request{environment="${environment}",service="${serviceName}",remoteService="${remoteService}",remoteOperation="${remoteOperation}",namespace="span_derived"}), 1)
  ) * 100,
  "metric", "Fault Rate (%)", "", ""
)
or
label_replace(
  (
    sum(error{environment="${environment}",service="${serviceName}",remoteService="${remoteService}",remoteOperation="${remoteOperation}",namespace="span_derived"})
    /
    clamp_min(sum(request{environment="${environment}",service="${serviceName}",remoteService="${remoteService}",remoteOperation="${remoteOperation}",namespace="span_derived"}), 1)
  ) * 100,
  "metric", "Error Rate (%)", "", ""
)
`;

/**
 * Get latency percentiles over time for a specific dependency
 * For expandable row charts
 * @page Service Dependencies — Expandable row latency chart
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
      latency_seconds_bucket{environment="${environment}",service="${serviceName}",remoteService="${remoteService}",remoteOperation="${remoteOperation}",namespace="span_derived"}
    )
  ) * 1000,
  "metric", "p50", "", ""
)
or
label_replace(
  histogram_quantile(0.90,
    sum by (le) (
      latency_seconds_bucket{environment="${environment}",service="${serviceName}",remoteService="${remoteService}",remoteOperation="${remoteOperation}",namespace="span_derived"}
    )
  ) * 1000,
  "metric", "p90", "", ""
)
or
label_replace(
  histogram_quantile(0.99,
    sum by (le) (
      latency_seconds_bucket{environment="${environment}",service="${serviceName}",remoteService="${remoteService}",remoteOperation="${remoteOperation}",namespace="span_derived"}
    )
  ) * 1000,
  "metric", "p99", "", ""
)
`;

// ============================================================================
// SERVICE MAP NODE METRICS
// ============================================================================

/**
 * Service Map Node Throughput - aggregate requests by service
 * Uses sum_over_time to aggregate over the selected time range
 * @param serviceFilter - Service filter regex (e.g., service=~"svc1|svc2")
 * @param timeRange - Time range string (e.g., "3600s")
 * @page Application Map — Node throughput metric (via useServiceMapMetrics hook)
 */
export const getQueryServiceMapThroughput = (serviceFilter: string, timeRange: string): string =>
  `
sum by (service) (
  sum_over_time(request{${serviceFilter},remoteService="",namespace="span_derived"}[${timeRange}])
)
`.trim();

/**
 * Service Map Node Faults - aggregate faults by service
 * Uses sum_over_time to aggregate over the selected time range
 * @param serviceFilter - Service filter regex (e.g., service=~"svc1|svc2")
 * @param timeRange - Time range string (e.g., "3600s")
 * @page Application Map — Node fault metric (via useServiceMapMetrics hook)
 */
export const getQueryServiceMapFaults = (serviceFilter: string, timeRange: string): string =>
  `
sum by (service) (
  sum_over_time(fault{${serviceFilter},remoteService="",namespace="span_derived"}[${timeRange}])
)
`.trim();

/**
 * Service Map Node Errors - aggregate errors by service
 * Uses sum_over_time to aggregate over the selected time range
 * @param serviceFilter - Service filter regex (e.g., service=~"svc1|svc2")
 * @param timeRange - Time range string (e.g., "3600s")
 * @page Application Map — Node error metric (via useServiceMapMetrics hook)
 */
export const getQueryServiceMapErrors = (serviceFilter: string, timeRange: string): string =>
  `
sum by (service) (
  sum_over_time(error{${serviceFilter},remoteService="",namespace="span_derived"}[${timeRange}])
)
`.trim();

// ============================================================================
// GROUP METRICS (for Application Map Group By feature)
// ============================================================================

/**
 * Group aggregated throughput
 * Aggregates requests across all services with the specified label filter
 * @param labelFilter - Label filter (e.g., telemetry_sdk_language="cpp",namespace="span_derived")
 * @param timeRange - Time range string (e.g., "3600s")
 * @page Application Map — Group node throughput (via useGroupMetrics hook)
 */
export const getQueryGroupThroughput = (labelFilter: string, timeRange: string): string =>
  `
sum(sum_over_time(request{${labelFilter}}[${timeRange}]))
`.trim();

/**
 * Group aggregated faults
 * Aggregates faults across all services with the specified label filter
 * @param labelFilter - Label filter (e.g., telemetry_sdk_language="cpp",namespace="span_derived")
 * @param timeRange - Time range string (e.g., "3600s")
 * @page Application Map — Group node faults (via useGroupMetrics hook)
 */
export const getQueryGroupFaults = (labelFilter: string, timeRange: string): string =>
  `
sum(sum_over_time(fault{${labelFilter}}[${timeRange}]))
`.trim();

/**
 * Group aggregated errors
 * Aggregates errors across all services with the specified label filter
 * @param labelFilter - Label filter (e.g., telemetry_sdk_language="cpp",namespace="span_derived")
 * @param timeRange - Time range string (e.g., "3600s")
 * @page Application Map — Group node errors (via useGroupMetrics hook)
 */
export const getQueryGroupErrors = (labelFilter: string, timeRange: string): string =>
  `
sum(sum_over_time(error{${labelFilter}}[${timeRange}]))
`.trim();

/**
 * Group latency percentile
 * Calculates latency percentile aggregated across all services with the specified label filter
 * @param labelFilter - Label filter (e.g., telemetry_sdk_language="cpp",namespace="span_derived")
 * @param percentile - Percentile value (0.50, 0.90, 0.99)
 * @param timeRange - Time range string (e.g., "3600s")
 * @returns Latency in milliseconds
 * @page Application Map — Group node latency (via useGroupMetrics hook)
 */
export const getQueryGroupLatencyPercentile = (
  labelFilter: string,
  percentile: number,
  timeRange: string
): string =>
  `
histogram_quantile(${percentile}, sum by (le) (sum_over_time(latency_seconds_bucket{${labelFilter}}[${timeRange}]))) * 1000
`.trim();

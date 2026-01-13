/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PromQLQueryBuilder - Utility for building PromQL queries for APM metrics
 *
 * Supports building queries for:
 * - Error/Fault/Request rates (counters)
 * - Latency metrics (histograms with percentiles)
 */
export class PromQLQueryBuilder {
  /**
   * Build PromQL query with filters
   */
  static buildQuery(params: {
    metricName: string;
    filters: Record<string, string>;
    stat?: string;
    interval: string;
  }): string {
    const { metricName, filters, stat, interval } = params;

    // Build label filters (e.g., {service="api-gateway", operation="GET /users"})
    const filterString = this.buildFilters(filters);

    // Build query based on metric type
    switch (metricName) {
      case 'error':
      case 'fault':
      case 'request':
        return this.buildRateQuery(metricName, filterString, interval, stat);

      case 'latency':
        return this.buildLatencyQuery(filterString, interval, stat);

      default:
        // Generic counter/gauge query
        return `${metricName}${filterString}`;
    }
  }

  /**
   * Build label filters for PromQL
   */
  private static buildFilters(filters: Record<string, string>): string {
    const entries = Object.entries(filters);
    if (entries.length === 0) return '';

    const filterStr = entries.map(([key, value]) => `${key}="${value}"`).join(',');
    return `{${filterStr}}`;
  }

  /**
   * Build rate query (for counters: error, fault, request)
   */
  private static buildRateQuery(
    metricName: string,
    filters: string,
    interval: string,
    stat?: string
  ): string {
    const baseQuery = `rate(${metricName}${filters}[${interval}])`;

    if (!stat) return baseQuery;

    switch (stat.toLowerCase()) {
      case 'sum':
        return `sum(${baseQuery})`;
      case 'avg':
      case 'average':
        return `avg(${baseQuery})`;
      case 'max':
      case 'maximum':
        return `max(${baseQuery})`;
      case 'min':
      case 'minimum':
        return `min(${baseQuery})`;
      default:
        return baseQuery;
    }
  }

  /**
   * Build latency query with histogram quantiles
   */
  private static buildLatencyQuery(filters: string, interval: string, stat?: string): string {
    if (!stat) {
      // Default: average latency
      return `rate(latency_seconds_sum${filters}[${interval}]) / rate(latency_seconds_count${filters}[${interval}])`;
    }

    switch (stat.toLowerCase()) {
      case 'p99':
        return `histogram_quantile(0.99, rate(latency_seconds_bucket${filters}[${interval}]))`;
      case 'p90':
        return `histogram_quantile(0.90, rate(latency_seconds_bucket${filters}[${interval}]))`;
      case 'p50':
        return `histogram_quantile(0.50, rate(latency_seconds_bucket${filters}[${interval}]))`;
      case 'avg':
      case 'average':
        return `rate(latency_seconds_sum${filters}[${interval}]) / rate(latency_seconds_count${filters}[${interval}])`;
      case 'max':
      case 'maximum':
        return `max_over_time(latency_seconds_max${filters}[${interval}])`;
      case 'min':
      case 'minimum':
        return `min_over_time(latency_seconds_min${filters}[${interval}])`;
      default:
        return `rate(latency_seconds_sum${filters}[${interval}]) / rate(latency_seconds_count${filters}[${interval}])`;
    }
  }
}

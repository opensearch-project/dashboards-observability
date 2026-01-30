/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { coreRefs } from '../../../framework/core_refs';
import { PromQLQueryBuilder } from './query_requests/promql_query_builder';
import { ExecuteMetricRequestParams } from '../common/types/prometheus_types';

/**
 * PromQLSearchService - Frontend service for executing PromQL queries
 *
 * This service makes direct HTTP calls to the query enhancements PromQL API.
 * Browser-based HTTP requests include authentication cookies automatically.
 *
 * Pattern: React Component → PromQLSearchService → HTTP POST → Query Enhancements API → Prometheus
 */
export class PromQLSearchService {
  constructor(
    private readonly prometheusConnectionId: string,
    private readonly prometheusConnectionMeta?: Record<string, unknown>
  ) {}

  /**
   * Execute a metric request (range query)
   * Note: step parameter is calculated automatically by OSD core
   */
  async executeMetricRequest(params: ExecuteMetricRequestParams): Promise<any> {
    const { query, startTime, endTime } = params;

    // Build request body matching query enhancements API format
    const requestBody = {
      query: {
        query,
        language: 'PROMQL',
        dataset: {
          id: this.prometheusConnectionId,
          type: 'PROMETHEUS',
          meta: this.prometheusConnectionMeta,
        },
        format: 'jdbc',
      },
      timeRange: {
        from: new Date(startTime * 1000).toISOString(),
        to: new Date(endTime * 1000).toISOString(),
      },
    };

    try {
      // Call query enhancements API directly - includes auth from browser session
      const response = await coreRefs.http!.post('/api/enhancements/search/promql', {
        body: JSON.stringify(requestBody),
      });

      // Unwrap the body - API returns { type: 'data_frame', body: { ...actual data } }
      return response.body;
    } catch (error) {
      console.error('[PromQLSearchService] Query execution failed:', error);
      throw error;
    }
  }

  /**
   * Build and execute a PromQL query using the query builder
   */
  async executeBuiltQuery(params: {
    metricName: string;
    filters: Record<string, string>;
    stat?: string;
    interval: string;
    startTime: number;
    endTime: number;
  }): Promise<any> {
    const { metricName, filters, stat, interval, startTime, endTime } = params;

    // Build the PromQL query
    const query = PromQLQueryBuilder.buildQuery({
      metricName,
      filters,
      stat,
      interval,
    });

    // Execute the query
    return this.executeMetricRequest({
      query,
      startTime,
      endTime,
    });
  }
}

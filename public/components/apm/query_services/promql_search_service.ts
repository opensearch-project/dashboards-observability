/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { coreRefs } from '../../../framework/core_refs';
import {
  ExecuteMetricRequestParams,
  ExecuteInstantQueryParams,
} from '../common/types/prometheus_types';

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
   */
  async executeMetricRequest(params: ExecuteMetricRequestParams): Promise<any> {
    const { query, startTime, endTime, step } = params;

    // Build request body matching query enhancements API format
    const requestBody = {
      query: {
        query,
        language: 'PROMQL',
        dataset: {
          id: this.prometheusConnectionId,
          type: 'PROMETHEUS',
          dataSource: { meta: this.prometheusConnectionMeta },
        },
        format: 'jdbc',
      },
      timeRange: {
        from: new Date(startTime * 1000).toISOString(),
        to: new Date(endTime * 1000).toISOString(),
      },
      ...(step !== undefined && { options: { step } }),
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
   * Execute an instant query (point-in-time evaluation)
   * More efficient than range queries when only a single aggregated value is needed
   */
  async executeInstantQuery(params: ExecuteInstantQueryParams): Promise<any> {
    const { query, time } = params;

    const requestBody = {
      query: {
        query,
        language: 'PROMQL',
        dataset: {
          id: this.prometheusConnectionId,
          type: 'PROMETHEUS',
          dataSource: { meta: this.prometheusConnectionMeta },
        },
        format: 'jdbc',
      },
      options: {
        queryType: 'INSTANT',
        time: time.toString(), // Unix epoch in seconds
      },
    };

    try {
      const response = await coreRefs.http!.post('/api/enhancements/search/promql', {
        body: JSON.stringify(requestBody),
      });

      return response.body;
    } catch (error) {
      console.error('[PromQLSearchService] Instant query execution failed:', error);
      throw error;
    }
  }
}

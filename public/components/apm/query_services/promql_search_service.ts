/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { coreRefs } from '../../../framework/core_refs';
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
          dataSource: { meta: this.prometheusConnectionMeta },
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
}

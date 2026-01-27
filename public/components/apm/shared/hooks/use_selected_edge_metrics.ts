/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import { getTimeInSeconds } from '../utils/time_utils';
import { useApmConfig } from '../../config/apm_config_context';
import { EdgeMetrics, SelectedEdgeState } from '../../common/types/service_map_types';
import {
  getQueryEdgeRequests,
  getQueryEdgeLatencyP99,
  getQueryEdgeFaults,
  getQueryEdgeErrors,
} from '../../query_services/query_requests/promql_queries';

export interface UseSelectedEdgeMetricsParams {
  /** Selected edge state (null when no edge is selected) */
  selectedEdge: SelectedEdgeState | null;
  startTime: Date;
  endTime: Date;
}

export interface UseSelectedEdgeMetricsResult {
  /** Edge metrics for the selected edge */
  metrics: EdgeMetrics | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook for fetching metrics for a single selected edge on demand
 *
 * Fetches metrics only when an edge is selected:
 * - Request count
 * - P99 latency (in milliseconds)
 * - Fault count (5xx errors)
 * - Error count (4xx errors)
 *
 * @example
 * const { metrics, isLoading } = useSelectedEdgeMetrics({
 *   selectedEdge: { edgeId: '...', sourceService: 'frontend', sourceEnvironment: 'prod', targetService: 'backend', position: { x: 100, y: 200 } },
 *   startTime: new Date(Date.now() - 3600000),
 *   endTime: new Date(),
 * });
 */
export const useSelectedEdgeMetrics = (
  params: UseSelectedEdgeMetricsParams
): UseSelectedEdgeMetricsResult => {
  const { config } = useApmConfig();

  const [metrics, setMetrics] = useState<EdgeMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Get config values
  const prometheusConnectionId = config?.prometheusDataSource?.id;

  const promqlService = useMemo(() => {
    if (!prometheusConnectionId) {
      return null;
    }
    return new PromQLSearchService(prometheusConnectionId);
  }, [prometheusConnectionId]);

  // Memoize time values to avoid unnecessary re-fetches
  const startTimeSec = useMemo(() => getTimeInSeconds(params.startTime), [params.startTime]);
  const endTimeSec = useMemo(() => getTimeInSeconds(params.endTime), [params.endTime]);

  useEffect(() => {
    // Clear metrics when no edge is selected
    if (!params.selectedEdge || !promqlService) {
      setMetrics(null);
      setIsLoading(false);
      return;
    }

    const { sourceService, sourceEnvironment, targetService, edgeId } = params.selectedEdge;

    const fetchMetrics = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Execute all 4 queries in parallel
        const [requestsResp, latencyResp, faultsResp, errorsResp] = await Promise.all([
          promqlService.executeMetricRequest({
            query: getQueryEdgeRequests(sourceService, sourceEnvironment, targetService),
            startTime: startTimeSec,
            endTime: endTimeSec,
          }),
          promqlService.executeMetricRequest({
            query: getQueryEdgeLatencyP99(sourceService, sourceEnvironment, targetService),
            startTime: startTimeSec,
            endTime: endTimeSec,
          }),
          promqlService.executeMetricRequest({
            query: getQueryEdgeFaults(sourceService, sourceEnvironment, targetService),
            startTime: startTimeSec,
            endTime: endTimeSec,
          }),
          promqlService.executeMetricRequest({
            query: getQueryEdgeErrors(sourceService, sourceEnvironment, targetService),
            startTime: startTimeSec,
            endTime: endTimeSec,
          }),
        ]);

        // Extract values from responses
        const requestCount = extractSingleValue(requestsResp);
        const latencyP99 = extractSingleValue(latencyResp);
        const faultCount = extractSingleValue(faultsResp);
        const errorCount = extractSingleValue(errorsResp);

        setMetrics({
          edgeId,
          sourceService,
          sourceEnvironment,
          targetService,
          requestCount,
          latencyP99,
          faultCount,
          errorCount,
        });
      } catch (err) {
        console.error('[useSelectedEdgeMetrics] Error fetching edge metrics:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setMetrics(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
    // Using individual properties to avoid unnecessary re-fetches when only position changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    params.selectedEdge?.edgeId,
    params.selectedEdge?.sourceService,
    params.selectedEdge?.sourceEnvironment,
    params.selectedEdge?.targetService,
    promqlService,
    startTimeSec,
    endTimeSec,
  ]);

  return { metrics, isLoading, error };
};

/**
 * Extract a single numeric value from a Prometheus response
 */
function extractSingleValue(response: any): number {
  if (!response) {
    return 0;
  }

  // Check for data frame format (query enhancements plugin)
  if (response?.type === 'data_frame' && response?.fields && Array.isArray(response.fields)) {
    const valueField = response.fields.find((f: any) => f.name === 'Value');
    if (valueField && valueField.values && valueField.values.length > 0) {
      // Get the latest value
      const value = valueField.values[valueField.values.length - 1];
      return parseFloat(value) || 0;
    }
  }

  // Check for instantData format
  if (response?.meta?.instantData?.rows && Array.isArray(response.meta.instantData.rows)) {
    const rows = response.meta.instantData.rows;
    if (rows.length > 0 && rows[0].Value !== undefined) {
      return parseFloat(rows[0].Value) || 0;
    }
  }

  // Standard Prometheus response format
  const result = response?.data?.result || response?.result || [];

  if (result.length > 0) {
    const r = result[0];

    // Handle range query format (values array) - get the latest value
    if (r.values && Array.isArray(r.values) && r.values.length > 0) {
      const latestValue = r.values[r.values.length - 1];
      if (latestValue) {
        return parseFloat(latestValue[1]) || 0;
      }
    }

    // Handle instant query format (value array)
    if (r.value && Array.isArray(r.value)) {
      return parseFloat(r.value[1]) || 0;
    }
  }

  return 0;
}

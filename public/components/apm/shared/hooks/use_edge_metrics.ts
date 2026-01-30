/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import { getTimeInSeconds } from '../utils/time_utils';
import { useApmConfig } from '../../config/apm_config_context';
import { EdgeMetrics } from '../../common/types/service_map_types';
import {
  getQueryAllEdgeRequests,
  getQueryAllEdgeLatency,
  getQueryAllEdgeFaultRate,
} from '../../query_services/query_requests/promql_queries';

export interface UseEdgeMetricsParams {
  /** Whether to fetch edge metrics */
  enabled: boolean;
  startTime: Date;
  endTime: Date;
}

export interface UseEdgeMetricsResult {
  /** Map of edgeId ("sourceService::sourceEnv->targetService::targetEnv") to metrics */
  edgeMetricsMap: Map<string, EdgeMetrics>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook for fetching metrics for all service-to-service connections (edges)
 *
 * Fetches metrics for all edges in a single batch when enabled:
 * - Request counts grouped by service->remoteService
 * - P95 latency grouped by service->remoteService
 * - Fault rate grouped by service->remoteService
 *
 * @example
 * const { edgeMetricsMap, isLoading } = useEdgeMetrics({
 *   enabled: showEdgeMetrics,
 *   startTime: new Date(Date.now() - 3600000),
 *   endTime: new Date(),
 * });
 */
export const useEdgeMetrics = (params: UseEdgeMetricsParams): UseEdgeMetricsResult => {
  const { config } = useApmConfig();

  const [edgeMetricsMap, setEdgeMetricsMap] = useState<Map<string, EdgeMetrics>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // Get config values
  const prometheusConnectionId = config?.prometheusDataSource?.id;
  const prometheusConnectionMeta = config?.prometheusDataSource?.meta;

  const promqlService = useMemo(() => {
    if (!prometheusConnectionId) {
      return null;
    }
    return new PromQLSearchService(prometheusConnectionId, prometheusConnectionMeta);
  }, [prometheusConnectionId, prometheusConnectionMeta]);

  // Memoize time values to avoid unnecessary re-fetches
  const startTimeSec = useMemo(() => getTimeInSeconds(params.startTime), [params.startTime]);
  const endTimeSec = useMemo(() => getTimeInSeconds(params.endTime), [params.endTime]);

  useEffect(() => {
    if (!params.enabled || !promqlService) {
      setEdgeMetricsMap(new Map());
      setIsLoading(false);
      return;
    }

    const fetchMetrics = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Execute all queries in parallel
        const [requestsResp, latencyResp, faultRateResp] = await Promise.all([
          promqlService.executeMetricRequest({
            query: getQueryAllEdgeRequests(),
            startTime: startTimeSec,
            endTime: endTimeSec,
          }),
          promqlService.executeMetricRequest({
            query: getQueryAllEdgeLatency(),
            startTime: startTimeSec,
            endTime: endTimeSec,
          }),
          promqlService.executeMetricRequest({
            query: getQueryAllEdgeFaultRate(),
            startTime: startTimeSec,
            endTime: endTimeSec,
          }),
        ]);

        // Build edge metrics map
        const newMap = new Map<string, EdgeMetrics>();

        // Extract edges from requests response
        const requestsData = extractEdgeData(requestsResp);
        const latencyData = extractEdgeData(latencyResp);
        const faultRateData = extractEdgeData(faultRateResp);

        // Combine all edge metrics
        requestsData.forEach((requestCount, edgeKey) => {
          const edgeId = edgeKey;
          newMap.set(edgeId, {
            edgeId,
            requestCount,
            latencyP95: latencyData.get(edgeKey) || 0,
            errorRate: faultRateData.get(edgeKey) || 0,
          });
        });

        setEdgeMetricsMap(newMap);
      } catch (err) {
        console.error('[useEdgeMetrics] Error fetching edge metrics:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setEdgeMetricsMap(new Map());
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, [params.enabled, promqlService, startTimeSec, endTimeSec, refetchTrigger]);

  const refetch = useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);

  return { edgeMetricsMap, isLoading, error, refetch };
};

/**
 * Extract edge metric data from Prometheus response
 * Returns a Map with edge keys (service::env->remoteService) and their values
 */
function extractEdgeData(response: any): Map<string, number> {
  const edgeMap = new Map<string, number>();

  if (!response) {
    return edgeMap;
  }

  // Check for data frame format (query enhancements plugin)
  if (response?.type === 'data_frame' && response?.fields && Array.isArray(response.fields)) {
    const seriesField = response.fields.find((f: any) => f.name === 'Series');
    const valueField = response.fields.find((f: any) => f.name === 'Value');

    if (seriesField && valueField) {
      // Iterate through all data points
      for (let i = 0; i < seriesField.values.length; i++) {
        const seriesLabel = seriesField.values[i];
        const edgeKey = parseEdgeKey(seriesLabel);

        if (edgeKey) {
          const value = parseFloat(valueField.values[i]) || 0;
          // Keep the latest (or sum for counts)
          const existing = edgeMap.get(edgeKey) || 0;
          edgeMap.set(edgeKey, Math.max(existing, value));
        }
      }
      return edgeMap;
    }
  }

  // Check for instantData format (fallback for instant queries)
  if (response?.meta?.instantData?.rows && Array.isArray(response.meta.instantData.rows)) {
    response.meta.instantData.rows.forEach((row: any) => {
      const service = row.service;
      const environment = row.environment || 'generic:default';
      const remoteService = row.remoteService;

      if (service && remoteService) {
        const edgeKey = `${service}::${environment}->${remoteService}`;
        const value = parseFloat(row.Value) || 0;
        edgeMap.set(edgeKey, value);
      }
    });
    return edgeMap;
  }

  // Standard Prometheus response format
  const result = response?.data?.result || response?.result || [];

  result.forEach((r: any) => {
    const service = r.metric?.service;
    const environment = r.metric?.environment || 'generic:default';
    const remoteService = r.metric?.remoteService;

    if (service && remoteService) {
      const edgeKey = `${service}::${environment}->${remoteService}`;

      // Handle range query format (values array)
      if (r.values && Array.isArray(r.values)) {
        // Get the latest value
        const latestValue = r.values[r.values.length - 1];
        if (latestValue) {
          edgeMap.set(edgeKey, parseFloat(latestValue[1]) || 0);
        }
      }

      // Handle instant query format (value array)
      if (r.value && Array.isArray(r.value)) {
        edgeMap.set(edgeKey, parseFloat(r.value[1]) || 0);
      }
    }
  });

  return edgeMap;
}

/**
 * Parse edge key from series label string
 * e.g., '{service="ad",environment="generic:default",remoteService="frontend"}' -> 'ad::generic:default->frontend'
 */
function parseEdgeKey(seriesLabel: string): string | null {
  const serviceMatch = seriesLabel.match(/service="([^"]+)"/);
  const envMatch = seriesLabel.match(/environment="([^"]+)"/);
  const remoteMatch = seriesLabel.match(/remoteService="([^"]+)"/);

  if (serviceMatch && remoteMatch) {
    const service = serviceMatch[1];
    const environment = envMatch ? envMatch[1] : 'generic:default';
    const remoteService = remoteMatch[1];
    return `${service}::${environment}->${remoteService}`;
  }

  return null;
}

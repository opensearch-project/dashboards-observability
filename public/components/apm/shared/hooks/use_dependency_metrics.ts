/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import { DependencyMetrics, GroupedDependency } from '../../common/types/service_details_types';
import {
  getQueryAllDependenciesLatencyP50,
  getQueryAllDependenciesLatencyP90,
  getQueryAllDependenciesLatencyP99,
  getQueryAllDependenciesFaultRate,
  getQueryAllDependenciesErrorRate,
  getQueryAllDependenciesAvailability,
  getQueryAllDependenciesRequestCount,
} from '../../query_services/query_requests/promql_queries';

export interface UseDependencyMetricsParams {
  dependencies: GroupedDependency[];
  serviceName: string;
  environment: string;
  startTime: Date;
  endTime: Date;
  prometheusConnectionId: string;
  refreshTrigger?: number;
}

export interface UseDependencyMetricsResult {
  metrics: Map<string, DependencyMetrics>; // Key: "remoteService:remoteOperation"
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook for fetching Prometheus metrics for dependency table columns
 *
 * Fetches metrics for all dependencies in parallel:
 * - Latency percentiles (p50, p90, p99) from Prometheus
 * - Fault rate from Prometheus
 * - Error rate from Prometheus
 * - Availability from Prometheus
 *
 * Uses short time range (5 minutes) queries and takes latest value
 * to simulate instant queries with existing range query API.
 */
export const useDependencyMetrics = (
  params: UseDependencyMetricsParams
): UseDependencyMetricsResult => {
  const [metrics, setMetrics] = useState<Map<string, DependencyMetrics>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const promqlService = useMemo(() => {
    if (!params.prometheusConnectionId) {
      return null;
    }
    return new PromQLSearchService(params.prometheusConnectionId);
  }, [params.prometheusConnectionId]);

  useEffect(() => {
    if (!params.dependencies || params.dependencies.length === 0 || !promqlService) {
      // Only update if not already empty to avoid infinite re-renders
      setMetrics((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }

    const fetchMetrics = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Use short time range (last 5 minutes) for instant-like queries
        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

        // Make 7 consolidated queries (one per metric type)
        // Each query returns ALL dependencies in a single response
        const [
          p50Response,
          p90Response,
          p99Response,
          faultRateResponse,
          errorRateResponse,
          availabilityResponse,
          requestCountResponse,
        ] = await Promise.all([
          promqlService.executeMetricRequest({
            query: getQueryAllDependenciesLatencyP50(params.environment, params.serviceName),
            startTime: Math.floor(fiveMinutesAgo.getTime() / 1000),
            endTime: Math.floor(now.getTime() / 1000),
          }),
          promqlService.executeMetricRequest({
            query: getQueryAllDependenciesLatencyP90(params.environment, params.serviceName),
            startTime: Math.floor(fiveMinutesAgo.getTime() / 1000),
            endTime: Math.floor(now.getTime() / 1000),
          }),
          promqlService.executeMetricRequest({
            query: getQueryAllDependenciesLatencyP99(params.environment, params.serviceName),
            startTime: Math.floor(fiveMinutesAgo.getTime() / 1000),
            endTime: Math.floor(now.getTime() / 1000),
          }),
          promqlService.executeMetricRequest({
            query: getQueryAllDependenciesFaultRate(params.environment, params.serviceName),
            startTime: Math.floor(fiveMinutesAgo.getTime() / 1000),
            endTime: Math.floor(now.getTime() / 1000),
          }),
          promqlService.executeMetricRequest({
            query: getQueryAllDependenciesErrorRate(params.environment, params.serviceName),
            startTime: Math.floor(fiveMinutesAgo.getTime() / 1000),
            endTime: Math.floor(now.getTime() / 1000),
          }),
          promqlService.executeMetricRequest({
            query: getQueryAllDependenciesAvailability(params.environment, params.serviceName),
            startTime: Math.floor(fiveMinutesAgo.getTime() / 1000),
            endTime: Math.floor(now.getTime() / 1000),
          }),
          promqlService.executeMetricRequest({
            query: getQueryAllDependenciesRequestCount(params.environment, params.serviceName),
            startTime: Math.floor(fiveMinutesAgo.getTime() / 1000),
            endTime: Math.floor(now.getTime() / 1000),
          }),
        ]);

        // Initialize metrics map with default values for all dependencies
        const metricsMap = new Map<string, DependencyMetrics>();
        params.dependencies.forEach((dep) => {
          const key = `${dep.serviceName}:${dep.remoteOperation}`;
          metricsMap.set(key, {
            p50Duration: 0,
            p90Duration: 0,
            p99Duration: 0,
            faultRate: 0,
            errorRate: 0,
            availability: 0,
            requestCount: 0,
          });
        });

        // Extract metrics by dependency from each response
        extractMetricsByDependency(p50Response, metricsMap, 'p50Duration', 1000); // Convert seconds to ms
        extractMetricsByDependency(p90Response, metricsMap, 'p90Duration', 1000);
        extractMetricsByDependency(p99Response, metricsMap, 'p99Duration', 1000);
        extractMetricsByDependency(faultRateResponse, metricsMap, 'faultRate', 1);
        extractMetricsByDependency(errorRateResponse, metricsMap, 'errorRate', 1);
        extractMetricsByDependency(availabilityResponse, metricsMap, 'availability', 0.01); // Convert 0-100 to 0-1
        extractMetricsByDependency(requestCountResponse, metricsMap, 'requestCount', 1);

        setMetrics(metricsMap);
      } catch (err) {
        console.error('[useDependencyMetrics] Error fetching metrics:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, [
    params.dependencies,
    params.serviceName,
    params.environment,
    params.startTime,
    params.endTime,
    params.prometheusConnectionId,
    params.refreshTrigger,
    promqlService,
  ]);

  return { metrics, isLoading, error };
};

/**
 * Extract metrics from consolidated PromQL response and populate metrics map
 * @param response PromQL response with multiple time series (one per dependency)
 * @param metricsMap Map to populate with metrics (key: "remoteService:remoteOperation")
 * @param metricField Field name to set in DependencyMetrics
 * @param multiplier Value multiplier (e.g., 1000 for ms conversion, 0.01 for percentage conversion)
 */
function extractMetricsByDependency(
  response: any,
  metricsMap: Map<string, DependencyMetrics>,
  metricField: keyof DependencyMetrics,
  multiplier: number
): void {
  try {
    // Handle data frame format (query enhancements plugin response)
    // Response structure: { meta: { instantData: { rows: [{Time, remoteService, remoteOperation, Value}] } } }
    if (response?.meta?.instantData?.rows) {
      const rows = response.meta.instantData.rows;

      if (!Array.isArray(rows)) {
        console.warn(`[extractMetricsByDependency] Expected rows array, got:`, typeof rows);
        return;
      }

      rows.forEach((row: any) => {
        const remoteService = row.remoteService;
        const remoteOperation = row.remoteOperation || 'unknown';
        const rawValue = parseFloat(row.Value);

        if (!remoteService) {
          return;
        }

        const key = `${remoteService}:${remoteOperation}`;
        const value = (isNaN(rawValue) ? 0 : rawValue) * multiplier;

        // Update metrics map
        const metrics = metricsMap.get(key);
        if (metrics) {
          (metrics as any)[metricField] = value;
        }
      });
      return;
    }

    // Fallback: Handle traditional Prometheus response format
    // Response structure: { data: { result: [{metric: {remoteService: "...", remoteOperation: "..."}, values: [...]}] } }
    const results = response.body?.data?.result || response?.data?.result || response?.result || [];

    if (!Array.isArray(results)) {
      console.warn(`[extractMetricsByDependency] Expected array, got:`, typeof results);
      return;
    }

    results.forEach((series: any) => {
      // Get dependency info from metric labels
      const remoteService = series.metric?.remoteService;
      const remoteOperation = series.metric?.remoteOperation || 'unknown';

      if (!remoteService) {
        return;
      }

      const key = `${remoteService}:${remoteOperation}`;

      // Get latest value from time series
      const values = series.values || [];
      if (values.length === 0) {
        return;
      }

      const lastValue = values[values.length - 1];
      const rawValue = parseFloat(lastValue[1]);
      const value = (isNaN(rawValue) ? 0 : rawValue) * multiplier;

      // Update metrics map
      const metrics = metricsMap.get(key);
      if (metrics) {
        (metrics as any)[metricField] = value;
      }
    });
  } catch (e) {
    console.error(`[extractMetricsByDependency] Failed to extract ${metricField}:`, e);
  }
}

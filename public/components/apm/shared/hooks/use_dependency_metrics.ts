/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import { DependencyMetrics, GroupedDependency } from '../../common/types/service_details_types';
import { calculateTimeRangeDuration } from '../utils/time_utils';
import {
  getQueryAllDependenciesLatencyPercentiles,
  getQueryAllDependenciesErrorRateAvg,
  getQueryAllDependenciesAvailabilityAvg,
  getQueryAllDependenciesRequestCountTotal,
} from '../../query_services/query_requests/promql_queries';

export interface UseDependencyMetricsParams {
  dependencies: GroupedDependency[];
  serviceName: string;
  environment: string;
  startTime: Date;
  endTime: Date;
  prometheusConnectionId: string;
  prometheusConnectionMeta?: Record<string, unknown>;
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
 * - Error rate from Prometheus
 * - Availability from Prometheus
 *
 * Uses the time range specified in params for querying.
 */
export const useDependencyMetrics = (
  params: UseDependencyMetricsParams
): UseDependencyMetricsResult => {
  const [metrics, setMetrics] = useState<Map<string, DependencyMetrics>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const promqlService = useMemo(() => {
    if (!params.prometheusConnectionId) {
      return null;
    }
    return new PromQLSearchService(params.prometheusConnectionId, params.prometheusConnectionMeta);
  }, [params.prometheusConnectionId, params.prometheusConnectionMeta]);

  useEffect(() => {
    if (!params.dependencies || params.dependencies.length === 0 || !promqlService) {
      // Only update if not already empty to avoid infinite re-renders
      setMetrics((prev) => (prev.size === 0 ? prev : new Map()));
      setIsLoading(false);
      return;
    }

    const fetchMetrics = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Calculate time range duration for aggregate queries
        const timeRangeDuration = calculateTimeRangeDuration(params.startTime, params.endTime);

        // Make 4 consolidated queries
        // Each query returns ALL dependencies in a single response
        const [
          latencyPercentilesResponse,
          errorRateResponse,
          availabilityResponse,
          requestCountResponse,
        ] = await Promise.all([
          promqlService.executeInstantQuery({
            query: getQueryAllDependenciesLatencyPercentiles(
              params.environment,
              params.serviceName,
              timeRangeDuration
            ),
            time: Math.floor(params.endTime.getTime() / 1000),
          }),
          promqlService.executeInstantQuery({
            query: getQueryAllDependenciesErrorRateAvg(
              params.environment,
              params.serviceName,
              timeRangeDuration
            ),
            time: Math.floor(params.endTime.getTime() / 1000),
          }),
          promqlService.executeInstantQuery({
            query: getQueryAllDependenciesAvailabilityAvg(
              params.environment,
              params.serviceName,
              timeRangeDuration
            ),
            time: Math.floor(params.endTime.getTime() / 1000),
          }),
          promqlService.executeInstantQuery({
            query: getQueryAllDependenciesRequestCountTotal(
              params.environment,
              params.serviceName,
              timeRangeDuration
            ),
            time: Math.floor(params.endTime.getTime() / 1000),
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
            errorRate: 0,
            availability: 0,
            requestCount: 0,
          });
        });

        // Extract latency percentiles from the combined response
        extractPercentilesByDependency(latencyPercentilesResponse, metricsMap);

        // Extract other metrics by dependency from each response
        extractMetricsByDependency(errorRateResponse, metricsMap, 'errorRate');
        extractMetricsByDependency(availabilityResponse, metricsMap, 'availability');
        extractMetricsByDependency(requestCountResponse, metricsMap, 'requestCount');

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

const PERCENTILE_FIELD_MAP: Record<string, keyof DependencyMetrics> = {
  p50: 'p50Duration',
  p90: 'p90Duration',
  p99: 'p99Duration',
};

/**
 * Extract latency percentiles from a combined PromQL response with "percentile" labels.
 * Each row/series has a "percentile" label (p50, p90, p99), "remoteService", and "remoteOperation" labels.
 */
function extractPercentilesByDependency(
  response: any,
  metricsMap: Map<string, DependencyMetrics>
): void {
  try {
    if (response?.meta?.instantData?.rows) {
      const rows = response.meta.instantData.rows;
      if (!Array.isArray(rows)) return;

      rows.forEach((row: any) => {
        const remoteService = row.remoteService;
        const remoteOperation = row.remoteOperation || 'unknown';
        const percentile = row.percentile;
        const field = PERCENTILE_FIELD_MAP[percentile];
        if (!remoteService || !field) return;

        const key = `${remoteService}:${remoteOperation}`;
        const rawValue = parseFloat(row.Value);
        const value = isNaN(rawValue) ? 0 : rawValue;
        const metrics = metricsMap.get(key);
        if (metrics) {
          (metrics as any)[field] = value;
        }
      });
      return;
    }

    const results = response.body?.data?.result || response?.data?.result || response?.result || [];
    if (!Array.isArray(results)) return;

    results.forEach((series: any) => {
      const remoteService = series.metric?.remoteService;
      const remoteOperation = series.metric?.remoteOperation || 'unknown';
      const percentile = series.metric?.percentile;
      const field = PERCENTILE_FIELD_MAP[percentile];
      if (!remoteService || !field) return;

      const key = `${remoteService}:${remoteOperation}`;
      const values = series.values || [];
      if (values.length === 0) return;

      const lastValue = values[values.length - 1];
      const rawValue = parseFloat(lastValue[1]);
      const value = isNaN(rawValue) ? 0 : rawValue;
      const metrics = metricsMap.get(key);
      if (metrics) {
        (metrics as any)[field] = value;
      }
    });
  } catch (e) {
    console.error('[extractPercentilesByDependency] Failed to extract latency percentiles:', e);
  }
}

/**
 * Extract metrics from consolidated PromQL response and populate metrics map
 * Note: Unit conversions are done in PromQL queries, not here
 * @param response PromQL response with multiple time series (one per dependency)
 * @param metricsMap Map to populate with metrics (key: "remoteService:remoteOperation")
 * @param metricField Field name to set in DependencyMetrics
 */
function extractMetricsByDependency(
  response: any,
  metricsMap: Map<string, DependencyMetrics>,
  metricField: keyof DependencyMetrics
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
        const value = isNaN(rawValue) ? 0 : rawValue;

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
      const value = isNaN(rawValue) ? 0 : rawValue;

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

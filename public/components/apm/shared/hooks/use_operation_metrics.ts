/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import { OperationMetrics } from '../../common/types/service_details_types';
import { calculateTimeRangeDuration } from '../utils/time_utils';
import {
  getQueryAllOperationsLatencyPercentiles,
  getQueryAllOperationsFaultRate,
  getQueryAllOperationsErrorRateAvg,
  getQueryAllOperationsAvailabilityAvg,
  getQueryAllOperationsRequestCountTotal,
} from '../../query_services/query_requests/promql_queries';

export interface UseOperationMetricsParams {
  operations: Array<{ operationName: string }>;
  serviceName: string;
  environment: string;
  startTime: Date;
  endTime: Date;
  prometheusConnectionId: string;
  prometheusConnectionMeta?: Record<string, unknown>;
  refreshTrigger?: number;
}

export interface UseOperationMetricsResult {
  metrics: Map<string, OperationMetrics>;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook for fetching Prometheus metrics for operation table columns
 *
 * Fetches metrics for all operations in parallel:
 * - Latency percentiles (p50, p90, p99) from Prometheus
 * - Fault rate from Prometheus
 * - Error rate from Prometheus
 * - Availability from Prometheus
 *
 * Uses the time range specified in params for querying.
 */
export const useOperationMetrics = (
  params: UseOperationMetricsParams
): UseOperationMetricsResult => {
  const [metrics, setMetrics] = useState<Map<string, OperationMetrics>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const promqlService = useMemo(() => {
    if (!params.prometheusConnectionId) {
      return null;
    }
    return new PromQLSearchService(params.prometheusConnectionId, params.prometheusConnectionMeta);
  }, [params.prometheusConnectionId, params.prometheusConnectionMeta]);

  useEffect(() => {
    if (!params.operations || params.operations.length === 0 || !promqlService) {
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

        // Make 5 consolidated queries
        // Each query returns ALL operations in a single response
        const [
          latencyPercentilesResponse,
          faultRateResponse,
          errorRateResponse,
          availabilityResponse,
          requestCountResponse,
        ] = await Promise.all([
          promqlService.executeInstantQuery({
            query: getQueryAllOperationsLatencyPercentiles(
              params.environment,
              params.serviceName,
              timeRangeDuration
            ),
            time: Math.floor(params.endTime.getTime() / 1000),
          }),
          promqlService.executeInstantQuery({
            query: getQueryAllOperationsFaultRate(params.environment, params.serviceName),
            time: Math.floor(params.endTime.getTime() / 1000),
          }),
          promqlService.executeInstantQuery({
            query: getQueryAllOperationsErrorRateAvg(
              params.environment,
              params.serviceName,
              timeRangeDuration
            ),
            time: Math.floor(params.endTime.getTime() / 1000),
          }),
          promqlService.executeInstantQuery({
            query: getQueryAllOperationsAvailabilityAvg(
              params.environment,
              params.serviceName,
              timeRangeDuration
            ),
            time: Math.floor(params.endTime.getTime() / 1000),
          }),
          promqlService.executeInstantQuery({
            query: getQueryAllOperationsRequestCountTotal(
              params.environment,
              params.serviceName,
              timeRangeDuration
            ),
            time: Math.floor(params.endTime.getTime() / 1000),
          }),
        ]);

        // Initialize metrics map with default values for all operations
        const metricsMap = new Map<string, OperationMetrics>();
        params.operations.forEach((op) => {
          metricsMap.set(op.operationName, {
            p50Duration: 0,
            p90Duration: 0,
            p99Duration: 0,
            faultRate: 0,
            errorRate: 0,
            availability: 0,
            dependencyCount: 0,
            requestCount: 0,
          });
        });

        // Extract latency percentiles from the combined response
        // The combined query uses label_replace to tag each series with a "percentile" label
        extractPercentilesByOperation(latencyPercentilesResponse, metricsMap);

        // Extract other metrics by operation from each response
        extractMetricsByOperation(faultRateResponse, metricsMap, 'faultRate');
        extractMetricsByOperation(errorRateResponse, metricsMap, 'errorRate');
        extractMetricsByOperation(availabilityResponse, metricsMap, 'availability');
        extractMetricsByOperation(requestCountResponse, metricsMap, 'requestCount');

        setMetrics(metricsMap);
      } catch (err) {
        console.error('[useOperationMetrics] Error fetching metrics:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, [
    params.operations,
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

const PERCENTILE_FIELD_MAP: Record<string, keyof OperationMetrics> = {
  p50: 'p50Duration',
  p90: 'p90Duration',
  p99: 'p99Duration',
};

/**
 * Extract latency percentiles from a combined PromQL response with "percentile" labels.
 * Each row/series has a "percentile" label (p50, p90, p99) and an "operation" label.
 */
function extractPercentilesByOperation(
  response: any,
  metricsMap: Map<string, OperationMetrics>
): void {
  try {
    if (response?.meta?.instantData?.rows) {
      const rows = response.meta.instantData.rows;
      if (!Array.isArray(rows)) return;

      rows.forEach((row: any) => {
        const operationName = row.operation;
        const percentile = row.percentile;
        const field = PERCENTILE_FIELD_MAP[percentile];
        if (!operationName || !field) return;

        const rawValue = parseFloat(row.Value);
        const value = isNaN(rawValue) ? 0 : rawValue;
        const metrics = metricsMap.get(operationName);
        if (metrics) {
          (metrics as any)[field] = value;
        }
      });
      return;
    }

    const results = response.body?.data?.result || response?.data?.result || response?.result || [];
    if (!Array.isArray(results)) return;

    results.forEach((series: any) => {
      const operationName = series.metric?.operation;
      const percentile = series.metric?.percentile;
      const field = PERCENTILE_FIELD_MAP[percentile];
      if (!operationName || !field) return;

      const values = series.values || [];
      if (values.length === 0) return;

      const lastValue = values[values.length - 1];
      const rawValue = parseFloat(lastValue[1]);
      const value = isNaN(rawValue) ? 0 : rawValue;
      const metrics = metricsMap.get(operationName);
      if (metrics) {
        (metrics as any)[field] = value;
      }
    });
  } catch (e) {
    console.error('[extractPercentilesByOperation] Failed to extract latency percentiles:', e);
  }
}

/**
 * Extract metrics from consolidated PromQL response and populate metrics map
 * Note: Unit conversions are done in PromQL queries, not here
 * @param response PromQL response with multiple time series (one per operation)
 * @param metricsMap Map to populate with metrics
 * @param metricField Field name to set in OperationMetrics
 */
function extractMetricsByOperation(
  response: any,
  metricsMap: Map<string, OperationMetrics>,
  metricField: keyof OperationMetrics
): void {
  try {
    // Handle data frame format (query enhancements plugin response)
    // Response structure: { meta: { instantData: { rows: [{Time, operation, Value}] } } }
    if (response?.meta?.instantData?.rows) {
      const rows = response.meta.instantData.rows;

      if (!Array.isArray(rows)) {
        console.warn(`[extractMetricsByOperation] Expected rows array, got:`, typeof rows);
        return;
      }

      rows.forEach((row: any) => {
        const operationName = row.operation;
        const rawValue = parseFloat(row.Value);

        if (!operationName) {
          return;
        }

        const value = isNaN(rawValue) ? 0 : rawValue;

        // Update metrics map
        const metrics = metricsMap.get(operationName);
        if (metrics) {
          (metrics as any)[metricField] = value;
        }
      });
      return;
    }

    // Fallback: Handle traditional Prometheus response format
    // Response structure: { data: { result: [{metric: {operation: "..."}, values: [...]}] } }
    const results = response.body?.data?.result || response?.data?.result || response?.result || [];

    if (!Array.isArray(results)) {
      console.warn(`[extractMetricsByOperation] Expected array, got:`, typeof results);
      return;
    }

    results.forEach((series: any) => {
      // Get operation name from metric labels
      const operationName = series.metric?.operation;
      if (!operationName) {
        return;
      }

      // Get latest value from time series
      const values = series.values || [];
      if (values.length === 0) {
        return;
      }

      const lastValue = values[values.length - 1];
      const rawValue = parseFloat(lastValue[1]);
      const value = isNaN(rawValue) ? 0 : rawValue;

      // Update metrics map
      const metrics = metricsMap.get(operationName);
      if (metrics) {
        (metrics as any)[metricField] = value;
      }
    });
  } catch (e) {
    console.error(`[extractMetricsByOperation] Failed to extract ${metricField}:`, e);
  }
}

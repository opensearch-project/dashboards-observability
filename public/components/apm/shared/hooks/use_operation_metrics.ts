/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import { useApmConfig } from '../../config/apm_config_context';
import { OperationMetrics } from '../../common/types/service_details_types';
import { calculateTimeRangeDuration } from '../utils/time_utils';
import {
  getQueryAllOperationsLatencyPercentiles,
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
  refreshTrigger?: number;
}

export interface UseOperationMetricsResult {
  metrics: Map<string, OperationMetrics>;
  isLoading: boolean;
  error: Error | null;
}

interface MetricResponses {
  latency: unknown;
  errorRate: unknown;
  availability: unknown;
  requestCount: unknown;
}

/**
 * Hook for fetching Prometheus metrics for operation table columns
 *
 * Fetches metrics for all operations in parallel:
 * - Latency percentiles (p50, p90, p99) from Prometheus
 * - Error rate from Prometheus
 * - Availability from Prometheus
 *
 * Uses the time range specified in params for querying.
 */
export const useOperationMetrics = (
  params: UseOperationMetricsParams
): UseOperationMetricsResult => {
  // Raw PromQL responses. The queries depend only on the service and time
  // range, not on the operations list, so the list is joined in at render time (see
  // `metrics`): a list re-fetch (new array on every PPL response) does not
  // re-send the queries.
  const [responses, setResponses] = useState<MetricResponses | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Source the Prometheus connection meta from the APM config context, matching the
  // working pattern in useServiceMapMetrics.
  const { config } = useApmConfig();
  const prometheusConnectionMeta = config?.prometheusDataSource?.meta;

  const hasOperations = (params.operations?.length ?? 0) > 0;

  const promqlService = useMemo(() => {
    if (!params.prometheusConnectionId) {
      return null;
    }
    return new PromQLSearchService(params.prometheusConnectionId, prometheusConnectionMeta);
  }, [params.prometheusConnectionId, prometheusConnectionMeta]);

  useEffect(() => {
    if (!hasOperations || !promqlService) {
      setResponses(null);
      setIsLoading(false);
      return;
    }

    const abortController = new AbortController();

    const fetchMetrics = async () => {
      setIsLoading(true);
      setError(null);

      const timeRangeDuration = calculateTimeRangeDuration(params.startTime, params.endTime);
      const time = Math.floor(params.endTime.getTime() / 1000);

      // Settle each query independently so one failed query cannot blank every column.
      const [latencyResult, errorRateResult, availabilityResult, requestCountResult] =
        await Promise.allSettled([
          promqlService.executeInstantQuery({
            query: getQueryAllOperationsLatencyPercentiles(
              params.environment,
              params.serviceName,
              timeRangeDuration
            ),
            time,
            signal: abortController.signal,
          }),
          promqlService.executeInstantQuery({
            query: getQueryAllOperationsErrorRateAvg(
              params.environment,
              params.serviceName,
              timeRangeDuration
            ),
            time,
            signal: abortController.signal,
          }),
          promqlService.executeInstantQuery({
            query: getQueryAllOperationsAvailabilityAvg(
              params.environment,
              params.serviceName,
              timeRangeDuration
            ),
            time,
            signal: abortController.signal,
          }),
          promqlService.executeInstantQuery({
            query: getQueryAllOperationsRequestCountTotal(
              params.environment,
              params.serviceName,
              timeRangeDuration
            ),
            time,
            signal: abortController.signal,
          }),
        ]);

      if (abortController.signal.aborted) return;

      const valueOf = (r: PromiseSettledResult<any>) =>
        r.status === 'fulfilled' ? r.value : undefined;

      // Missing (rejected) responses leave the defaulted 0 values in place.
      setResponses({
        latency: valueOf(latencyResult),
        errorRate: valueOf(errorRateResult),
        availability: valueOf(availabilityResult),
        requestCount: valueOf(requestCountResult),
      });

      const firstRejection = [
        latencyResult,
        errorRateResult,
        availabilityResult,
        requestCountResult,
      ].find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (firstRejection) {
        console.error(
          '[useOperationMetrics] Partial failure fetching metrics:',
          firstRejection.reason
        );
        setError(
          firstRejection.reason instanceof Error
            ? firstRejection.reason
            : new Error('Failed to fetch some operation metrics')
        );
      }
      setIsLoading(false);
    };

    fetchMetrics();

    return () => abortController.abort();
  }, [
    hasOperations,
    params.serviceName,
    params.environment,
    params.startTime,
    params.endTime,
    params.prometheusConnectionId,
    params.refreshTrigger,
    promqlService,
  ]);

  // Join the latest responses onto the current operations list.
  const metrics = useMemo(() => {
    const metricsMap = new Map<string, OperationMetrics>();
    if (!responses) return metricsMap;
    (params.operations ?? []).forEach((op) => {
      metricsMap.set(op.operationName, {
        p50Duration: 0,
        p90Duration: 0,
        p99Duration: 0,
        errorRate: 0,
        availability: 0,
        dependencyCount: 0,
        requestCount: 0,
      });
    });
    extractPercentilesByOperation(responses.latency, metricsMap);
    extractMetricsByOperation(responses.errorRate, metricsMap, 'errorRate');
    extractMetricsByOperation(responses.availability, metricsMap, 'availability');
    extractMetricsByOperation(responses.requestCount, metricsMap, 'requestCount');
    return metricsMap;
  }, [params.operations, responses]);

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
  if (!response) return;
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
  if (!response) return;
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

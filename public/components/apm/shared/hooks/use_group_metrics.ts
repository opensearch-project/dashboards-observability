/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import { getTimeInSeconds } from '../utils/time_utils';
import { useApmConfig } from '../../config/apm_config_context';
import { ServiceMapNodeMetrics, MetricDataPoint } from '../../common/types/service_map_types';
import {
  getQueryGroupThroughput,
  getQueryGroupFaults,
  getQueryGroupErrors,
  getQueryGroupLatencyPercentile,
} from '../../query_services/query_requests/promql_queries';

export interface UseGroupMetricsParams {
  /** Group by attribute path (e.g., "telemetry.sdk.language") */
  groupByAttribute: string;
  /** Group value to filter by (e.g., "cpp") */
  groupByValue: string;
  startTime: Date;
  endTime: Date;
  /** Enable/disable the hook */
  enabled?: boolean;
}

export interface UseGroupMetricsResult {
  metrics: ServiceMapNodeMetrics | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook for fetching aggregated RED metrics for a specific group attribute value
 *
 * Uses PromQL to aggregate metrics across all services that share the same
 * group attribute value (e.g., all services using "cpp" SDK language).
 *
 * The attribute name is converted to Prometheus label format (dots to underscores).
 *
 * @example
 * const { metrics, isLoading } = useGroupMetrics({
 *   groupByAttribute: 'telemetry.sdk.language',
 *   groupByValue: 'cpp',
 *   startTime: new Date(Date.now() - 3600000),
 *   endTime: new Date(),
 *   enabled: true,
 * });
 */
export const useGroupMetrics = (params: UseGroupMetricsParams): UseGroupMetricsResult => {
  const { config } = useApmConfig();

  const [metrics, setMetrics] = useState<ServiceMapNodeMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Get config values
  // Use .name (connectionId) for PromQL queries, not .id (saved object ID)
  const prometheusConnectionId = config?.prometheusDataSource?.name;
  const prometheusConnectionMeta = config?.prometheusDataSource?.meta;

  const promqlService = useMemo(() => {
    if (!prometheusConnectionId) {
      return null;
    }
    return new PromQLSearchService(prometheusConnectionId, prometheusConnectionMeta);
  }, [prometheusConnectionId, prometheusConnectionMeta]);

  // Convert attribute name to Prometheus label format (dots to underscores)
  const prometheusLabel = useMemo(() => {
    return params.groupByAttribute.replace(/\./g, '_');
  }, [params.groupByAttribute]);

  // Memoize time values
  const startTimeSec = useMemo(() => getTimeInSeconds(params.startTime), [params.startTime]);
  const endTimeSec = useMemo(() => getTimeInSeconds(params.endTime), [params.endTime]);

  // Calculate time range string for sum_over_time queries
  const timeRange = useMemo(() => {
    const durationMs = params.endTime.getTime() - params.startTime.getTime();
    const durationSec = Math.floor(durationMs / 1000);
    return `${durationSec}s`;
  }, [params.startTime, params.endTime]);

  useEffect(() => {
    if (!params.enabled || !promqlService || !params.groupByAttribute || !params.groupByValue) {
      setMetrics(null);
      setIsLoading(false);
      return;
    }

    const fetchMetrics = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Build label filter for the group attribute value
        const labelFilter = `${prometheusLabel}="${params.groupByValue}",namespace="span_derived"`;

        // Define queries - using centralized query functions from promql_queries.ts
        const queries = {
          throughput: getQueryGroupThroughput(labelFilter, timeRange),
          faults: getQueryGroupFaults(labelFilter, timeRange),
          errors: getQueryGroupErrors(labelFilter, timeRange),
          // P50, P90, P99 latency aggregated across all services in the group
          latencyP50: getQueryGroupLatencyPercentile(labelFilter, 0.5),
          latencyP90: getQueryGroupLatencyPercentile(labelFilter, 0.9),
          latencyP99: getQueryGroupLatencyPercentile(labelFilter, 0.99),
        };

        // Execute all queries in parallel
        const [
          throughputResp,
          faultsResp,
          errorsResp,
          latencyP50Resp,
          latencyP90Resp,
          latencyP99Resp,
        ] = await Promise.all([
          promqlService.executeMetricRequest({
            query: queries.throughput,
            startTime: startTimeSec,
            endTime: endTimeSec,
          }),
          promqlService.executeMetricRequest({
            query: queries.faults,
            startTime: startTimeSec,
            endTime: endTimeSec,
          }),
          promqlService.executeMetricRequest({
            query: queries.errors,
            startTime: startTimeSec,
            endTime: endTimeSec,
          }),
          promqlService.executeMetricRequest({
            query: queries.latencyP50,
            startTime: startTimeSec,
            endTime: endTimeSec,
          }),
          promqlService.executeMetricRequest({
            query: queries.latencyP90,
            startTime: startTimeSec,
            endTime: endTimeSec,
          }),
          promqlService.executeMetricRequest({
            query: queries.latencyP99,
            startTime: startTimeSec,
            endTime: endTimeSec,
          }),
        ]);

        // Extract data points from responses
        const throughputData = extractAggregatedData(throughputResp);
        const faultsData = extractAggregatedData(faultsResp);
        const errorsData = extractAggregatedData(errorsResp);
        const latencyP50Data = extractAggregatedData(latencyP50Resp);
        const latencyP90Data = extractAggregatedData(latencyP90Resp);
        const latencyP99Data = extractAggregatedData(latencyP99Resp);

        // Calculate totals and averages
        const totalRequests = calculateSum(throughputData);
        const totalFaults = calculateSum(faultsData);
        const totalErrors = calculateSum(errorsData);
        const failureRatio =
          totalRequests > 0 ? ((totalFaults + totalErrors) / totalRequests) * 100 : 0;

        setMetrics({
          latency: latencyP50Data, // Use P50 as default latency
          avgLatency: calculateAverage(latencyP50Data),
          latencyP99: latencyP99Data,
          avgLatencyP99: calculateAverage(latencyP99Data),
          latencyP90: latencyP90Data,
          avgLatencyP90: calculateAverage(latencyP90Data),
          latencyP50: latencyP50Data,
          avgLatencyP50: calculateAverage(latencyP50Data),
          throughput: throughputData,
          avgThroughput: calculateAverage(throughputData),
          failureRatio: [],
          avgFailureRatio: failureRatio,
          faults: faultsData,
          totalFaults,
          errors: errorsData,
          totalErrors,
          totalRequests,
        });
      } catch (err) {
        console.error('[useGroupMetrics] Error fetching metrics:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setMetrics(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, [
    params.enabled,
    params.groupByAttribute,
    params.groupByValue,
    promqlService,
    prometheusLabel,
    startTimeSec,
    endTimeSec,
    timeRange,
  ]);

  return { metrics, isLoading, error };
};

/**
 * Calculate average of data points
 */
function calculateAverage(data: MetricDataPoint[]): number {
  if (data.length === 0) return 0;
  // Filter out NaN values
  const validData = data.filter((point) => !isNaN(point.value) && isFinite(point.value));
  if (validData.length === 0) return 0;
  const sum = validData.reduce((acc, point) => acc + point.value, 0);
  return sum / validData.length;
}

/**
 * Calculate sum of data points (for totals)
 */
function calculateSum(data: MetricDataPoint[]): number {
  if (data.length === 0) return 0;
  // Filter out NaN values
  const validData = data.filter((point) => !isNaN(point.value) && isFinite(point.value));
  return validData.reduce((acc, point) => acc + point.value, 0);
}

/**
 * Extract aggregated metric data from Prometheus response
 * Handles data frame format and standard Prometheus format
 */
function extractAggregatedData(response: any): MetricDataPoint[] {
  if (!response) {
    return [];
  }

  // Check for data frame format (query enhancements plugin)
  if (response?.type === 'data_frame' && response?.fields && Array.isArray(response.fields)) {
    const timeField = response.fields.find((f: any) => f.name === 'Time');
    const valueField = response.fields.find((f: any) => f.name === 'Value');

    if (timeField && valueField) {
      const dataPoints: MetricDataPoint[] = [];

      for (let i = 0; i < valueField.values.length; i++) {
        const value = parseFloat(valueField.values[i]);
        if (!isNaN(value)) {
          dataPoints.push({
            timestamp: timeField.values[i] / 1000, // Convert ms to seconds
            value,
          });
        }
      }

      return dataPoints;
    }
  }

  // Check for instantData format (fallback for instant queries)
  if (response?.meta?.instantData?.rows && Array.isArray(response.meta.instantData.rows)) {
    const rows = response.meta.instantData.rows;

    if (rows.length > 0) {
      return rows.map((row: any) => ({
        timestamp: row.Time / 1000, // Convert ms to seconds
        value: parseFloat(row.Value) || 0,
      }));
    }
  }

  // Standard Prometheus response format
  const result = response?.data?.result || response?.result || [];

  if (result.length === 0) {
    return [];
  }

  // For aggregated queries, there should be only one result (no grouping labels)
  const aggregatedResult = result[0];

  if (!aggregatedResult) {
    return [];
  }

  // Handle range query format (values array)
  if (aggregatedResult.values && Array.isArray(aggregatedResult.values)) {
    return aggregatedResult.values.map(([timestamp, value]: [number, string]) => ({
      timestamp,
      value: parseFloat(value) || 0,
    }));
  }

  // Handle instant query format (value array)
  if (aggregatedResult.value && Array.isArray(aggregatedResult.value)) {
    const [timestamp, value] = aggregatedResult.value;
    return [
      {
        timestamp,
        value: parseFloat(value) || 0,
      },
    ];
  }

  return [];
}

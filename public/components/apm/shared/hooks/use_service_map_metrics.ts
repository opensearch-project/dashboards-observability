/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import { getTimeInSeconds } from '../utils/time_utils';
import { useApmConfig } from '../../config/apm_config_context';
import { ServiceMapNodeMetrics, MetricDataPoint } from '../../common/types/service_map_types';
import {
  getQueryServiceMapThroughput,
  getQueryServiceMapFaults,
  getQueryServiceMapErrors,
} from '../../query_services/query_requests/promql_queries';

export interface ServiceMapMetricParams {
  /** Array of services with name and environment */
  services: Array<{ serviceName: string; environment: string }>;
  startTime: Date;
  endTime: Date;
}

export interface UseServiceMapMetricsResult {
  /** Map of nodeId (serviceName::environment) to metrics */
  metricsMap: Map<string, ServiceMapNodeMetrics>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook for batch-fetching RED metrics for service map nodes
 *
 * Fetches metrics for all services in parallel using sum_over_time
 * to aggregate counts over the selected time range:
 * - Throughput: sum_over_time of request gauge
 * - Faults: sum_over_time of fault gauge
 * - Errors: sum_over_time of error gauge
 * - Failure Ratio: calculated client-side as (faults + errors) / requests * 100
 *
 * Note: request, error, and fault are GAUGE metrics (not counters)
 * Note: Latency metrics are not fetched here (use useServicesRedMetrics for latency)
 *
 * @example
 * const { metricsMap, isLoading } = useServiceMapMetrics({
 *   services: [{ serviceName: 'service1', environment: 'generic:default' }],
 *   startTime: new Date(Date.now() - 3600000),
 *   endTime: new Date(),
 * });
 */
export const useServiceMapMetrics = (
  params: ServiceMapMetricParams
): UseServiceMapMetricsResult => {
  const { config } = useApmConfig();

  const [metricsMap, setMetricsMap] = useState<Map<string, ServiceMapNodeMetrics>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

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

  // Build service filter (service=~"service1|service2|...")
  const serviceFilter = useMemo(() => {
    if (params.services.length === 0) return '';
    const serviceNames = params.services.map((s) => s.serviceName).join('|');
    return `service=~"${serviceNames}"`;
  }, [params.services]);

  // Memoize time values to avoid unnecessary re-fetches
  const startTimeSec = useMemo(() => getTimeInSeconds(params.startTime), [params.startTime]);
  const endTimeSec = useMemo(() => getTimeInSeconds(params.endTime), [params.endTime]);

  // Calculate time range string for sum_over_time queries
  const timeRange = useMemo(() => {
    const durationMs = params.endTime.getTime() - params.startTime.getTime();
    const durationSec = Math.floor(durationMs / 1000);
    return `${durationSec}s`;
  }, [params.startTime, params.endTime]);

  useEffect(() => {
    if (params.services.length === 0 || !promqlService) {
      setMetricsMap(new Map());
      setIsLoading(false);
      return;
    }

    const fetchMetrics = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Define queries - using centralized query functions from promql_queries.ts
        const queries = {
          throughput: getQueryServiceMapThroughput(serviceFilter, timeRange),
          faults: getQueryServiceMapFaults(serviceFilter, timeRange),
          errors: getQueryServiceMapErrors(serviceFilter, timeRange),
        };

        // Execute all queries in parallel
        const [throughputResp, faultsResp, errorsResp] = await Promise.all([
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
        ]);

        // Build metrics map for each service
        const newMap = new Map<string, ServiceMapNodeMetrics>();

        params.services.forEach(({ serviceName, environment }) => {
          const nodeId = `${serviceName}::${environment}`;

          const throughputData = extractServiceData(throughputResp, serviceName);
          const faultsData = extractServiceData(faultsResp, serviceName);
          const errorsData = extractServiceData(errorsResp, serviceName);

          // Calculate totals and failure ratio client-side
          const totalRequests = calculateSum(throughputData);
          const totalFaults = calculateSum(faultsData);
          const totalErrors = calculateSum(errorsData);
          const failureRatio =
            totalRequests > 0 ? ((totalFaults + totalErrors) / totalRequests) * 100 : 0;

          newMap.set(nodeId, {
            latency: [],
            avgLatency: 0,
            latencyP99: [],
            avgLatencyP99: 0,
            latencyP90: [],
            avgLatencyP90: 0,
            latencyP50: [],
            avgLatencyP50: 0,
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
        });

        setMetricsMap(newMap);
      } catch (err) {
        console.error('[useServiceMapMetrics] Error fetching metrics:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setMetricsMap(new Map());
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
    // Note: params.services is intentionally omitted to prevent infinite loops.
    // serviceFilter already tracks changes to the services list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promqlService, serviceFilter, startTimeSec, endTimeSec, timeRange, refetchTrigger]);

  const refetch = useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);

  return { metricsMap, isLoading, error, refetch };
};

/**
 * Calculate average of data points
 */
function calculateAverage(data: MetricDataPoint[]): number {
  if (data.length === 0) return 0;
  const sum = data.reduce((acc, point) => acc + point.value, 0);
  return sum / data.length;
}

/**
 * Calculate sum of data points (for totals)
 */
function calculateSum(data: MetricDataPoint[]): number {
  if (data.length === 0) return 0;
  return data.reduce((acc, point) => acc + point.value, 0);
}

/**
 * Extract metric data for a specific service from Prometheus response
 * Handles data frame format, range query, and instant query formats
 */
function extractServiceData(response: any, serviceName: string): MetricDataPoint[] {
  if (!response) {
    return [];
  }

  // Check for data frame format (query enhancements plugin)
  if (response?.type === 'data_frame' && response?.fields && Array.isArray(response.fields)) {
    const timeField = response.fields.find((f: any) => f.name === 'Time');
    const seriesField = response.fields.find((f: any) => f.name === 'Series');
    const valueField = response.fields.find((f: any) => f.name === 'Value');

    if (timeField && seriesField && valueField) {
      const dataPoints: MetricDataPoint[] = [];

      // Iterate through all data points and filter by service
      for (let i = 0; i < seriesField.values.length; i++) {
        const seriesLabel = seriesField.values[i];
        // Parse series label: {service="ad"} -> ad
        const match = seriesLabel.match(/service="([^"]+)"/);
        const service = match ? match[1] : null;

        if (service === serviceName) {
          dataPoints.push({
            timestamp: timeField.values[i] / 1000, // Convert ms to seconds
            value: parseFloat(valueField.values[i]) || 0,
          });
        }
      }

      if (dataPoints.length > 0) {
        return dataPoints;
      }
    }
  }

  // Check for instantData format (fallback for instant queries)
  if (response?.meta?.instantData?.rows && Array.isArray(response.meta.instantData.rows)) {
    const rows = response.meta.instantData.rows.filter((row: any) => row.service === serviceName);

    if (rows.length > 0) {
      return rows.map((row: any) => ({
        timestamp: row.Time / 1000, // Convert ms to seconds
        value: parseFloat(row.Value) || 0,
      }));
    }
  }

  // Standard Prometheus response format
  const result = response?.data?.result || response?.result || [];

  const serviceResult = result.find((r: any) => r.metric?.service === serviceName);

  if (!serviceResult) {
    return [];
  }

  // Handle range query format (values array)
  if (serviceResult.values && Array.isArray(serviceResult.values)) {
    return serviceResult.values.map(([timestamp, value]: [number, string]) => ({
      timestamp,
      value: parseFloat(value) || 0,
    }));
  }

  // Handle instant query format (value array)
  if (serviceResult.value && Array.isArray(serviceResult.value)) {
    const [timestamp, value] = serviceResult.value;
    return [
      {
        timestamp,
        value: parseFloat(value) || 0,
      },
    ];
  }

  return [];
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import { getTimeInSeconds } from '../utils/time_utils';
import { useApmConfig } from '../../config/apm_config_context';

export interface ServiceRedMetrics {
  latency: MetricDataPoint[];
  avgLatency: number; // Average of all latency data points over the time period
  throughput: MetricDataPoint[];
  avgThroughput: number; // Average of all throughput data points over the time period
  failureRatio: MetricDataPoint[];
  avgFailureRatio: number; // Average of all failure ratio data points over the time period
}

export interface MetricDataPoint {
  timestamp: number;
  value: number;
}

export interface UseServicesRedMetricsParams {
  services: Array<{ serviceName: string; environment?: string }>;
  startTime: Date;
  endTime: Date;
  latencyPercentile?: 'p99' | 'p90' | 'p50';
}

export interface UseServicesRedMetricsResult {
  metricsMap: Map<string, ServiceRedMetrics>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

interface ThroughputFailureMetrics {
  throughput: MetricDataPoint[];
  failureRatio: MetricDataPoint[];
}

/**
 * Hook for batch-fetching RED metrics for multiple services
 *
 * Fetches metrics for all services on current page in 3 batch queries:
 * - Latency: histogram_quantile over latency_seconds_seconds_bucket (dependent on percentile)
 * - Throughput: sum of request gauge
 * - Failure Ratio: (error + fault) / request * 100
 *
 * Note: request, error, and fault are GAUGE metrics (not counters)
 * Note: Latency is fetched separately so changing percentile only refetches latency
 *
 * @example
 * const { metricsMap, isLoading } = useServicesRedMetrics({
 *   services: [{ serviceName: 'service1', environment: 'prod' }],
 *   startTime: new Date(Date.now() - 3600000),
 *   endTime: new Date(),
 * });
 */
export const useServicesRedMetrics = (
  params: UseServicesRedMetricsParams
): UseServicesRedMetricsResult => {
  const { config } = useApmConfig();

  // Separate state for latency vs throughput/failure
  const [latencyMap, setLatencyMap] = useState<Map<string, MetricDataPoint[]>>(new Map());
  const [throughputFailureMap, setThroughputFailureMap] = useState<
    Map<string, ThroughputFailureMetrics>
  >(new Map());

  // Separate loading states
  const [isLoadingLatency, setIsLoadingLatency] = useState(false);
  const [isLoadingThroughputFailure, setIsLoadingThroughputFailure] = useState(false);

  // Separate error states
  const [latencyError, setLatencyError] = useState<Error | null>(null);
  const [throughputFailureError, setThroughputFailureError] = useState<Error | null>(null);

  // Separate refetch triggers
  const [refetchAllTrigger, setRefetchAllTrigger] = useState(0);

  // Get config values
  const prometheusConnectionId = config?.prometheusDataSource?.id;
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

  // Effect 1: Fetch throughput + failure rate (NOT dependent on latencyPercentile)
  useEffect(() => {
    if (params.services.length === 0 || !promqlService) {
      setThroughputFailureMap(new Map());
      setIsLoadingThroughputFailure(false);
      return;
    }

    const fetchThroughputFailure = async () => {
      setIsLoadingThroughputFailure(true);
      setThroughputFailureError(null);

      try {
        const throughputQuery = `
          sum by (service) (
            request{${serviceFilter},namespace="span_derived"}
          )
        `.trim();

        const failureRatioQuery = `
          (
            sum by (service) (error{${serviceFilter},namespace="span_derived"})
            +
            sum by (service) (fault{${serviceFilter},namespace="span_derived"})
          )
          /
          sum by (service) (request{${serviceFilter},namespace="span_derived"})
          * 100
        `.trim();

        const [throughputResp, failureRatioResp] = await Promise.all([
          promqlService.executeMetricRequest({
            query: throughputQuery,
            startTime: startTimeSec,
            endTime: endTimeSec,
          }),
          promqlService.executeMetricRequest({
            query: failureRatioQuery,
            startTime: startTimeSec,
            endTime: endTimeSec,
          }),
        ]);

        const newMap = new Map<string, ThroughputFailureMetrics>();
        params.services.forEach(({ serviceName }) => {
          newMap.set(serviceName, {
            throughput: extractServiceData(throughputResp, serviceName),
            failureRatio: extractServiceData(failureRatioResp, serviceName),
          });
        });

        setThroughputFailureMap(newMap);
      } catch (err) {
        console.error('[useServicesRedMetrics] Error fetching throughput/failure metrics:', err);
        setThroughputFailureError(err instanceof Error ? err : new Error('Unknown error'));
        setThroughputFailureMap(new Map());
      } finally {
        setIsLoadingThroughputFailure(false);
      }
    };

    fetchThroughputFailure();
    // Note: params.services is intentionally omitted to prevent infinite loops.
    // serviceFilter already tracks changes to the services list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promqlService, serviceFilter, startTimeSec, endTimeSec, refetchAllTrigger]);

  // Effect 2: Fetch latency (dependent on latencyPercentile)
  useEffect(() => {
    if (params.services.length === 0 || !promqlService) {
      setLatencyMap(new Map());
      setIsLoadingLatency(false);
      return;
    }

    const fetchLatency = async () => {
      setIsLoadingLatency(true);
      setLatencyError(null);

      try {
        const percentileValue =
          params.latencyPercentile === 'p50'
            ? 0.5
            : params.latencyPercentile === 'p90'
            ? 0.9
            : 0.99; // default p99

        const latencyQuery = `
          histogram_quantile(${percentileValue},
            sum by (service, le) (
              latency_seconds_seconds_bucket{${serviceFilter},namespace="span_derived"}
            )
          ) * 1000
        `.trim();

        const latencyResp = await promqlService.executeMetricRequest({
          query: latencyQuery,
          startTime: startTimeSec,
          endTime: endTimeSec,
        });

        const newMap = new Map<string, MetricDataPoint[]>();
        params.services.forEach(({ serviceName }) => {
          newMap.set(serviceName, extractServiceData(latencyResp, serviceName));
        });

        setLatencyMap(newMap);
      } catch (err) {
        console.error('[useServicesRedMetrics] Error fetching latency metrics:', err);
        setLatencyError(err instanceof Error ? err : new Error('Unknown error'));
        setLatencyMap(new Map());
      } finally {
        setIsLoadingLatency(false);
      }
    };

    fetchLatency();
    // Note: params.services is intentionally omitted to prevent infinite loops.
    // serviceFilter already tracks changes to the services list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    promqlService,
    serviceFilter,
    startTimeSec,
    endTimeSec,
    refetchAllTrigger,
    params.latencyPercentile,
  ]);

  // Combine latency and throughput/failure into metricsMap
  // Note: Use keys from the maps instead of params.services to avoid infinite loops
  // (params.services is a new array reference on every render due to .map() in caller)
  const metricsMap = useMemo(() => {
    const combined = new Map<string, ServiceRedMetrics>();

    // Collect all service names from both maps
    const serviceNames = new Set([...latencyMap.keys(), ...throughputFailureMap.keys()]);

    serviceNames.forEach((serviceName) => {
      const latencyData = latencyMap.get(serviceName) || [];
      const throughputData = throughputFailureMap.get(serviceName)?.throughput || [];
      const failureData = throughputFailureMap.get(serviceName)?.failureRatio || [];

      // Calculate averages over the time period
      const avgLatency =
        latencyData.length > 0
          ? latencyData.reduce((sum, point) => sum + point.value, 0) / latencyData.length
          : 0;
      const avgThroughput =
        throughputData.length > 0
          ? throughputData.reduce((sum, point) => sum + point.value, 0) / throughputData.length
          : 0;
      const avgFailureRatio =
        failureData.length > 0
          ? failureData.reduce((sum, point) => sum + point.value, 0) / failureData.length
          : 0;

      combined.set(serviceName, {
        latency: latencyData,
        avgLatency,
        throughput: throughputData,
        avgThroughput,
        failureRatio: failureData,
        avgFailureRatio,
      });
    });
    return combined;
  }, [latencyMap, throughputFailureMap]);

  // Combined loading state
  const isLoading = isLoadingLatency || isLoadingThroughputFailure;

  // Return first error encountered
  const error = latencyError || throughputFailureError;

  const refetch = useCallback(() => {
    setRefetchAllTrigger((prev) => prev + 1);
  }, []);

  return { metricsMap, isLoading, error, refetch };
};

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

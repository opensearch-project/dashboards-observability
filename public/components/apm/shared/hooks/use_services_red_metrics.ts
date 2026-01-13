/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { PromQLSearchService } from '../../services/promql_search_service';
import { getTimeInSeconds } from '../utils/time_utils';
import { useApmConfig } from '../../config/apm_config_context';

export interface ServiceRedMetrics {
  latency: MetricDataPoint[];
  throughput: MetricDataPoint[];
  failureRatio: MetricDataPoint[];
}

export interface MetricDataPoint {
  timestamp: number;
  value: number;
}

export interface UseServicesRedMetricsParams {
  services: Array<{ serviceName: string; environment?: string }>;
  startTime: Date;
  endTime: Date;
}

export interface UseServicesRedMetricsResult {
  metricsMap: Map<string, ServiceRedMetrics>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook for batch-fetching RED metrics for multiple services
 *
 * Fetches metrics for all services on current page in 3 batch queries:
 * - Latency (P95): histogram_quantile over latency_seconds_seconds_bucket
 * - Throughput: sum of request gauge
 * - Failure Ratio: (error + fault) / request * 100
 *
 * Note: request, error, and fault are GAUGE metrics (not counters)
 *
 * @example
 * const { metricsMap, isLoading } = useServicesRedMetrics({
 *   services: [{ serviceName: 'service1', environment: 'prod' }],
 *   startTime: new Date(Date.now() - 3600000),
 *   endTime: new Date(),
 *   prometheusConnectionId: 'my-prom',
 * });
 */
export const useServicesRedMetrics = (
  params: UseServicesRedMetricsParams
): UseServicesRedMetricsResult => {
  const { config } = useApmConfig();
  const [metricsMap, setMetricsMap] = useState<Map<string, ServiceRedMetrics>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // Get config values
  const prometheusConnectionId = config?.prometheusDataSource?.id;

  const promqlService = useMemo(() => {
    if (!prometheusConnectionId) {
      return null;
    }
    return new PromQLSearchService(prometheusConnectionId);
  }, [prometheusConnectionId]);

  // Build service filter (service=~"service1|service2|...")
  const serviceFilter = useMemo(() => {
    if (params.services.length === 0) return '';
    const serviceNames = params.services.map((s) => s.serviceName).join('|');
    return `service=~"${serviceNames}"`;
  }, [params.services]);

  // Memoize time values to avoid unnecessary re-fetches
  const startTimeSec = useMemo(() => getTimeInSeconds(params.startTime), [params.startTime]);
  const endTimeSec = useMemo(() => getTimeInSeconds(params.endTime), [params.endTime]);

  useEffect(() => {
    if (params.services.length === 0 || !promqlService) {
      setMetricsMap(new Map());
      setIsLoading(false);
      return;
    }

    const fetchBatchMetrics = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Build queries for all three metrics (batch query pattern)
        // Note: request, error, fault are GAUGES not counters, so no rate()
        const latencyQuery = `
          histogram_quantile(0.95,
            sum by (service, le) (
              latency_seconds_seconds_bucket{${serviceFilter},namespace="span_derived"}
            )
          )
        `.trim();

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

        // Execute all queries in parallel
        const [latencyResp, throughputResp, failureRatioResp] = await Promise.all([
          promqlService.executeMetricRequest({
            query: latencyQuery,
            startTime: startTimeSec,
            endTime: endTimeSec,
          }),
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

        // Transform responses into metrics map
        const newMetricsMap = new Map<string, ServiceRedMetrics>();

        params.services.forEach(({ serviceName }) => {
          const latencyData = extractServiceData(latencyResp, serviceName);
          const throughputData = extractServiceData(throughputResp, serviceName);
          const failureRatioData = extractServiceData(failureRatioResp, serviceName);

          newMetricsMap.set(serviceName, {
            latency: latencyData,
            throughput: throughputData,
            failureRatio: failureRatioData,
          });
        });

        setMetricsMap(newMetricsMap);
      } catch (err) {
        console.error('[useServicesRedMetrics] Error fetching batch metrics:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setMetricsMap(new Map());
      } finally {
        setIsLoading(false);
      }
    };

    fetchBatchMetrics();
    // Note: params.services is intentionally omitted to prevent infinite loops.
    // serviceFilter already tracks changes to the services list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promqlService, serviceFilter, startTimeSec, endTimeSec, refetchTrigger]);

  const refetch = () => {
    setRefetchTrigger((prev) => prev + 1);
  };

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

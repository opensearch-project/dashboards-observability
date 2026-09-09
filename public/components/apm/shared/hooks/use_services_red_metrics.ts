/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import {
  getQueryServicesThroughput,
  getQueryServicesThroughputTotal,
  getQueryServicesFailureRatio,
  getQueryServicesFailureRatioTotal,
  getQueryServicesLatency,
  getQueryServicesLatencyInstant,
} from '../../query_services/query_requests/promql_queries';
import { getTimeInSeconds, calculateTimeRangeDuration } from '../utils/time_utils';
import { calculateStep, RESOLUTION_LOW } from '../utils/step_utils';
import { useApmConfig } from '../../config/apm_config_context';

/**
 * Composite key for a service node. Metrics are grouped by (environment, service),
 * so the catalog keys rows on both to avoid summing a service across environments.
 */
export const serviceNodeKey = (serviceName: string, environment?: string): string =>
  `${serviceName}::${environment ?? ''}`;

export interface ServiceRedMetrics {
  latency: MetricDataPoint[];
  avgLatency: number; // True percentile over the full time range (via instant query)
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
 * - Latency: histogram_quantile over latency_seconds_bucket (dependent on percentile)
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
  // Total request counts per service (from sum_over_time instant query)
  const [totalCountMap, setTotalCountMap] = useState<Map<string, number>>(new Map());
  // Windowed failure ratio per service (ratio-of-sums over the range, unbiased)
  const [failureRatioInstantMap, setFailureRatioInstantMap] = useState<Map<string, number>>(
    new Map()
  );
  // Instant latency per service (true percentile over full time range)
  const [latencyInstantMap, setLatencyInstantMap] = useState<Map<string, number>>(new Map());

  // Separate loading states
  const [isLoadingLatency, setIsLoadingLatency] = useState(true);
  const [isLoadingThroughputFailure, setIsLoadingThroughputFailure] = useState(true);

  // Separate error states
  const [latencyError, setLatencyError] = useState<Error | null>(null);
  const [throughputFailureError, setThroughputFailureError] = useState<Error | null>(null);

  // Separate refetch triggers
  const [refetchAllTrigger, setRefetchAllTrigger] = useState(0);

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

  // Rely on `sum by (service)` grouping rather than a service=~"..." filter.
  // Embedding the full service list made this query grow past the 10,000-char
  // PromQL limit at scale; the grouping already yields one series per service.
  const serviceFilter = '';

  // Stable key over the service set, used only to retrigger fetches when the
  // set changes (the query itself no longer depends on the list).
  const servicesKey = useMemo(
    () => params.services.map((s) => s.serviceName).join('|'),
    [params.services]
  );

  // Memoize time values to avoid unnecessary re-fetches
  const startTimeSec = useMemo(() => getTimeInSeconds(params.startTime), [params.startTime]);
  const endTimeSec = useMemo(() => getTimeInSeconds(params.endTime), [params.endTime]);

  // Effect 1: Fetch throughput + failure rate (NOT dependent on latencyPercentile)
  useEffect(() => {
    if (params.services.length === 0 || !promqlService) {
      setThroughputFailureMap(new Map());
      setTotalCountMap(new Map());
      setFailureRatioInstantMap(new Map());
      setIsLoadingThroughputFailure(false);
      return;
    }

    const abortController = new AbortController();

    const fetchThroughputFailure = async () => {
      setIsLoadingThroughputFailure(true);
      setThroughputFailureError(null);

      const throughputQuery = getQueryServicesThroughput(serviceFilter);
      const failureRatioQuery = getQueryServicesFailureRatio(serviceFilter);
      const timeRangeDuration = calculateTimeRangeDuration(params.startTime, params.endTime);
      const totalQuery = getQueryServicesThroughputTotal(serviceFilter, timeRangeDuration);
      const failureRatioTotalQuery = getQueryServicesFailureRatioTotal(
        serviceFilter,
        timeRangeDuration
      );
      const step = calculateStep(startTimeSec, endTimeSec, RESOLUTION_LOW);

      // Settle each query independently: a single failure (e.g. a rejected
      // failure-ratio query) must not blank the throughput/total that succeeded.
      const [throughputResult, failureRatioResult, totalResult, failureRatioTotalResult] =
        await Promise.allSettled([
          promqlService.executeMetricRequest({
            query: throughputQuery,
            startTime: startTimeSec,
            endTime: endTimeSec,
            step,
            signal: abortController.signal,
          }),
          promqlService.executeMetricRequest({
            query: failureRatioQuery,
            startTime: startTimeSec,
            endTime: endTimeSec,
            step,
            signal: abortController.signal,
          }),
          promqlService.executeInstantQuery({
            query: totalQuery,
            time: endTimeSec,
            signal: abortController.signal,
          }),
          promqlService.executeInstantQuery({
            query: failureRatioTotalQuery,
            time: endTimeSec,
            signal: abortController.signal,
          }),
        ]);

      // Drop stale results if params changed while this fetch was in flight.
      if (abortController.signal.aborted) return;

      const throughputResp =
        throughputResult.status === 'fulfilled' ? throughputResult.value : null;
      const failureRatioResp =
        failureRatioResult.status === 'fulfilled' ? failureRatioResult.value : null;
      const totalResp = totalResult.status === 'fulfilled' ? totalResult.value : null;
      const failureRatioTotalResp =
        failureRatioTotalResult.status === 'fulfilled' ? failureRatioTotalResult.value : null;

      const newMap = new Map<string, ThroughputFailureMetrics>();
      const newTotalMap = new Map<string, number>();
      const newFailureRatioInstantMap = new Map<string, number>();
      params.services.forEach(({ serviceName, environment }) => {
        const key = serviceNodeKey(serviceName, environment);
        newMap.set(key, {
          throughput: extractServiceData(throughputResp, serviceName, environment),
          failureRatio: extractServiceData(failureRatioResp, serviceName, environment),
        });
        const data = extractServiceData(totalResp, serviceName, environment);
        newTotalMap.set(key, data.length > 0 ? data[0].value : 0);
        const frData = extractServiceData(failureRatioTotalResp, serviceName, environment);
        newFailureRatioInstantMap.set(key, frData.length > 0 ? frData[0].value : 0);
      });

      setThroughputFailureMap(newMap);
      setTotalCountMap(newTotalMap);
      setFailureRatioInstantMap(newFailureRatioInstantMap);

      const rejected = [
        throughputResult,
        failureRatioResult,
        totalResult,
        failureRatioTotalResult,
      ].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      if (rejected) {
        console.error(
          '[useServicesRedMetrics] Partial failure fetching throughput/failure metrics:',
          rejected.reason
        );
        setThroughputFailureError(
          rejected.reason instanceof Error ? rejected.reason : new Error('Unknown error')
        );
      }
      setIsLoadingThroughputFailure(false);
    };

    fetchThroughputFailure();

    return () => abortController.abort();
    // serviceFilter is constant; servicesKey tracks changes to the service set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promqlService, servicesKey, startTimeSec, endTimeSec, refetchAllTrigger]);

  // Effect 2: Fetch latency (dependent on latencyPercentile)
  useEffect(() => {
    if (params.services.length === 0 || !promqlService) {
      setLatencyMap(new Map());
      setIsLoadingLatency(false);
      return;
    }

    const abortController = new AbortController();

    const fetchLatency = async () => {
      setIsLoadingLatency(true);
      setLatencyError(null);

      const percentileValue =
        params.latencyPercentile === 'p50' ? 0.5 : params.latencyPercentile === 'p90' ? 0.9 : 0.99; // default p99

      const latencyQuery = getQueryServicesLatency(serviceFilter, percentileValue);
      const timeRangeDuration = calculateTimeRangeDuration(params.startTime, params.endTime);
      const latencyInstantQuery = getQueryServicesLatencyInstant(
        serviceFilter,
        percentileValue,
        timeRangeDuration
      );
      const step = calculateStep(startTimeSec, endTimeSec, RESOLUTION_LOW);

      const [latencyResult, latencyInstantResult] = await Promise.allSettled([
        promqlService.executeMetricRequest({
          query: latencyQuery,
          startTime: startTimeSec,
          endTime: endTimeSec,
          step,
          signal: abortController.signal,
        }),
        // Instant query for true percentile over the full time range
        promqlService.executeInstantQuery({
          query: latencyInstantQuery,
          time: endTimeSec,
          signal: abortController.signal,
        }),
      ]);

      if (abortController.signal.aborted) return;

      const latencyResp = latencyResult.status === 'fulfilled' ? latencyResult.value : null;
      const latencyInstantResp =
        latencyInstantResult.status === 'fulfilled' ? latencyInstantResult.value : null;

      const newMap = new Map<string, MetricDataPoint[]>();
      const newInstantMap = new Map<string, number>();
      params.services.forEach(({ serviceName, environment }) => {
        const key = serviceNodeKey(serviceName, environment);
        newMap.set(key, extractServiceData(latencyResp, serviceName, environment));
        const data = extractServiceData(latencyInstantResp, serviceName, environment);
        newInstantMap.set(key, data.length > 0 ? data[0].value : 0);
      });

      setLatencyMap(newMap);
      setLatencyInstantMap(newInstantMap);

      const rejected = [latencyResult, latencyInstantResult].find(
        (r) => r.status === 'rejected'
      ) as PromiseRejectedResult | undefined;
      if (rejected) {
        console.error(
          '[useServicesRedMetrics] Partial failure fetching latency metrics:',
          rejected.reason
        );
        setLatencyError(
          rejected.reason instanceof Error ? rejected.reason : new Error('Unknown error')
        );
      }
      setIsLoadingLatency(false);
    };

    fetchLatency();

    return () => abortController.abort();
    // serviceFilter is constant; servicesKey tracks changes to the service set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    promqlService,
    servicesKey,
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

      // Use instant query result for true percentile over full time range
      const avgLatency = latencyInstantMap.get(serviceName) || 0;
      // Use sum_over_time total / time range for accurate req/s
      // (plain gauge range query is inflated by Prometheus stale lookback)
      const timeRangeSeconds = endTimeSec - startTimeSec;
      const totalRequests = totalCountMap.get(serviceName) || 0;
      const avgThroughput = timeRangeSeconds > 0 ? totalRequests / timeRangeSeconds : 0;
      // Ratio-of-sums over the window (unbiased); fall back to the sparkline mean.
      const avgFailureRatio = failureRatioInstantMap.has(serviceName)
        ? failureRatioInstantMap.get(serviceName)!
        : failureData.length > 0
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
  }, [
    latencyMap,
    latencyInstantMap,
    throughputFailureMap,
    totalCountMap,
    failureRatioInstantMap,
    startTimeSec,
    endTimeSec,
  ]);

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
function extractServiceData(
  response: any,
  serviceName: string,
  environment?: string
): MetricDataPoint[] {
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
        // Parse series label: {environment="prod", service="ad"} -> match both
        const svcMatch = seriesLabel.match(/service="([^"]+)"/);
        const envMatch = seriesLabel.match(/environment="([^"]*)"/);
        const service = svcMatch ? svcMatch[1] : null;
        const env = envMatch ? envMatch[1] : undefined;

        if (service === serviceName && (environment === undefined || env === environment)) {
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
    const rows = response.meta.instantData.rows.filter(
      (row: any) =>
        row.service === serviceName &&
        (environment === undefined || row.environment === environment)
    );

    if (rows.length > 0) {
      return rows.map((row: any) => ({
        timestamp: row.Time / 1000, // Convert ms to seconds
        value: parseFloat(row.Value) || 0,
      }));
    }
  }

  // Standard Prometheus response format
  const result = response?.data?.result || response?.result || [];

  const serviceResult = result.find(
    (r: any) =>
      r.metric?.service === serviceName &&
      (environment === undefined || r.metric?.environment === environment)
  );

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

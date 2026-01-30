/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import { getTimeInSeconds, calculateTimeRangeDuration } from '../utils/time_utils';
import { getQueryServiceDependenciesByFaultRateAvg } from '../../query_services/query_requests/promql_queries';
import { useApmConfig } from '../../config/apm_config_context';

export interface ServiceDependencyFaultRateItem {
  remoteService: string;
  faultRate: number;
}

export interface UseServiceDependenciesByFaultRateParams {
  serviceName: string;
  environment: string;
  startTime: Date;
  endTime: Date;
  limit?: number;
  refreshTrigger?: number;
}

export interface UseServiceDependenciesByFaultRateResult {
  data: ServiceDependencyFaultRateItem[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook for fetching top dependencies by fault rate for a specific service
 *
 * Uses getQueryServiceDependenciesByFaultRateAvg with sum_over_time for accurate
 * total rate calculation. Returns data grouped by remoteService.
 *
 * @example
 * const { data, isLoading } = useServiceDependenciesByFaultRate({
 *   serviceName: 'frontend',
 *   environment: 'generic:default',
 *   startTime: new Date(Date.now() - 3600000),
 *   endTime: new Date(),
 *   limit: 5,
 * });
 */
export const useServiceDependenciesByFaultRate = (
  params: UseServiceDependenciesByFaultRateParams
): UseServiceDependenciesByFaultRateResult => {
  const { config } = useApmConfig();
  const [data, setData] = useState<ServiceDependencyFaultRateItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // Get config values
  const prometheusConnectionId = config?.prometheusDataSource?.id;
  const prometheusConnectionMeta = config?.prometheusDataSource?.meta;

  const promqlSearchService = useMemo(() => {
    if (!prometheusConnectionId) {
      return null;
    }
    return new PromQLSearchService(prometheusConnectionId, prometheusConnectionMeta);
  }, [prometheusConnectionId, prometheusConnectionMeta]);

  const fetchParams = useMemo(
    () => ({
      startTime: getTimeInSeconds(params.startTime),
      endTime: getTimeInSeconds(params.endTime),
      timeRange: calculateTimeRangeDuration(params.startTime, params.endTime),
      limit: params.limit || 5,
    }),
    [params.startTime, params.endTime, params.limit]
  );

  useEffect(() => {
    // Skip fetching if no Prometheus connection is configured
    if (!promqlSearchService) {
      setIsLoading(false);
      setData([]);
      return;
    }

    // Skip if serviceName or environment is missing
    if (!params.serviceName || !params.environment) {
      setIsLoading(false);
      setData([]);
      return;
    }

    const fetchTopDependencies = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Use sum_over_time query for accurate total rate calculation
        const query = getQueryServiceDependenciesByFaultRateAvg(
          params.environment,
          params.serviceName,
          fetchParams.timeRange
        );

        const response = await promqlSearchService.executeMetricRequest({
          query,
          startTime: fetchParams.startTime,
          endTime: fetchParams.endTime,
        });

        // Process response - handle data frame format from query enhancements plugin
        const dependencies: ServiceDependencyFaultRateItem[] = [];

        // Check for data frame format with instantData
        if (response?.meta?.instantData?.rows && Array.isArray(response.meta.instantData.rows)) {
          response.meta.instantData.rows.forEach((row: any) => {
            const remoteService = row.remoteService || 'unknown';
            const faultRate = parseFloat(row.Value) || 0;

            dependencies.push({
              remoteService,
              faultRate,
            });
          });
        }
        // Fallback to standard Prometheus response format
        else if (response?.data?.result) {
          response.data.result.forEach((series: any) => {
            const remoteService = series.metric.remoteService || 'unknown';

            // Instant query format: [timestamp, value]
            // The query uses sum_over_time so it returns a single aggregated value
            let faultRate = 0;
            if (series.value && Array.isArray(series.value) && series.value.length > 1) {
              faultRate = parseFloat(series.value[1]) || 0;
            }

            dependencies.push({
              remoteService,
              faultRate,
            });
          });
        }

        // Sort by fault rate descending and filter out 0% rates
        const sortedAndFiltered = dependencies
          .filter((dep) => dep.faultRate > 0)
          .sort((a, b) => b.faultRate - a.faultRate)
          .slice(0, fetchParams.limit);

        setData(sortedAndFiltered);
      } catch (err) {
        console.error('[useServiceDependenciesByFaultRate] Error:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTopDependencies();
  }, [
    promqlSearchService,
    fetchParams,
    refetchTrigger,
    params.refreshTrigger,
    params.serviceName,
    params.environment,
  ]);

  const refetch = () => {
    setRefetchTrigger((prev) => prev + 1);
  };

  return { data, isLoading, error, refetch };
};

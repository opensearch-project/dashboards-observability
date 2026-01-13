/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { PromQLSearchService } from '../../services/promql_search_service';
import { getTimeInSeconds } from '../utils/time_utils';
import { QUERY_TOP_SERVICES_BY_FAULT_RATE } from '../../services/query_requests/promql_queries';
import { useApmConfig } from '../../config/apm_config_context';

export interface ServiceFaultRateItem {
  serviceName: string;
  environment: string;
  faultRate: number;
  faultCount: number;
  totalCount: number;
}

export interface UseTopServicesByFaultRateParams {
  startTime: Date;
  endTime: Date;
  limit?: number;
  refreshTrigger?: number;
}

export interface UseTopServicesByFaultRateResult {
  data: ServiceFaultRateItem[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook for fetching top services by fault rate using PromQL
 *
 * Calculates fault rate as: (sum of failed requests) / (sum of total requests)
 * Returns top N services sorted by fault rate descending
 *
 * @example
 * const { data, isLoading } = useTopServicesByFaultRate({
 *   startTime: new Date(Date.now() - 3600000),
 *   endTime: new Date(),
 *   limit: 5,
 * });
 */
export const useTopServicesByFaultRate = (
  params: UseTopServicesByFaultRateParams
): UseTopServicesByFaultRateResult => {
  const { config } = useApmConfig();
  const [data, setData] = useState<ServiceFaultRateItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // Get config values
  const prometheusConnectionId = config?.prometheusDataSource?.id;

  const promqlSearchService = useMemo(() => {
    if (!prometheusConnectionId) {
      return null;
    }
    return new PromQLSearchService(prometheusConnectionId);
  }, [prometheusConnectionId]);

  const fetchParams = useMemo(
    () => ({
      startTime: getTimeInSeconds(params.startTime),
      endTime: getTimeInSeconds(params.endTime),
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

    const fetchTopServices = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Use the standardized query from promql_queries.ts
        // This query calculates: topk(5, sum(fault) / sum(request))
        const response = await promqlSearchService.executeMetricRequest({
          query: QUERY_TOP_SERVICES_BY_FAULT_RATE,
          startTime: fetchParams.startTime,
          endTime: fetchParams.endTime,
        });

        // Process response - handle data frame format from query enhancements plugin
        const services: ServiceFaultRateItem[] = [];

        // Check for data frame format with instantData
        if (response?.meta?.instantData?.rows && Array.isArray(response.meta.instantData.rows)) {
          response.meta.instantData.rows.forEach((row: any) => {
            const serviceName = row.service || 'unknown';
            const environment = row.environment || 'unknown';
            const faultRate = parseFloat(row.Value) || 0;

            services.push({
              serviceName,
              environment,
              faultRate,
              faultCount: 0, // Not available from this query
              totalCount: 0, // Not available from this query
            });
          });
        }
        // Fallback to standard Prometheus response format
        else {
          const result = response?.data?.result || response?.result;

          if (result && Array.isArray(result)) {
            result.forEach((series: any) => {
              const serviceName =
                series.metric?.service || series.metric?.service_name || 'unknown';
              const environment = series.metric?.environment || 'unknown';

              // Handle both instant query (value) and range query (values) formats
              let faultRate = 0;
              if (series.value && Array.isArray(series.value) && series.value.length > 1) {
                // Instant query format: [timestamp, value]
                faultRate = parseFloat(series.value[1]) || 0;
              } else if (
                series.values &&
                Array.isArray(series.values) &&
                series.values.length > 0
              ) {
                // Range query format: [[timestamp, value], ...]
                faultRate = parseFloat(series.values[series.values.length - 1][1]) || 0;
              }

              services.push({
                serviceName,
                environment,
                faultRate,
                faultCount: 0, // Not available from this query
                totalCount: 0, // Not available from this query
              });
            });
          }
        }

        // Sort by fault rate descending and filter out 0% rates
        const sortedAndFiltered = services
          .filter((service) => service.faultRate > 0)
          .sort((a, b) => b.faultRate - a.faultRate)
          .slice(0, fetchParams.limit);

        setData(sortedAndFiltered);
      } catch (err) {
        console.error('[useTopServicesByFaultRate] Error:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTopServices();
  }, [promqlSearchService, fetchParams, refetchTrigger, params.refreshTrigger]);

  const refetch = () => {
    setRefetchTrigger((prev) => prev + 1);
  };

  return { data, isLoading, error, refetch };
};

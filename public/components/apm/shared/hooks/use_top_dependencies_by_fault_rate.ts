/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import { getTimeInSeconds, calculateTimeRangeDuration } from '../utils/time_utils';
import { getQueryTopDependenciesByFaultRateAvg } from '../../query_services/query_requests/promql_queries';
import { useApmConfig } from '../../config/apm_config_context';

export interface DependencyFaultRateItem {
  source: string;
  target: string;
  environment: string;
  faultRate: number;
  faultCount: number;
  totalCount: number;
}

export interface UseTopDependenciesByFaultRateParams {
  startTime: Date;
  endTime: Date;
  limit?: number;
  refreshTrigger?: number;
  /** Selector fragment bounding the calling services to the page's filters. */
  callerFilter?: string;
  /** Target selector bounding the dependencies (default every target). */
  remoteFilter?: string;
  /**
   * Keep only rows in the page's scope, applied before the top `limit` are taken. Needed when
   * the query filter is broader than the scope (see `queryLimit`).
   */
  include?: (item: DependencyFaultRateItem) => boolean;
  /** topk size; larger than `limit` when `include` drops rows the query could not exclude. */
  queryLimit?: number;
  /** When false nothing is fetched (e.g. the service list for the range is still loading). */
  enabled?: boolean;
  /** The page's filters match nothing of this kind: show no rows, query nothing. */
  skip?: boolean;
}

export interface UseTopDependenciesByFaultRateResult {
  data: DependencyFaultRateItem[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const FILTERED_FETCH_DEBOUNCE_MS = 300;

/**
 * Hook for fetching top service dependencies by fault rate using PromQL
 *
 * Calculates fault rate per dependency path (source -> target)
 * Returns top N dependencies sorted by fault rate descending
 *
 * @example
 * const { data, isLoading } = useTopDependenciesByFaultRate({
 *   startTime: new Date(Date.now() - 3600000),
 *   endTime: new Date(),
 *   limit: 5,
 * });
 */
export const useTopDependenciesByFaultRate = (
  params: UseTopDependenciesByFaultRateParams
): UseTopDependenciesByFaultRateResult => {
  const { config } = useApmConfig();
  const [data, setData] = useState<DependencyFaultRateItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // Get config values
  // Use .name (connectionId) for PromQL queries, not .id (saved object ID)
  const prometheusConnectionId = config?.prometheusDataSource?.name;
  const prometheusConnectionMeta = config?.prometheusDataSource?.meta;

  const promqlSearchService = useMemo(() => {
    if (!prometheusConnectionId) {
      return null;
    }
    return new PromQLSearchService(prometheusConnectionId, prometheusConnectionMeta);
  }, [prometheusConnectionId, prometheusConnectionMeta]);

  const limit = params.limit || 5;
  const fetchParams = useMemo(
    () => ({
      endTime: getTimeInSeconds(params.endTime),
      timeRange: calculateTimeRangeDuration(params.startTime, params.endTime),
      limit,
      queryLimit: Math.max(limit, params.queryLimit ?? limit),
      callerFilter: params.callerFilter ?? '',
      remoteFilter: params.remoteFilter,
    }),
    [
      params.startTime,
      params.endTime,
      limit,
      params.queryLimit,
      params.callerFilter,
      params.remoteFilter,
    ]
  );
  const includeRef = useRef(params.include);
  includeRef.current = params.include;
  const enabled = params.enabled ?? true;
  const filtered = !!fetchParams.callerFilter || fetchParams.remoteFilter !== undefined;

  useEffect(() => {
    // Skip fetching if no Prometheus connection is configured
    if (!promqlSearchService || params.skip) {
      setIsLoading(false);
      setData([]);
      return;
    }
    if (!enabled) {
      setIsLoading(true);
      return;
    }

    // Cancel on a time change / refresh so a late response cannot overwrite newer data.
    const abortController = new AbortController();

    const fetchTopDependencies = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Use sum_over_time query for accurate total rate calculation
        const query = getQueryTopDependenciesByFaultRateAvg(
          fetchParams.timeRange,
          fetchParams.queryLimit,
          fetchParams.callerFilter,
          fetchParams.remoteFilter
        );
        const response = await promqlSearchService.executeInstantQuery({
          query,
          time: fetchParams.endTime,
          signal: abortController.signal,
        });
        if (abortController.signal.aborted) return;

        // Process response - handle data frame format from query enhancements plugin
        const dependencies: DependencyFaultRateItem[] = [];

        // Check for data frame format with instantData
        if (response?.meta?.instantData?.rows && Array.isArray(response.meta.instantData.rows)) {
          response.meta.instantData.rows.forEach((row: any) => {
            const source = row.service || 'unknown';
            const target = row.remoteService || 'unknown';
            const environment = row.environment || 'unknown';
            const faultRate = parseFloat(row.Value) || 0;

            dependencies.push({
              source,
              target,
              environment,
              faultRate,
              faultCount: 0, // Not available from this query
              totalCount: 0, // Not available from this query
            });
          });
        }
        // Fallback to standard Prometheus response format
        else if (response?.data?.result) {
          response.data.result.forEach((series: any) => {
            const source = series.metric.service || 'unknown';
            const target = series.metric.remoteService || 'unknown';
            const environment = series.metric.environment || 'unknown';

            // Instant query format: [timestamp, value]
            // The query uses sum_over_time so it returns a single aggregated value
            let faultRate = 0;
            if (series.value && Array.isArray(series.value) && series.value.length > 1) {
              faultRate = parseFloat(series.value[1]) || 0;
            }

            dependencies.push({
              source,
              target,
              environment,
              faultRate,
              faultCount: 0, // Not available from this query
              totalCount: 0, // Not available from this query
            });
          });
        }

        // Sort by fault rate descending and filter out 0% rates
        const sortedAndFiltered = dependencies
          .filter((dep) => dep.faultRate > 0 && (includeRef.current?.(dep) ?? true))
          .sort((a, b) => b.faultRate - a.faultRate)
          .slice(0, fetchParams.limit);

        setData(sortedAndFiltered);
      } catch (err) {
        if (abortController.signal.aborted) return;
        console.error('[useTopDependenciesByFaultRate] Error:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setData([]);
      } finally {
        if (!abortController.signal.aborted) setIsLoading(false);
      }
    };

    // Debounce a filtered fetch so typing a search sends one query for the settled filter.
    setIsLoading(true);
    const timer = filtered
      ? setTimeout(fetchTopDependencies, FILTERED_FETCH_DEBOUNCE_MS)
      : undefined;
    if (!filtered) fetchTopDependencies();

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    promqlSearchService,
    fetchParams,
    enabled,
    params.skip,
    refetchTrigger,
    params.refreshTrigger,
  ]);

  const refetch = () => {
    setRefetchTrigger((prev) => prev + 1);
  };

  return { data, isLoading, error, refetch };
};

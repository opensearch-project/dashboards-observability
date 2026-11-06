/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import { getTimeInSeconds, calculateTimeRangeDuration } from '../utils/time_utils';
import { getQueryTopDependenciesByFaultRateAvg } from '../../query_services/query_requests/promql_queries';
import { BatchLimiter, runBatched, servicesPageBatchLimiter } from '../utils/name_batches';
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
   * Caller selector fragments (e.g. `service=~"a|b"`), one per name batch. When given, the topk
   * runs once per batch and the results are merged, so the query never scans every caller in
   * the workspace when the page's scope is too long for one name list. The overall top N is
   * within the per-batch top Ns, so the merge is exact.
   */
  callerBatches?: string[];
  /**
   * Target selector fragments (e.g. `remoteService=~"a|b"`), one per dependency name batch, used
   * when no caller list bounds the query (a dependency-type filter). The topk runs once per batch
   * and the results are merged; the batches partition the targets and the query groups by
   * `remoteService`, so the merge is exact. Ignored when `callerBatches` is given.
   */
  remoteBatches?: string[];
  /** Limiter shared with the page's other batched queries (see BatchLimiter). */
  limiter?: BatchLimiter;
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
  // Identity of the caller batches (the array itself is rebuilt by the caller on every render).
  const callerBatchesKey = (params.callerBatches ?? []).join('&');
  const remoteBatchesKey = (params.remoteBatches ?? []).join('&');
  const fetchParams = useMemo(
    () => ({
      endTime: getTimeInSeconds(params.endTime),
      timeRange: calculateTimeRangeDuration(params.startTime, params.endTime),
      limit,
      queryLimit: Math.max(limit, params.queryLimit ?? limit),
      callerFilter: params.callerFilter ?? '',
      remoteFilter: params.remoteFilter,
      callerBatchesKey,
      remoteBatchesKey,
    }),
    [
      params.startTime,
      params.endTime,
      limit,
      params.queryLimit,
      params.callerFilter,
      params.remoteFilter,
      callerBatchesKey,
      remoteBatchesKey,
    ]
  );
  const callerBatchesRef = useRef(params.callerBatches);
  callerBatchesRef.current = params.callerBatches;
  const remoteBatchesRef = useRef(params.remoteBatches);
  remoteBatchesRef.current = params.remoteBatches;
  const limiterRef = useRef(params.limiter ?? servicesPageBatchLimiter);
  limiterRef.current = params.limiter ?? servicesPageBatchLimiter;
  const includeRef = useRef(params.include);
  includeRef.current = params.include;
  const enabled = params.enabled ?? true;
  const filtered =
    !!fetchParams.callerFilter ||
    fetchParams.remoteFilter !== undefined ||
    !!fetchParams.callerBatchesKey ||
    !!fetchParams.remoteBatchesKey;

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
        // Use sum_over_time query for accurate total rate calculation. One query, or one per
        // caller batch (see `callerBatches`) or target batch (see `remoteBatches`), merged below.
        const runFor = (callerFilter?: string, remoteFilter?: string) =>
          promqlSearchService.executeInstantQuery({
            query: getQueryTopDependenciesByFaultRateAvg(
              fetchParams.timeRange,
              fetchParams.queryLimit,
              callerFilter,
              remoteFilter
            ),
            time: fetchParams.endTime,
            signal: abortController.signal,
          });
        const callerBatches = callerBatchesRef.current ?? [];
        const remoteBatches = remoteBatchesRef.current ?? [];
        const batches: Array<{ callerFilter?: string; remoteFilter?: string }> =
          callerBatches.length > 0
            ? callerBatches.map((c) => ({
                callerFilter: c,
                remoteFilter: fetchParams.remoteFilter,
              }))
            : remoteBatches.map((r) => ({
                callerFilter: fetchParams.callerFilter,
                remoteFilter: r,
              }));
        let responses: any[];
        if (batches.length > 0) {
          // All-or-nothing: the first failed batch stops the rest from being sent.
          const settled = await runBatched(batches, (b) => runFor(b.callerFilter, b.remoteFilter), {
            signal: abortController.signal,
            failFast: true,
            limiter: limiterRef.current,
          });
          const rejected = settled.find((r) => r.status === 'rejected') as
            PromiseRejectedResult | undefined;
          if (rejected) throw rejected.reason;
          responses = settled.map((r) => (r as PromiseFulfilledResult<unknown>).value);
        } else {
          responses = [await runFor(fetchParams.callerFilter, fetchParams.remoteFilter)];
        }
        if (abortController.signal.aborted) return;

        // Process response - handle data frame format from query enhancements plugin
        const dependencies: DependencyFaultRateItem[] = [];
        responses.forEach((response: any) => {
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
        });

        // Sort by fault rate descending and filter out 0% rates. Batched results are first cut
        // to the top `queryLimit` overall, the same rows one unbatched topk would return.
        const sortedAndFiltered = dependencies
          .sort((a, b) => b.faultRate - a.faultRate)
          .slice(0, batches.length > 0 ? fetchParams.queryLimit : dependencies.length)
          .filter((dep) => dep.faultRate > 0 && (includeRef.current?.(dep) ?? true))
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

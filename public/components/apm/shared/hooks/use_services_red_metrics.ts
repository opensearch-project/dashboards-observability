/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import {
  getQueryServicesThroughput,
  getQueryServicesThroughputTotal,
  getQueryServicesFailureRatio,
  getQueryServicesFailureRatioTotal,
  getQueryServicesLatency,
  getQueryServicesLatencyInstant,
  getQueryServiceMapDependencyThroughput,
  getQueryServiceMapDependencyFailureRatioTotal,
  getQueryServiceMapDependencyLatencyInstant,
  getQueryServiceMapDependencyThroughputRange,
  getQueryServiceMapDependencyFailureRatioRange,
  getQueryServiceMapDependencyLatencyRange,
  dependencyNamesFilter,
} from '../../query_services/query_requests/promql_queries';
import { escapePromQLRegex } from '../../query_services/query_requests/escape_utils';
import { getTimeInSeconds, calculateTimeRangeDuration } from '../utils/time_utils';
import { calculateStep, RESOLUTION_LOW } from '../utils/step_utils';
import { useApmConfig } from '../../config/apm_config_context';
import { isDependencyType } from '../utils/platform_utils';

// Debounce for the visible-page sparkline fetch: skimming past pages within
// this window will not fire a request for each intermediate page.
const SPARKLINE_FETCH_DEBOUNCE_MS = 250;

// The instant queries read every sample in the window (sum_over_time over the
// full range), so their cost grows with both the range and the matched series.
// A scoped (filtered) catalog bounds them with service=~ / remoteService=~ name
// lists. Above this length the list is dropped and the query runs unbounded,
// keeping every query clear of the 10,000-char PromQL limit (the dependency
// failure-ratio query repeats its selector six times).
const MAX_SCOPED_FILTER_CHARS = 1200;

// Debounce for scoped instant fetches, so typing a search issues one query set
// for the settled filter rather than one per keystroke.
const SCOPED_FETCH_DEBOUNCE_MS = 300;

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
  /**
   * All services in the catalog — instant metrics (numbers, sort, filter).
   * `environment` should be provided: it is part of the metrics-map key and the
   * per-series match. If omitted, a series is matched by name alone, which can
   * blend or pick an arbitrary environment for a name that spans several.
   */
  services: Array<{ serviceName: string; environment?: string; type?: string }>;
  /**
   * Services on the currently visible table page. Sparklines (per-step range
   * queries) are fetched only for these; omit/empty to fetch none.
   *
   * `type` distinguishes instrumented services from inferred dependency nodes
   * (database / messaging / external). Dependency nodes are excluded from the
   * sparkline `service=~"..."` filter: they have no `service="<name>"` series
   * (their metrics are caller-derived via `remoteService=`), and their names
   * often contain regex metacharacters (e.g. `api.openai.com:443`) which the
   * direct-query connector rejects in a range query — one such name empties the
   * whole batch, blanking every row's sparkline on the page.
   */
  sparklineServices?: Array<{ serviceName: string; environment?: string; type?: string }>;
  /**
   * The subset of `services` the page currently shows (search / environment /
   * type / attribute filters applied; metric-range filters NOT applied, since
   * those are evaluated on these metrics). When narrower than `services`, the
   * instant queries are bounded to these names and metricsMap covers only them.
   * Omit to fetch every service.
   */
  scopeServices?: Array<{ serviceName: string; environment?: string; type?: string }>;
  startTime: Date;
  endTime: Date;
  latencyPercentile?: 'p99' | 'p90' | 'p50';
  /**
   * When false, no query is issued (in-flight ones are cancelled) and the hook
   * reports loading. Pass false while `services` is still being fetched for the
   * current time range, so the metrics are not queried once with the previous
   * range's list and again when the new list lands. Defaults to true.
   */
  enabled?: boolean;
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
  const enabled = params.enabled ?? true;
  const prometheusConnectionMeta = config?.prometheusDataSource?.meta;

  const promqlService = useMemo(() => {
    if (!prometheusConnectionId) {
      return null;
    }
    return new PromQLSearchService(prometheusConnectionId, prometheusConnectionMeta);
  }, [prometheusConnectionId, prometheusConnectionMeta]);

  // The rows the instant metrics are fetched for: the page's filtered subset
  // when one is given, otherwise the whole catalog.
  const scope = params.scopeServices ?? params.services;
  const isScoped = !!params.scopeServices && params.scopeServices.length < params.services.length;

  // Stable keys over the catalog and the scoped set, used to retrigger fetches
  // when either changes.
  const nodeSetKey = (rows: typeof scope) =>
    rows.map((s) => `${serviceNodeKey(s.serviceName, s.environment)}::${s.type || ''}`).join('|');
  const catalogKey = nodeSetKey(params.services);
  const scopeKey = isScoped ? nodeSetKey(scope) : catalogKey;

  // Instant-query name filters. Unscoped, the full catalog relies on
  // `sum by (service)` grouping with no list filter (a full list would pass the
  // PromQL length limit at scale). Scoped, the queries are bounded to the
  // filtered names, unless the list is too long to embed.
  const catalogHasDependencies = params.services.some((s) => isDependencyType(s.type));
  const instantFilters = useMemo(() => {
    const unbounded = {
      bounded: false,
      serviceFilter: '',
      dependencyFilter: undefined as string | undefined,
      // Caller-derived (remoteService=) queries run only when the catalog has
      // dependency rows, so a service-only catalog (feature off / older data)
      // issues exactly the service queries.
      runServices: true,
      runDependencies: catalogHasDependencies,
    };
    if (!isScoped) return unbounded;

    const unique = (rows: typeof scope) => Array.from(new Set(rows.map((s) => s.serviceName)));
    const serviceNames = unique(scope.filter((s) => !isDependencyType(s.type)));
    const dependencyNames = unique(scope.filter((s) => isDependencyType(s.type)));
    const serviceFilter =
      serviceNames.length > 0 ? `service=~"${serviceNames.map(escapePromQLRegex).join('|')}"` : '';
    const dependencyFilter =
      dependencyNames.length > 0 ? dependencyNamesFilter(dependencyNames) : undefined;
    if (
      serviceFilter.length > MAX_SCOPED_FILTER_CHARS ||
      (dependencyFilter?.length ?? 0) > MAX_SCOPED_FILTER_CHARS
    ) {
      return unbounded;
    }
    return {
      bounded: true,
      serviceFilter,
      dependencyFilter,
      runServices: serviceNames.length > 0,
      runDependencies: dependencyNames.length > 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, isScoped, catalogHasDependencies]);

  // Generation key of the last unbounded instant fetch that fully succeeded, per
  // effect. Its maps cover the whole catalog, so for the same catalog, time
  // range and refresh generation, narrowing (or clearing) a filter is served
  // from them with no new request.
  const unboundedThroughputGen = useRef<string | null>(null);
  const unboundedLatencyGen = useRef<string | null>(null);

  // Unique service names on the visible page — used to build the bounded
  // `service=~"..."` range filter (grouped by (environment, service), so one
  // fetch returns every environment for those names).
  const sparklineNames = Array.from(
    new Set((params.sparklineServices ?? []).map((s) => s.serviceName))
  );
  // Key on (name, env) so any change to the visible node set (including an
  // environment-only page change) retriggers Effect 3, which then fetches only
  // the not-yet-cached nodes. sparklineKey drives refetch on page change.
  const sparklineKey = (params.sparklineServices ?? [])
    .map((s) => serviceNodeKey(s.serviceName, s.environment))
    .join('|');

  // Memoize time values to avoid unnecessary re-fetches
  const startTimeSec = useMemo(() => getTimeInSeconds(params.startTime), [params.startTime]);
  const endTimeSec = useMemo(() => getTimeInSeconds(params.endTime), [params.endTime]);

  // Effect 1: instant throughput total + failure ratio for every scoped service.
  // These drive the displayed numbers, sorting, and the range filters, so they
  // must cover every row the page can show. No per-step (sparkline) data is
  // fetched here.
  useEffect(() => {
    if (params.services.length === 0 || !promqlService) {
      unboundedThroughputGen.current = null;
      setTotalCountMap(new Map());
      setFailureRatioInstantMap(new Map());
      setIsLoadingThroughputFailure(false);
      return;
    }
    if (!enabled) {
      setIsLoadingThroughputFailure(true);
      return;
    }
    // A filter matching no rows needs no metrics; keep the maps for reuse.
    if (scope.length === 0) {
      setIsLoadingThroughputFailure(false);
      return;
    }

    const gen = `${catalogKey}|${startTimeSec}|${endTimeSec}|${refetchAllTrigger}`;
    if (unboundedThroughputGen.current === gen) {
      setIsLoadingThroughputFailure(false);
      return;
    }

    const abortController = new AbortController();
    const { bounded, serviceFilter, dependencyFilter, runServices, runDependencies } =
      instantFilters;

    const fetchInstant = async () => {
      unboundedThroughputGen.current = null;

      const timeRangeDuration = calculateTimeRangeDuration(params.startTime, params.endTime);
      const totalQuery = getQueryServicesThroughputTotal(serviceFilter, timeRangeDuration);
      const failureRatioTotalQuery = getQueryServicesFailureRatioTotal(
        serviceFilter,
        timeRangeDuration
      );
      // Dependency (database / messaging / external) rows have no SERVER-span
      // series; these caller-derived (remoteService=) queries fill them in.
      const depTotalQuery = getQueryServiceMapDependencyThroughput(
        timeRangeDuration,
        dependencyFilter
      );
      const depFailureRatioQuery = getQueryServiceMapDependencyFailureRatioTotal(
        timeRangeDuration,
        dependencyFilter
      );

      const runInstant = (query: string) =>
        promqlService.executeInstantQuery({
          query,
          time: endTimeSec,
          signal: abortController.signal,
        });
      const skipped = Promise.resolve(null);
      const [totalResult, failureRatioTotalResult, depTotalResult, depFailureRatioResult] =
        await Promise.allSettled([
          runServices ? runInstant(totalQuery) : skipped,
          runServices ? runInstant(failureRatioTotalQuery) : skipped,
          ...(runDependencies ? [runInstant(depTotalQuery), runInstant(depFailureRatioQuery)] : []),
        ]);

      // Drop stale results if params changed while this fetch was in flight.
      if (abortController.signal.aborted) return;

      const totalResp = totalResult.status === 'fulfilled' ? totalResult.value : null;
      const failureRatioTotalResp =
        failureRatioTotalResult.status === 'fulfilled' ? failureRatioTotalResult.value : null;
      const depTotalResp = depTotalResult?.status === 'fulfilled' ? depTotalResult.value : null;
      const depFailureRatioResp =
        depFailureRatioResult?.status === 'fulfilled' ? depFailureRatioResult.value : null;

      const newTotalMap = new Map<string, number>();
      const newFailureRatioInstantMap = new Map<string, number>();
      // An unbounded fetch fills the whole catalog (what the reuse check relies on).
      (bounded ? scope : params.services).forEach(({ serviceName, environment, type }) => {
        const key = serviceNodeKey(serviceName, environment);
        // Dependency rows use caller-derived metrics (they have no server data);
        // service rows keep the SERVER-span series only.
        const isDependency = isDependencyType(type);
        const data = extractServiceData(
          isDependency ? depTotalResp : totalResp,
          serviceName,
          environment
        );
        newTotalMap.set(key, data.length > 0 ? data[0].value : 0);
        const frData = extractServiceData(
          isDependency ? depFailureRatioResp : failureRatioTotalResp,
          serviceName,
          environment
        );
        newFailureRatioInstantMap.set(key, frData.length > 0 ? frData[0].value : 0);
      });

      setTotalCountMap(newTotalMap);
      setFailureRatioInstantMap(newFailureRatioInstantMap);

      const rejected = [
        totalResult,
        failureRatioTotalResult,
        depTotalResult,
        depFailureRatioResult,
      ].find((r) => r?.status === 'rejected') as PromiseRejectedResult | undefined;
      if (rejected) {
        console.error(
          '[useServicesRedMetrics] Partial failure fetching instant metrics:',
          rejected.reason
        );
        setThroughputFailureError(
          rejected.reason instanceof Error ? rejected.reason : new Error('Unknown error')
        );
      } else if (!bounded) {
        unboundedThroughputGen.current = gen;
      }
      setIsLoadingThroughputFailure(false);
    };

    setIsLoadingThroughputFailure(true);
    setThroughputFailureError(null);
    const timer = bounded ? setTimeout(fetchInstant, SCOPED_FETCH_DEBOUNCE_MS) : undefined;
    if (!bounded) fetchInstant();

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
    // scopeKey / instantFilters track changes to the scoped service set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    promqlService,
    enabled,
    catalogKey,
    scopeKey,
    instantFilters,
    startTimeSec,
    endTimeSec,
    refetchAllTrigger,
  ]);

  // Effect 2: instant latency percentile for every scoped service (drives the number
  // and latency sort/filter). Sparkline handled by Effect 3.
  useEffect(() => {
    if (params.services.length === 0 || !promqlService) {
      unboundedLatencyGen.current = null;
      setLatencyInstantMap(new Map());
      setIsLoadingLatency(false);
      return;
    }
    if (!enabled) {
      setIsLoadingLatency(true);
      return;
    }
    if (scope.length === 0) {
      setIsLoadingLatency(false);
      return;
    }

    const gen = `${catalogKey}|${startTimeSec}|${endTimeSec}|${refetchAllTrigger}|${params.latencyPercentile}`;
    if (unboundedLatencyGen.current === gen) {
      setIsLoadingLatency(false);
      return;
    }

    const abortController = new AbortController();
    const { bounded, serviceFilter, dependencyFilter, runServices, runDependencies } =
      instantFilters;

    const fetchLatencyInstant = async () => {
      unboundedLatencyGen.current = null;

      const percentileValue =
        params.latencyPercentile === 'p50' ? 0.5 : params.latencyPercentile === 'p90' ? 0.9 : 0.99; // default p99
      const timeRangeDuration = calculateTimeRangeDuration(params.startTime, params.endTime);
      const latencyInstantQuery = getQueryServicesLatencyInstant(
        serviceFilter,
        percentileValue,
        timeRangeDuration
      );
      // Caller-derived latency for dependency nodes (no server-span buckets).
      const depLatencyQuery = getQueryServiceMapDependencyLatencyInstant(
        percentileValue,
        timeRangeDuration,
        dependencyFilter
      );

      const runInstant = (query: string) =>
        promqlService.executeInstantQuery({
          query,
          time: endTimeSec,
          signal: abortController.signal,
        });
      const [latencyInstantResult, depLatencyResult] = await Promise.allSettled([
        runServices ? runInstant(latencyInstantQuery) : Promise.resolve(null),
        ...(runDependencies ? [runInstant(depLatencyQuery)] : []),
      ]);

      if (abortController.signal.aborted) return;

      const latencyInstantResp =
        latencyInstantResult.status === 'fulfilled' ? latencyInstantResult.value : null;
      const depLatencyResp =
        depLatencyResult?.status === 'fulfilled' ? depLatencyResult.value : null;

      const newInstantMap = new Map<string, number>();
      (bounded ? scope : params.services).forEach(({ serviceName, environment, type }) => {
        const key = serviceNodeKey(serviceName, environment);
        const data = extractServiceData(
          isDependencyType(type) ? depLatencyResp : latencyInstantResp,
          serviceName,
          environment
        );
        newInstantMap.set(key, data.length > 0 ? data[0].value : 0);
      });

      setLatencyInstantMap(newInstantMap);

      const latencyRejected = [latencyInstantResult, depLatencyResult].find(
        (r) => r?.status === 'rejected'
      ) as PromiseRejectedResult | undefined;
      if (latencyRejected) {
        console.error(
          '[useServicesRedMetrics] Partial failure fetching latency metrics:',
          latencyRejected.reason
        );
        setLatencyError(
          latencyRejected.reason instanceof Error
            ? latencyRejected.reason
            : new Error('Unknown error')
        );
      } else if (!bounded) {
        unboundedLatencyGen.current = gen;
      }
      setIsLoadingLatency(false);
    };

    setIsLoadingLatency(true);
    setLatencyError(null);
    const timer = bounded ? setTimeout(fetchLatencyInstant, SCOPED_FETCH_DEBOUNCE_MS) : undefined;
    if (!bounded) fetchLatencyInstant();

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
    // scopeKey / instantFilters track changes to the scoped service set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    promqlService,
    enabled,
    catalogKey,
    scopeKey,
    instantFilters,
    startTimeSec,
    endTimeSec,
    refetchAllTrigger,
    params.latencyPercentile,
  ]);

  // The sparkline cache is valid only for the current time range, percentile,
  // and refresh generation. When any of those change, drop the cached
  // sparklines so a refresh (or time/percentile change) never shows stale data.
  useEffect(() => {
    setThroughputFailureMap(new Map());
    setLatencyMap(new Map());
  }, [startTimeSec, endTimeSec, params.latencyPercentile, refetchAllTrigger]);

  // Effect 3: sparkline (per-step range) data for the visible page's services,
  // via a bounded service=~ filter. Results ACCUMULATE across pages, so
  // revisiting a page is served from memory with no request. Only services not
  // already cached are fetched. Debounced so skimming pages fires one request
  // for the page landed on; superseded in-flight fetches are aborted.
  useEffect(() => {
    if (!promqlService || !enabled || sparklineNames.length === 0) return;

    // Instrumented services use the bounded `service=~` filter. Dependency nodes
    // (database / messaging / external) are fetched separately: they have no
    // `service="<name>"` series; their sparkline is caller-derived, aggregated by
    // `remoteService` and bounded by `remoteService=~` to the page's dependencies.
    const all = params.sparklineServices ?? [];
    const isCached = (s: { serviceName: string; environment?: string }) =>
      throughputFailureMap.has(serviceNodeKey(s.serviceName, s.environment));
    const missing = all.filter((s) => !isDependencyType(s.type) && !isCached(s));
    const missingDeps = all.filter((s) => isDependencyType(s.type) && !isCached(s));
    if (missing.length === 0 && missingDeps.length === 0) return; // page cached

    const abortController = new AbortController();
    const timer = setTimeout(() => {
      const fetchSparklines = async () => {
        const percentileValue =
          params.latencyPercentile === 'p50'
            ? 0.5
            : params.latencyPercentile === 'p90'
              ? 0.9
              : 0.99;
        const step = calculateStep(startTimeSec, endTimeSec, RESOLUTION_LOW);
        const runRange = (query: string) =>
          promqlService.executeMetricRequest({
            query,
            startTime: startTimeSec,
            endTime: endTimeSec,
            step,
            signal: abortController.signal,
          });

        // Service batch — bounded `service=~` filter; skipped when none missing.
        const serviceBatch =
          missing.length > 0
            ? (() => {
                const missingNames = Array.from(new Set(missing.map((s) => s.serviceName)));
                const filter = `service=~"${missingNames.map(escapePromQLRegex).join('|')}"`;
                return Promise.allSettled([
                  runRange(getQueryServicesThroughput(filter)),
                  runRange(getQueryServicesFailureRatio(filter)),
                  runRange(getQueryServicesLatency(filter, percentileValue)),
                ]);
              })()
            : Promise.resolve(null);

        // Dependency batch — caller-derived, aggregated by target and relabeled
        // to service/environment, bounded to the page's missing dependencies.
        // Skipped when no dependency rows are missing.
        const depBatch =
          missingDeps.length > 0
            ? (() => {
                const depFilter = dependencyNamesFilter(
                  Array.from(new Set(missingDeps.map((s) => s.serviceName)))
                );
                return Promise.allSettled([
                  runRange(getQueryServiceMapDependencyThroughputRange(depFilter)),
                  runRange(getQueryServiceMapDependencyFailureRatioRange(depFilter)),
                  runRange(getQueryServiceMapDependencyLatencyRange(percentileValue, depFilter)),
                ]);
              })()
            : Promise.resolve(null);

        const [serviceResults, depResults] = await Promise.all([serviceBatch, depBatch]);

        if (abortController.signal.aborted) return;

        const unwrap = <T>(results: Array<PromiseSettledResult<T>> | null, i: number): T | null => {
          const r = results?.[i];
          return r && r.status === 'fulfilled' ? r.value : null;
        };
        const svcThroughput = unwrap(serviceResults, 0);
        const svcFailureRatio = unwrap(serviceResults, 1);
        const svcLatency = unwrap(serviceResults, 2);
        const depThroughput = unwrap(depResults, 0);
        const depFailureRatio = unwrap(depResults, 1);
        const depLatency = unwrap(depResults, 2);
        // A rejected query is not cached as an empty sparkline: its rows stay uncached, so the
        // next page change, refresh or time change fetches them again.
        const fulfilled = <T>(results: Array<PromiseSettledResult<T>> | null) =>
          !!results && results.every((r) => r.status === 'fulfilled');
        const cacheServices = fulfilled(serviceResults) ? missing : [];
        const cacheDeps = fulfilled(depResults) ? missingDeps : [];
        if (cacheServices.length === 0 && cacheDeps.length === 0) return;

        // Merge into the caches, preserving previously fetched pages.
        setThroughputFailureMap((prev) => {
          const next = new Map(prev);
          cacheServices.forEach(({ serviceName, environment }) => {
            next.set(serviceNodeKey(serviceName, environment), {
              throughput: extractServiceData(svcThroughput, serviceName, environment),
              failureRatio: extractServiceData(svcFailureRatio, serviceName, environment),
            });
          });
          cacheDeps.forEach(({ serviceName, environment }) => {
            next.set(serviceNodeKey(serviceName, environment), {
              throughput: extractServiceData(depThroughput, serviceName, environment),
              failureRatio: extractServiceData(depFailureRatio, serviceName, environment),
            });
          });
          return next;
        });
        setLatencyMap((prev) => {
          const next = new Map(prev);
          cacheServices.forEach(({ serviceName, environment }) => {
            next.set(
              serviceNodeKey(serviceName, environment),
              extractServiceData(svcLatency, serviceName, environment)
            );
          });
          cacheDeps.forEach(({ serviceName, environment }) => {
            next.set(
              serviceNodeKey(serviceName, environment),
              extractServiceData(depLatency, serviceName, environment)
            );
          });
          return next;
        });
      };

      fetchSparklines();
    }, SPARKLINE_FETCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
    // sparklineKey tracks the visible page; throughputFailureMap drives the
    // cache-hit check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    promqlService,
    enabled,
    sparklineKey,
    throughputFailureMap,
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

    // Iterate the full service set from the instant maps (all services); the
    // sparkline maps (latencyMap / throughputFailureMap) only cover the visible
    // page, so off-page rows keep their numbers with empty sparklines.
    const serviceNames = new Set([
      ...totalCountMap.keys(),
      ...latencyInstantMap.keys(),
      ...failureRatioInstantMap.keys(),
    ]);

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

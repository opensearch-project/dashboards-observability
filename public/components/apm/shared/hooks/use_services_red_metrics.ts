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
import { buildScopeFilters, scopeFiltersKey, ScopeFilters } from '../utils/scope_filters';
import { escapePromQLRegex } from '../../query_services/query_requests/escape_utils';
import { getTimeInSeconds, calculateTimeRangeDuration } from '../utils/time_utils';
import { calculateStep, RESOLUTION_LOW } from '../utils/step_utils';
import { useApmConfig } from '../../config/apm_config_context';
import { isDependencyType } from '../utils/platform_utils';

// Debounce for the visible-page sparkline fetch: skimming past pages within
// this window will not fire a request for each intermediate page.
const SPARKLINE_FETCH_DEBOUNCE_MS = 250;

/**
 * Composite key for a service node. Metrics are grouped by (environment, service),
 * so the catalog keys rows on both to avoid summing a service across environments.
 */
export const serviceNodeKey = (serviceName: string, environment?: string): string =>
  `${serviceName}::${environment ?? ''}`;

export interface ServiceRedMetrics {
  latency: MetricDataPoint[];
  // Instant values over the full time range. Undefined when that metric's query failed (shown
  // as "-"), so a failure never reads as a real 0.
  avgLatency?: number; // True percentile over the full time range
  throughput: MetricDataPoint[];
  avgThroughput?: number; // Requests per second over the time range
  failureRatio: MetricDataPoint[];
  avgFailureRatio?: number; // (errors + faults) / requests over the time range, in %
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
  /**
   * Query filters for `scopeServices`, from buildScopeFilters. Lets the page push facets that
   * map to a label (environment) down as label matchers; built from the rows if omitted.
   */
  scopeFilters?: ScopeFilters;
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
  /**
   * The page is filtered, but the filter was too broad to narrow the instant queries, so they
   * scan every service (see ScopeFilters.fellBack).
   */
  scopeFellBack: boolean;
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

  // Instant-query filters for the scope (see buildScopeFilters). The page may pass its own
  // (e.g. with the environment facet as a label matcher); otherwise they are built from the
  // scoped rows as a name list.
  const instantFilters = useMemo(
    () =>
      params.scopeFilters ??
      buildScopeFilters({
        catalog: params.services,
        scope: params.scopeServices ?? params.services,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.scopeFilters, catalogKey, scopeKey]
  );
  const filtersKey = scopeFiltersKey(instantFilters);

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

  const ready = params.services.length > 0 && !!promqlService;
  // Reuse key: what the whole-catalog results depend on.
  const catalogGen = `${prometheusConnectionId}|${catalogKey}|${startTimeSec}|${endTimeSec}|${refetchAllTrigger}`;
  // Rows a fetch fills: the scope when bounded, else the whole catalog (what reuse relies on).
  const rowsFor = (bounded: boolean) => (bounded ? scope : params.services);

  // Effect 1: instant throughput total + failure ratio for every scoped row. These drive the
  // displayed numbers, sorting, and the range filters. No per-step (sparkline) data here.
  const throughputFailure = useCatalogInstantFetch({
    ready,
    enabled,
    scopeEmpty: scope.length === 0,
    gen: catalogGen,
    bounded: instantFilters.bounded,
    filtersKey,
    onReset: () => {
      setTotalCountMap(new Map());
      setFailureRatioInstantMap(new Map());
    },
    run: async (signal) => {
      const { bounded, serviceFilter, dependencyFilter, runServices, runDependencies } =
        instantFilters;
      const timeRangeDuration = calculateTimeRangeDuration(params.startTime, params.endTime);
      const runInstant = (query: string) =>
        promqlService!.executeInstantQuery({ query, time: endTimeSec, signal });
      const skipped = Promise.resolve(null);
      const [total, failureRatio, depTotal, depFailureRatio] = await Promise.allSettled([
        runServices
          ? runInstant(getQueryServicesThroughputTotal(serviceFilter, timeRangeDuration))
          : skipped,
        runServices
          ? runInstant(getQueryServicesFailureRatioTotal(serviceFilter, timeRangeDuration))
          : skipped,
        // Dependency (database / messaging / external) rows have no SERVER-span series; these
        // caller-derived (remoteService=) queries fill them in.
        runDependencies
          ? runInstant(getQueryServiceMapDependencyThroughput(timeRangeDuration, dependencyFilter))
          : skipped,
        runDependencies
          ? runInstant(
              getQueryServiceMapDependencyFailureRatioTotal(timeRangeDuration, dependencyFilter)
            )
          : skipped,
      ]);

      const newTotalMap = new Map<string, number>();
      const newFailureRatioMap = new Map<string, number>();
      rowsFor(bounded).forEach(({ serviceName, environment, type }) => {
        const key = serviceNodeKey(serviceName, environment);
        // Dependency rows use caller-derived metrics; service rows the SERVER-span series.
        const isDependency = isDependencyType(type);
        setFromResult(newTotalMap, key, isDependency ? depTotal : total, serviceName, environment);
        setFromResult(
          newFailureRatioMap,
          key,
          isDependency ? depFailureRatio : failureRatio,
          serviceName,
          environment
        );
      });
      return {
        apply: () => {
          setTotalCountMap(newTotalMap);
          setFailureRatioInstantMap(newFailureRatioMap);
        },
        error: firstRejection([total, failureRatio, depTotal, depFailureRatio], 'instant metrics'),
      };
    },
  });

  // Effect 2: instant latency percentile for every scoped row (drives the number and latency
  // sort/filter). Sparkline handled by Effect 3.
  const latency = useCatalogInstantFetch({
    ready,
    enabled,
    scopeEmpty: scope.length === 0,
    gen: `${catalogGen}|${params.latencyPercentile}`,
    bounded: instantFilters.bounded,
    filtersKey,
    onReset: () => setLatencyInstantMap(new Map()),
    run: async (signal) => {
      const { bounded, serviceFilter, dependencyFilter, runServices, runDependencies } =
        instantFilters;
      const percentileValue = toPercentileValue(params.latencyPercentile);
      const timeRangeDuration = calculateTimeRangeDuration(params.startTime, params.endTime);
      const runInstant = (query: string) =>
        promqlService!.executeInstantQuery({ query, time: endTimeSec, signal });
      const skipped = Promise.resolve(null);
      const [svcLatency, depLatency] = await Promise.allSettled([
        runServices
          ? runInstant(
              getQueryServicesLatencyInstant(serviceFilter, percentileValue, timeRangeDuration)
            )
          : skipped,
        // Caller-derived latency for dependency nodes (no server-span buckets).
        runDependencies
          ? runInstant(
              getQueryServiceMapDependencyLatencyInstant(
                percentileValue,
                timeRangeDuration,
                dependencyFilter
              )
            )
          : skipped,
      ]);

      const newLatencyMap = new Map<string, number>();
      rowsFor(bounded).forEach(({ serviceName, environment, type }) => {
        setFromResult(
          newLatencyMap,
          serviceNodeKey(serviceName, environment),
          isDependencyType(type) ? depLatency : svcLatency,
          serviceName,
          environment
        );
      });
      return {
        apply: () => setLatencyInstantMap(newLatencyMap),
        error: firstRejection([svcLatency, depLatency], 'latency metrics'),
      };
    },
  });

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
        const percentileValue = toPercentileValue(params.latencyPercentile);
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

      // A metric whose query failed has no entry, so it reads as unavailable (undefined, shown
      // as "-") rather than as a real 0.
      // Instant query result: true percentile over full time range.
      const avgLatency = latencyInstantMap.get(serviceName);
      // sum_over_time total / time range for accurate req/s (a plain gauge range query is
      // inflated by Prometheus stale lookback).
      const timeRangeSeconds = endTimeSec - startTimeSec;
      const totalRequests = totalCountMap.get(serviceName);
      const avgThroughput =
        totalRequests === undefined
          ? undefined
          : timeRangeSeconds > 0
            ? totalRequests / timeRangeSeconds
            : 0;
      // Ratio-of-sums over the window (unbiased vs averaging per-step ratios).
      const avgFailureRatio = failureRatioInstantMap.get(serviceName);

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
  const isLoading = latency.isLoading || throughputFailure.isLoading;

  // Return first error encountered
  const error = latency.error || throughputFailure.error;

  const refetch = useCallback(() => {
    setRefetchAllTrigger((prev) => prev + 1);
  }, []);

  return { metricsMap, isLoading, error, scopeFellBack: instantFilters.fellBack, refetch };
};

// Debounce for scoped instant fetches, so typing a search issues one query set for the settled
// filter rather than one per keystroke.
const SCOPED_FETCH_DEBOUNCE_MS = 300;

interface InstantFetchResult {
  /** Writes the fetched maps into state. */
  apply: () => void;
  /** First rejected query, if any; the affected rows are left unset (unavailable). */
  error: Error | null;
}

interface CatalogInstantFetchParams {
  /** A catalog and a Prometheus connection exist. */
  ready: boolean;
  enabled: boolean;
  scopeEmpty: boolean;
  /** What the whole-catalog results depend on (connection, catalog, time, refresh, ...). */
  gen: string;
  bounded: boolean;
  filtersKey: string;
  run: (signal: AbortSignal) => Promise<InstantFetchResult>;
  onReset: () => void;
}

/**
 * Fetch policy for the whole-range instant metrics:
 * - Unbounded (whole-catalog) fetch: its results cover every row, so once one has succeeded for
 *   the current `gen`, any scope is served from it with no request. It is not cancelled by a
 *   scope change, only when `gen` changes: a cancelled request still runs in Prometheus, and
 *   clearing the filter would otherwise send the most expensive query set a second time.
 * - Bounded (scoped) fetch: debounced, cancelled when the scope changes. If the catalog fetch
 *   lands first, the scoped result is dropped (the catalog covers it).
 * - Re-requesting what the maps already hold (same signature) sends nothing.
 */
function useCatalogInstantFetch({
  ready,
  enabled,
  scopeEmpty,
  gen,
  bounded,
  filtersKey,
  run,
  onReset,
}: CatalogInstantFetchParams): { isLoading: boolean; error: Error | null } {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // gen of the last unbounded fetch that fully succeeded (maps cover the whole catalog).
  const fullGen = useRef<string | null>(null);
  // Signature of what the maps currently hold, and of what the page currently wants.
  const loadedSig = useRef<string | null>(null);
  const requestedSig = useRef<string | null>(null);
  const inflight = useRef<{ gen: string; controller: AbortController } | null>(null);
  // Latest closures, so a debounced or in-flight fetch never captures a stale render.
  const runRef = useRef(run);
  runRef.current = run;
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;

  useEffect(() => () => inflight.current?.controller.abort(), []);

  const sig = bounded ? `B|${gen}|${filtersKey}` : `U|${gen}`;

  useEffect(() => {
    const safeRun = (signal: AbortSignal) =>
      runRef
        .current(signal)
        .catch((err) => ({ apply: () => {}, error: toError(err) }) as InstantFetchResult);

    if (!ready) {
      inflight.current?.controller.abort();
      inflight.current = null;
      fullGen.current = loadedSig.current = requestedSig.current = null;
      onResetRef.current();
      setError(null);
      setIsLoading(false);
      return;
    }
    // A catalog fetch for another time range / catalog / refresh is no longer useful.
    if (inflight.current && inflight.current.gen !== gen) {
      inflight.current.controller.abort();
      inflight.current = null;
    }
    requestedSig.current = enabled ? sig : null;
    if (!enabled) {
      setIsLoading(true);
      return;
    }
    // A filter matching no rows needs no metrics; keep the maps for reuse.
    if (scopeEmpty) {
      setError(null);
      setIsLoading(false);
      return;
    }
    if (fullGen.current === gen) {
      setError(null);
      setIsLoading(false);
      return;
    }
    if (loadedSig.current === sig) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    if (!bounded) {
      // The in-flight catalog fetch for this gen answers this request when it lands.
      if (inflight.current?.gen === gen) return;
      const controller = new AbortController();
      inflight.current = { gen, controller };
      safeRun(controller.signal).then((res) => {
        if (controller.signal.aborted) return;
        if (inflight.current?.controller === controller) inflight.current = null;
        const requested = requestedSig.current;
        const wanted = requested === sig || !!requested?.startsWith(`B|${gen}|`);
        if (!res.error) {
          // Covers every row: serves this and any scope for the same gen.
          res.apply();
          fullGen.current = gen;
          loadedSig.current = sig;
          setError(null);
          if (wanted) setIsLoading(false);
        } else if (requested === sig) {
          res.apply();
          loadedSig.current = sig;
          setError(res.error);
          setIsLoading(false);
        }
        // A failed catalog fetch no longer requested is dropped (the scoped result stands).
      });
      // No cleanup cancel: a scope change must not cancel the catalog fetch (see above).
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      safeRun(controller.signal).then((res) => {
        if (controller.signal.aborted) return;
        if (fullGen.current !== gen) {
          res.apply();
          loadedSig.current = sig;
          setError(res.error);
        }
        setIsLoading(false);
      });
    }, SCOPED_FETCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [ready, enabled, scopeEmpty, sig, gen, bounded]);

  return { isLoading, error };
}

const toError = (reason: unknown): Error =>
  reason instanceof Error ? reason : new Error('Unknown error');

/** First rejected result as an Error (logged), or null. */
function firstRejection(results: Array<PromiseSettledResult<unknown>>, what: string): Error | null {
  const rejected = results.find((r) => r.status === 'rejected') as
    PromiseRejectedResult | undefined;
  if (!rejected) return null;
  console.error(`[useServicesRedMetrics] Partial failure fetching ${what}:`, rejected.reason);
  return toError(rejected.reason);
}

/**
 * Set a row's instant value from a settled query. A rejected query leaves the row unset, so it
 * reads as unavailable rather than 0; a fulfilled query with no series for the row is a real 0.
 */
function setFromResult(
  map: Map<string, number>,
  key: string,
  result: PromiseSettledResult<unknown>,
  serviceName: string,
  environment?: string
): void {
  if (result.status !== 'fulfilled') return;
  const data = extractServiceData(result.value, serviceName, environment);
  map.set(key, data.length > 0 ? data[0].value : 0);
}

const toPercentileValue = (p?: 'p99' | 'p90' | 'p50'): number =>
  p === 'p50' ? 0.5 : p === 'p90' ? 0.9 : 0.99;

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

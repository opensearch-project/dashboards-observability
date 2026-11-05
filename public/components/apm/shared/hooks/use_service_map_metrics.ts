/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import { getTimeInSeconds } from '../utils/time_utils';
import { formatPrometheusDuration } from '../utils/step_utils';
import { useApmConfig } from '../../config/apm_config_context';
import { ServiceMapNodeMetrics, MetricDataPoint } from '../../common/types/service_map_types';
import {
  getQueryServiceMapThroughput,
  getQueryServiceMapFaults,
  getQueryServiceMapErrors,
  getQueryServiceMapDependencyThroughput,
  getQueryServiceMapDependencyFaults,
  getQueryServiceMapDependencyErrors,
  dependencyNamesFilter,
} from '../../query_services/query_requests/promql_queries';
import { escapePromQLRegex } from '../../query_services/query_requests/escape_utils';
import { isDependencyType } from '../utils/platform_utils';

export interface ServiceMapMetricParams {
  /**
   * Nodes to fetch metrics for, in priority order (earlier nodes are fetched first). `type`
   * (service / database / messaging / external) routes dependency nodes to caller-derived metrics.
   */
  services: Array<{ serviceName: string; environment: string; type?: string }>;
  startTime: Date;
  endTime: Date;
  /** Hold off fetching (e.g. while the topology for a new time range is still loading). */
  enabled?: boolean;
}

export interface UseServiceMapMetricsResult {
  /** Map of nodeId (serviceName::environment) to metrics; nodes still loading have no entry. */
  metricsMap: Map<string, ServiceMapNodeMetrics>;
  /** nodeIds (serviceName::environment) whose metrics batch has not landed yet. */
  pendingNodeIds: Set<string>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Names per metrics batch. Each batch is three instant queries bounded by a
 * `service=~"..."` (or `remoteService=~"..."`) name list, so no single query scans every
 * service in the workspace: an unbounded query over hundreds of services and thousands of
 * dependencies timed out in Prometheus (503) at customer scale.
 */
export const MAP_METRICS_BATCH_SIZE = 100;
/**
 * Upper bound on a batch's name-list length. The dependency queries repeat their selector
 * twice (client + consumer calls), so this keeps every query well under the 10,000-char
 * PromQL limit even with long external host names.
 */
export const MAP_METRICS_BATCH_MAX_CHARS = 3500;
/** Batches in flight at once (three queries each). */
export const MAP_METRICS_MAX_CONCURRENT_BATCHES = 2;

type NodeKind = 'svc' | 'dep';
type BatchStatus = 'pending' | 'done' | 'failed';

interface BatchResult {
  throughput: Map<string, MetricDataPoint[]>;
  faults: Map<string, MetricDataPoint[]>;
  errors: Map<string, MetricDataPoint[]>;
}

interface MetricsState {
  /** Generation (time range / connection / refresh) the state belongs to. */
  gen: string;
  /** Batch status per `${kind}:${name}`. */
  status: Map<string, BatchStatus>;
  /** Indexed series per `${kind}:${name}::${environment}`. */
  results: Map<
    string,
    { throughput: MetricDataPoint[]; faults: MetricDataPoint[]; errors: MetricDataPoint[] }
  >;
  error: Error | null;
}

const nameKey = (kind: NodeKind, name: string) => `${kind}:${name}`;
const kindOf = (type?: string): NodeKind => (isDependencyType(type) ? 'dep' : 'svc');

/**
 * Split names into batches of at most MAP_METRICS_BATCH_SIZE names and
 * MAP_METRICS_BATCH_MAX_CHARS of escaped regex. Order is preserved, so the caller's
 * priority order decides which nodes fill in first.
 */
export function chunkNames(names: string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let chars = 0;
  names.forEach((name) => {
    const len = escapePromQLRegex(name).length + 1;
    if (
      current.length > 0 &&
      (current.length >= MAP_METRICS_BATCH_SIZE || chars + len > MAP_METRICS_BATCH_MAX_CHARS)
    ) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(name);
    chars += len;
  });
  if (current.length > 0) batches.push(current);
  return batches;
}

const serviceNamesFilter = (names: string[]) =>
  `service=~"${names.map(escapePromQLRegex).join('|')}"`;

/**
 * Hook for fetching RED metrics for service map nodes in bounded batches.
 *
 * Each batch issues three instant queries (sum_over_time of request / fault / error over the
 * selected range) scoped to the batch's names, at most MAP_METRICS_MAX_CONCURRENT_BATCHES
 * batches at a time. Nodes fill in as their batch lands (`pendingNodeIds` lists the rest), a
 * failed batch only affects its own nodes, and results are reused across node-list changes
 * within the same time range, so revealing dependency nodes fetches only the dependencies.
 *
 * Note: request, error, and fault are GAUGE metrics (not counters).
 * Note: Latency metrics are not fetched here (use useServicesRedMetrics for latency).
 */
export const useServiceMapMetrics = (
  params: ServiceMapMetricParams
): UseServiceMapMetricsResult => {
  const { config } = useApmConfig();
  const enabled = params.enabled ?? true;
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // Use .name (connectionId) for PromQL queries, not .id (saved object ID)
  const prometheusConnectionId = config?.prometheusDataSource?.name;
  const prometheusConnectionMeta = config?.prometheusDataSource?.meta;

  const promqlService = useMemo(() => {
    if (!prometheusConnectionId) {
      return null;
    }
    return new PromQLSearchService(prometheusConnectionId, prometheusConnectionMeta);
  }, [prometheusConnectionId, prometheusConnectionMeta]);

  const endTimeSec = useMemo(() => getTimeInSeconds(params.endTime), [params.endTime]);
  const timeRange = useMemo(() => {
    const durationMs = params.endTime.getTime() - params.startTime.getTime();
    return formatPrometheusDuration(Math.floor(durationMs / 1000));
  }, [params.startTime, params.endTime]);

  // Results are valid for one time range / connection / refresh generation.
  const gen = `${prometheusConnectionId}|${endTimeSec}|${timeRange}|${refetchTrigger}`;

  const [state, setState] = useState<MetricsState>(() => ({
    gen,
    status: new Map(),
    results: new Map(),
    error: null,
  }));
  // Batches already queued for the current generation (the state update lags behind).
  const queuedRef = useRef<{ gen: string; names: Set<string> }>({ gen, names: new Set() });
  const abortRef = useRef<AbortController | null>(null);

  // A new generation drops everything from the previous one and aborts its requests.
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    queuedRef.current = { gen, names: new Set() };
    setState({ gen, status: new Map(), results: new Map(), error: null });
    return () => controller.abort();
  }, [gen]);

  // Stable key over the node set (name + environment + type), in priority order.
  const servicesKey = useMemo(
    () =>
      params.services.map((s) => `${s.serviceName}::${s.environment}::${s.type || ''}`).join('|'),
    [params.services]
  );

  // Queue batches for names not yet requested in this generation.
  useEffect(() => {
    if (!enabled || !promqlService || params.services.length === 0) return;
    const controller = abortRef.current;
    if (!controller || controller.signal.aborted || queuedRef.current.gen !== gen) return;
    const signal = controller.signal;
    const queued = queuedRef.current.names;

    const newNames: Record<NodeKind, string[]> = { svc: [], dep: [] };
    params.services.forEach(({ serviceName, type }) => {
      const kind = kindOf(type);
      const key = nameKey(kind, serviceName);
      if (queued.has(key)) return;
      queued.add(key);
      newNames[kind].push(serviceName);
    });
    if (newNames.svc.length === 0 && newNames.dep.length === 0) return;

    const batches: Array<{ kind: NodeKind; names: string[] }> = [
      ...chunkNames(newNames.svc).map((names) => ({ kind: 'svc' as const, names })),
      ...chunkNames(newNames.dep).map((names) => ({ kind: 'dep' as const, names })),
    ];

    setState((prev) => {
      if (prev.gen !== gen) return prev;
      const status = new Map(prev.status);
      batches.forEach((b) => b.names.forEach((n) => status.set(nameKey(b.kind, n), 'pending')));
      return { ...prev, status };
    });

    const runQuery = (query: string) =>
      promqlService.executeInstantQuery({ query, time: endTimeSec, signal });

    const runBatch = async ({ kind, names }: { kind: NodeKind; names: string[] }) => {
      const queries =
        kind === 'svc'
          ? [
              getQueryServiceMapThroughput(serviceNamesFilter(names), timeRange),
              getQueryServiceMapFaults(serviceNamesFilter(names), timeRange),
              getQueryServiceMapErrors(serviceNamesFilter(names), timeRange),
            ]
          : [
              // Dependency nodes (database / messaging / external) have no SERVER-span series;
              // their RED comes from the callers' CLIENT-span series aggregated by target.
              getQueryServiceMapDependencyThroughput(timeRange, dependencyNamesFilter(names)),
              getQueryServiceMapDependencyFaults(timeRange, dependencyNamesFilter(names)),
              getQueryServiceMapDependencyErrors(timeRange, dependencyNamesFilter(names)),
            ];
      const settled = await Promise.allSettled(queries.map(runQuery));
      if (signal.aborted) return;

      const valueOf = (r: PromiseSettledResult<unknown>) =>
        r.status === 'fulfilled' ? r.value : null;
      const indexed: BatchResult = {
        throughput: indexSeriesByNode(valueOf(settled[0])),
        faults: indexSeriesByNode(valueOf(settled[1])),
        errors: indexSeriesByNode(valueOf(settled[2])),
      };
      const rejected = settled.find((r) => r.status === 'rejected') as
        PromiseRejectedResult | undefined;
      if (rejected) {
        console.error('[useServiceMapMetrics] Partial failure fetching metrics:', rejected.reason);
      }
      // Only throughput failing leaves the nodes without their primary number.
      const failed = settled[0].status === 'rejected';

      setState((prev) => {
        if (prev.gen !== gen) return prev;
        const status = new Map(prev.status);
        const results = new Map(prev.results);
        const nameSet = new Set(names);
        names.forEach((n) => status.set(nameKey(kind, n), failed ? 'failed' : 'done'));
        const keys = new Set<string>([
          ...indexed.throughput.keys(),
          ...indexed.faults.keys(),
          ...indexed.errors.keys(),
        ]);
        keys.forEach((nodeKey) => {
          // A name filter can match a name outside the batch only via regex; keep batch names.
          const name = nodeKey.slice(0, nodeKey.lastIndexOf('::'));
          if (!nameSet.has(name)) return;
          results.set(`${kind}:${nodeKey}`, {
            throughput: indexed.throughput.get(nodeKey) ?? [],
            faults: indexed.faults.get(nodeKey) ?? [],
            errors: indexed.errors.get(nodeKey) ?? [],
          });
        });
        const error =
          prev.error ??
          (rejected
            ? rejected.reason instanceof Error
              ? rejected.reason
              : new Error('Unknown error')
            : null);
        return { ...prev, status, results, error };
      });
    };

    // Small worker pool: MAP_METRICS_MAX_CONCURRENT_BATCHES batches in flight at a time.
    let next = 0;
    const worker = async () => {
      while (next < batches.length && !signal.aborted) {
        const batch = batches[next++];
        await runBatch(batch);
      }
    };
    for (let i = 0; i < Math.min(MAP_METRICS_MAX_CONCURRENT_BATCHES, batches.length); i++) {
      worker();
    }
    // Batches belong to the generation; a node-list change must not abort in-flight batches
    // (the generation effect aborts them when the time range changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen, servicesKey, enabled, promqlService]);

  // Join the latest results onto the current node list.
  const { metricsMap, pendingNodeIds } = useMemo(() => {
    const map = new Map<string, ServiceMapNodeMetrics>();
    const pending = new Set<string>();
    const current = state.gen === gen ? state : null;

    params.services.forEach(({ serviceName, environment, type }) => {
      const nodeId = `${serviceName}::${environment}`;
      const kind = kindOf(type);
      const status = current?.status.get(nameKey(kind, serviceName));
      if (!status || status === 'pending') {
        // Not fetched yet (including while `enabled` waits for the topology): still loading.
        if (promqlService) pending.add(nodeId);
        return;
      }
      const data = current?.results.get(`${kind}:${nodeId}`);
      map.set(
        nodeId,
        buildNodeMetrics(data?.throughput ?? [], data?.faults ?? [], data?.errors ?? [])
      );
    });
    return { metricsMap: map, pendingNodeIds: pending };
    // servicesKey tracks changes to the node set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicesKey, state, gen, promqlService]);

  const refetch = useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);

  return {
    metricsMap,
    pendingNodeIds,
    isLoading: pendingNodeIds.size > 0,
    error: state.gen === gen ? state.error : null,
    refetch,
  };
};

function buildNodeMetrics(
  throughputData: MetricDataPoint[],
  faultsData: MetricDataPoint[],
  errorsData: MetricDataPoint[]
): ServiceMapNodeMetrics {
  const totalRequests = calculateSum(throughputData);
  const totalFaults = calculateSum(faultsData);
  const totalErrors = calculateSum(errorsData);
  const failureRatio = totalRequests > 0 ? ((totalFaults + totalErrors) / totalRequests) * 100 : 0;
  return {
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
  };
}

function calculateAverage(data: MetricDataPoint[]): number {
  if (data.length === 0) return 0;
  return calculateSum(data) / data.length;
}

function calculateSum(data: MetricDataPoint[]): number {
  return data.reduce((acc, point) => acc + point.value, 0);
}

/**
 * Index a Prometheus response by node (`service::environment`) in one pass.
 * Handles the query-enhancements data frame, its instantData rows, and the standard
 * Prometheus range / instant formats.
 */
export function indexSeriesByNode(response: any): Map<string, MetricDataPoint[]> {
  const index = new Map<string, MetricDataPoint[]>();
  if (!response) return index;
  const push = (service: unknown, environment: unknown, point: MetricDataPoint) => {
    if (typeof service !== 'string' || !service) return;
    const key = `${service}::${typeof environment === 'string' ? environment : ''}`;
    const list = index.get(key);
    if (list) list.push(point);
    else index.set(key, [point]);
  };

  // Data frame format (query enhancements plugin)
  if (response?.type === 'data_frame' && Array.isArray(response?.fields)) {
    const timeField = response.fields.find((f: any) => f.name === 'Time');
    const seriesField = response.fields.find((f: any) => f.name === 'Series');
    const labelsField = response.fields.find((f: any) => f.name === 'Labels');
    const valueField = response.fields.find((f: any) => f.name === 'Value');
    if (timeField && valueField && (seriesField || labelsField)) {
      const count = valueField.values.length;
      for (let i = 0; i < count; i++) {
        let service: unknown;
        let environment: unknown;
        const labels = labelsField?.values?.[i];
        if (labels && typeof labels === 'object') {
          service = labels.service;
          environment = labels.environment;
        } else {
          const seriesLabel: string = seriesField?.values?.[i] ?? '';
          service = seriesLabel.match(/service="([^"]+)"/)?.[1];
          environment = seriesLabel.match(/environment="([^"]*)"/)?.[1];
        }
        push(service, environment, {
          timestamp: timeField.values[i] / 1000, // ms -> s
          value: parseFloat(valueField.values[i]) || 0,
        });
      }
      if (index.size > 0) return index;
    }
  }

  // instantData rows (fallback for instant queries)
  if (Array.isArray(response?.meta?.instantData?.rows)) {
    response.meta.instantData.rows.forEach((row: any) =>
      push(row.service, row.environment, {
        timestamp: row.Time / 1000,
        value: parseFloat(row.Value) || 0,
      })
    );
    if (index.size > 0) return index;
  }

  // Standard Prometheus response format
  const result = response?.data?.result || response?.result || [];
  if (Array.isArray(result)) {
    result.forEach((r: any) => {
      // Only the first series per node counts (as before: one series per (service, environment)).
      const key = `${r.metric?.service}::${r.metric?.environment ?? ''}`;
      if (index.has(key)) return;
      if (Array.isArray(r.values)) {
        r.values.forEach(([timestamp, value]: [number, string]) =>
          push(r.metric?.service, r.metric?.environment, {
            timestamp,
            value: parseFloat(value) || 0,
          })
        );
      } else if (Array.isArray(r.value)) {
        const [timestamp, value] = r.value;
        push(r.metric?.service, r.metric?.environment, {
          timestamp,
          value: parseFloat(value) || 0,
        });
      }
    });
  }
  return index;
}

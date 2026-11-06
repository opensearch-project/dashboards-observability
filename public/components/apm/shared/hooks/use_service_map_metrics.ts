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
import { APPLICATION_MAP_CONSTANTS } from '../../common/constants';
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
import { chunkNames } from '../utils/name_batches';

export { chunkNames };

const { METRICS_MAX_CONCURRENT_BATCHES } = APPLICATION_MAP_CONSTANTS;

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
  /** Map of nodeId (serviceName::environment) to metrics; only nodes whose batch succeeded. */
  metricsMap: Map<string, ServiceMapNodeMetrics>;
  /** nodeIds whose metrics batch has not landed yet (shown with a spinner). */
  pendingNodeIds: Set<string>;
  /**
   * nodeIds whose batch failed (a query rejected or timed out, or came back truncated at the
   * series limit even for a single name). Shown as unavailable, never as a healthy 0.
   */
  failedNodeIds: Set<string>;
  isLoading: boolean;
  error: Error | null;
  /** Re-fetch only the failed nodes. */
  retryFailed: () => void;
  refetch: () => void;
}

type NodeKind = 'svc' | 'dep';
type BatchStatus = 'pending' | 'done' | 'failed';
interface Batch {
  kind: NodeKind;
  names: string[];
}
interface NodeSeries {
  throughput: MetricDataPoint[];
  faults: MetricDataPoint[];
  errors: MetricDataPoint[];
}

interface MetricsState {
  /** Generation (time range / connection / refresh) the state belongs to. */
  gen: string;
  /** Batch status per `${kind}:${name}`; absent means not requested (or dropped off screen). */
  status: Map<string, BatchStatus>;
  /** Indexed series per `${kind}:${name}::${environment}`. */
  results: Map<string, NodeSeries>;
  error: Error | null;
}

/**
 * One request queue for the whole map per generation, so the concurrency limit holds across
 * node-list changes (opening one group after another), not per effect run.
 */
interface QueueState {
  gen: string;
  controller: AbortController;
  queue: Batch[];
  inFlight: number;
  /** Names queued, in flight, or settled in this generation. */
  requested: Set<string>;
  /** Names currently on screen; queued batches drop names that left. */
  onScreen: Set<string>;
}

const nameKey = (kind: NodeKind, name: string) => `${kind}:${name}`;
const kindOf = (type?: string): NodeKind => (isDependencyType(type) ? 'dep' : 'svc');

/** Core's PromQL strategy cuts results at 2,000 series and flags it in the frame's meta. */
const isTruncated = (response: any): boolean => !!response?.meta?.truncation?.tableTruncated;

const serviceNamesFilter = (names: string[]) =>
  `service=~"${names.map(escapePromQLRegex).join('|')}"`;

const batchQueries = ({ kind, names }: Batch, timeRange: string): string[] =>
  kind === 'svc'
    ? [
        getQueryServiceMapThroughput(serviceNamesFilter(names), timeRange),
        getQueryServiceMapFaults(serviceNamesFilter(names), timeRange),
        getQueryServiceMapErrors(serviceNamesFilter(names), timeRange),
      ]
    : [
        // Dependency nodes (database / messaging / external) have no SERVER-span series; their
        // RED comes from the callers' CLIENT-span series aggregated by target.
        getQueryServiceMapDependencyThroughput(timeRange, dependencyNamesFilter(names)),
        getQueryServiceMapDependencyFaults(timeRange, dependencyNamesFilter(names)),
        getQueryServiceMapDependencyErrors(timeRange, dependencyNamesFilter(names)),
      ];

/**
 * RED metrics for service map nodes, in bounded batches.
 *
 * Each batch is three instant queries (sum_over_time of request / fault / error over the range)
 * scoped to the batch's names. One queue per generation runs at most
 * METRICS_MAX_CONCURRENT_BATCHES batches at a time, most important nodes first; batches whose
 * nodes left the screen before they started are dropped. Nodes fill in as their batch lands
 * (`pendingNodeIds` lists the rest); a failed batch marks only its own nodes failed
 * (`failedNodeIds`), and a batch truncated at the series limit is split and retried. Results are
 * reused across node-list changes within the same time range.
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
  const [retryTrigger, setRetryTrigger] = useState(0);

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
  const queueRef = useRef<QueueState | null>(null);

  // A new generation drops everything from the previous one and aborts its requests.
  useEffect(() => {
    const controller = new AbortController();
    queueRef.current = {
      gen,
      controller,
      queue: [],
      inFlight: 0,
      requested: new Set(),
      onScreen: new Set(),
    };
    setState({ gen, status: new Map(), results: new Map(), error: null });
    return () => controller.abort();
  }, [gen]);

  // Stable key over the node set (name + environment + type), in priority order.
  const servicesKey = useMemo(
    () =>
      params.services.map((s) => `${s.serviceName}::${s.environment}::${s.type || ''}`).join('|'),
    [params.services]
  );

  // Latest values for the queue's callbacks (which outlive a render).
  const latest = useRef({ promqlService, endTimeSec, timeRange });
  latest.current = { promqlService, endTimeSec, timeRange };

  const settle = useCallback(
    (
      q: QueueState,
      batch: Batch,
      outcome: { results?: Map<string, NodeSeries>; error?: Error }
    ) => {
      setState((prev) => {
        if (prev.gen !== q.gen) return prev;
        const status = new Map(prev.status);
        const results = new Map(prev.results);
        batch.names.forEach((n) =>
          status.set(nameKey(batch.kind, n), outcome.error ? 'failed' : 'done')
        );
        outcome.results?.forEach((series, nodeKey) =>
          results.set(`${batch.kind}:${nodeKey}`, series)
        );
        return { ...prev, status, results, error: prev.error ?? outcome.error ?? null };
      });
    },
    []
  );

  const runBatch = useCallback(
    async (q: QueueState, batch: Batch) => {
      const { promqlService: service, endTimeSec: time, timeRange: range } = latest.current;
      const signal = q.controller.signal;
      try {
        if (!service) throw new Error('No Prometheus connection');
        const settled = await Promise.allSettled(
          batchQueries(batch, range).map((query) =>
            service.executeInstantQuery({ query, time, signal })
          )
        );
        if (signal.aborted) return;

        const rejected = settled.find((r) => r.status === 'rejected') as
          PromiseRejectedResult | undefined;
        if (rejected) {
          // All three are needed for correct counts and ratios: any failure is a failure.
          throw rejected.reason instanceof Error ? rejected.reason : new Error('Unknown error');
        }
        const values = settled.map((r) => (r as PromiseFulfilledResult<unknown>).value);
        if (values.some(isTruncated)) {
          // Over the series limit (names spanning many environments): split and retry, or give
          // up on a single name rather than show a partial count.
          if (batch.names.length > 1) {
            const mid = Math.ceil(batch.names.length / 2);
            q.queue.unshift(
              { kind: batch.kind, names: batch.names.slice(0, mid) },
              { kind: batch.kind, names: batch.names.slice(mid) }
            );
            return;
          }
          throw new Error('Too many series for this node; metrics are unavailable');
        }

        const [throughput, faults, errors] = values.map(indexSeriesByNode);
        const names = new Set(batch.names);
        const results = new Map<string, NodeSeries>();
        new Set([...throughput.keys(), ...faults.keys(), ...errors.keys()]).forEach((nodeKey) => {
          // A name filter is anchored, so only batch names match; keep that invariant explicit.
          if (!names.has(nodeKey.slice(0, nodeKey.lastIndexOf('::')))) return;
          results.set(nodeKey, {
            throughput: throughput.get(nodeKey) ?? [],
            faults: faults.get(nodeKey) ?? [],
            errors: errors.get(nodeKey) ?? [],
          });
        });
        settle(q, batch, { results });
      } catch (err) {
        if (signal.aborted) return;

        console.error('[useServiceMapMetrics] Batch failed:', err);
        settle(q, batch, { error: err instanceof Error ? err : new Error('Unknown error') });
      }
    },
    [settle]
  );

  const pump = useCallback(
    (q: QueueState) => {
      while (
        !q.controller.signal.aborted &&
        q.inFlight < METRICS_MAX_CONCURRENT_BATCHES &&
        q.queue.length > 0
      ) {
        const batch = q.queue.shift()!;
        q.inFlight += 1;
        runBatch(q, batch).finally(() => {
          q.inFlight -= 1;
          pump(q);
        });
      }
    },
    [runBatch]
  );

  // Queue batches for names newly on screen; drop queued (not started) names that left it.
  useEffect(() => {
    const q = queueRef.current;
    if (!q || q.gen !== gen || q.controller.signal.aborted) return;
    q.onScreen = new Set(params.services.map((s) => nameKey(kindOf(s.type), s.serviceName)));
    if (!enabled || !promqlService) return;

    const dropped: string[] = [];
    q.queue = q.queue
      .map((b) => {
        const keep = b.names.filter((n) => q.onScreen.has(nameKey(b.kind, n)));
        b.names
          .filter((n) => !q.onScreen.has(nameKey(b.kind, n)))
          .forEach((n) => {
            const key = nameKey(b.kind, n);
            q.requested.delete(key);
            dropped.push(key);
          });
        return { ...b, names: keep };
      })
      .filter((b) => b.names.length > 0);

    const newNames: Record<NodeKind, string[]> = { svc: [], dep: [] };
    params.services.forEach(({ serviceName, type }) => {
      const kind = kindOf(type);
      const key = nameKey(kind, serviceName);
      if (q.requested.has(key)) return;
      q.requested.add(key);
      newNames[kind].push(serviceName);
    });
    const added: Batch[] = [
      ...chunkNames(newNames.svc).map((names) => ({ kind: 'svc' as const, names })),
      ...chunkNames(newNames.dep).map((names) => ({ kind: 'dep' as const, names })),
    ];
    q.queue.push(...added);

    if (dropped.length > 0 || added.length > 0) {
      setState((prev) => {
        if (prev.gen !== gen) return prev;
        const status = new Map(prev.status);
        dropped.forEach((key) => status.delete(key));
        added.forEach((b) => b.names.forEach((n) => status.set(nameKey(b.kind, n), 'pending')));
        return { ...prev, status };
      });
    }
    pump(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen, servicesKey, enabled, promqlService, retryTrigger]);

  // Join the latest results onto the current node list.
  const { metricsMap, pendingNodeIds, failedNodeIds } = useMemo(() => {
    const map = new Map<string, ServiceMapNodeMetrics>();
    const pending = new Set<string>();
    const failed = new Set<string>();
    const current = state.gen === gen ? state : null;

    params.services.forEach(({ serviceName, environment, type }) => {
      const nodeId = `${serviceName}::${environment}`;
      const kind = kindOf(type);
      const status = current?.status.get(nameKey(kind, serviceName));
      if (status === 'failed') {
        failed.add(nodeId);
        return;
      }
      if (status !== 'done') {
        // Not fetched yet (including while `enabled` waits for the topology): still loading.
        // Without a Prometheus connection nothing will load, so nothing is pending.
        if (promqlService) pending.add(nodeId);
        return;
      }
      const data = current?.results.get(`${kind}:${nodeId}`);
      map.set(
        nodeId,
        buildNodeMetrics(data?.throughput ?? [], data?.faults ?? [], data?.errors ?? [])
      );
    });
    return { metricsMap: map, pendingNodeIds: pending, failedNodeIds: failed };
    // servicesKey tracks changes to the node set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicesKey, state, gen, promqlService]);

  const retryFailed = useCallback(() => {
    const q = queueRef.current;
    if (!q) return;
    setState((prev) => {
      if (prev.gen !== q.gen) return prev;
      const status = new Map(prev.status);
      status.forEach((value, key) => {
        if (value === 'failed') {
          status.delete(key);
          q.requested.delete(key);
        }
      });
      return { ...prev, status, error: null };
    });
    setRetryTrigger((n) => n + 1);
  }, []);

  const refetch = useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);

  return {
    metricsMap,
    pendingNodeIds,
    failedNodeIds,
    isLoading: pendingNodeIds.size > 0,
    error: state.gen === gen ? state.error : null,
    retryFailed,
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

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PPLSearchService } from '../../query_services/ppl_search_service';
import { ServiceMapSliceFilter } from '../../query_services/query_requests/ppl_queries';
import { useApmConfig } from '../../config/apm_config_context';
import { DatasetConfig } from '../../common/types/apm_types';
import { FocusMode, ServiceMapEdge, ServiceMapNode } from '../../common/types/service_map_types';
import { getNeighborhood, Neighborhood } from '../utils/map_focus';

/** A topology: nodes and the connections among them. */
export interface MapGraph {
  nodes: ServiceMapNode[];
  edges: ServiceMapEdge[];
}

interface Range {
  startTime: Date;
  endTime: Date;
  refreshTrigger?: number;
}

/** The service-map dataset from the APM config, shared by the large-map hooks. */
function useServiceMapDataset() {
  const { config } = useApmConfig();
  const ds = config?.serviceMapDataset;
  const queryIndex = ds?.title || '';
  const dataset: DatasetConfig | undefined = useMemo(
    () =>
      ds
        ? {
            id: ds.id,
            title: ds.title,
            ...(ds.datasourceId && { dataSource: { id: ds.datasourceId, type: 'DATA_SOURCE' } }),
          }
        : undefined,
    [ds]
  );
  return { queryIndex, dataset };
}

const rangeKey = (r: Range, queryIndex: string) =>
  `${queryIndex}|${r.startTime.getTime()}|${r.endTime.getTime()}|${r.refreshTrigger ?? 0}`;

/** Merge topologies, keying connections by their ends (edge ids are per response). */
export function mergeGraphs(graphs: MapGraph[]): MapGraph {
  const nodes = new Map<string, ServiceMapNode>();
  const edges = new Map<string, ServiceMapEdge>();
  graphs.forEach((g) => {
    g.nodes.forEach((n) => {
      if (!nodes.has(n.NodeId)) nodes.set(n.NodeId, n);
    });
    g.edges.forEach((e) => {
      const key = `${e.SourceNodeId}->${e.DestinationNodeId}`;
      if (!edges.has(key)) edges.set(key, { ...e, EdgeId: key });
    });
  });
  return { nodes: Array.from(nodes.values()), edges: Array.from(edges.values()) };
}

// ---------------------------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------------------------

export interface UseServiceMapOverviewResult {
  /** The service-map dataset is configured (until then nothing loads, and nothing is known). */
  ready: boolean;
  nodes: ServiceMapNode[];
  availableGroupByAttributes: Record<string, string[]>;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Every node of the map, from aggregations (seconds even on long
 * ranges, no row cap), without reading the topology. `groupByAttribute` adds that attribute's
 * value to the nodes (for grouping by it).
 */
export function useServiceMapOverview(
  params: Range & { groupByAttribute?: string | null }
): UseServiceMapOverviewResult {
  const { queryIndex, dataset } = useServiceMapDataset();
  const service = useMemo(() => new PPLSearchService(), []);
  const attribute = params.groupByAttribute || undefined;
  const key = `${rangeKey(params, queryIndex)}|${attribute ?? ''}`;
  const [state, setState] = useState<{
    key: string;
    result: Omit<UseServiceMapOverviewResult, 'isLoading' | 'error' | 'ready'> | null;
    error: Error | null;
  } | null>(null);

  useEffect(() => {
    if (!queryIndex || !dataset) return;
    const controller = new AbortController();
    service
      .getServiceMapOverview(
        {
          queryIndex,
          startTime: params.startTime,
          endTime: params.endTime,
          dataset,
          groupByAttribute: attribute,
        } as any,
        controller.signal
      )
      .then((r) => {
        if (controller.signal.aborted) return;
        setState({
          key,
          result: {
            nodes: r.Nodes,
            availableGroupByAttributes: r.AvailableGroupByAttributes,
          },
          error: null,
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;

        console.error('[useServiceMapOverview] Error:', err);
        setState({
          key,
          result: null,
          error: err instanceof Error ? err : new Error('Unknown error'),
        });
      });
    return () => controller.abort();
    // `key` covers the range, index and attribute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dataset, service]);

  const current = state?.key === key ? state : null;
  return {
    ready: !!queryIndex && !!dataset,
    nodes: current?.result?.nodes ?? [],
    availableGroupByAttributes: current?.result?.availableGroupByAttributes ?? {},
    isLoading: !!queryIndex && !!dataset && !current,
    error: current?.error ?? null,
  };
}

// ---------------------------------------------------------------------------------------------
// Slices (an opened environment or group)
// ---------------------------------------------------------------------------------------------

export type SliceStatus = 'pending' | 'done' | 'failed';
export interface SliceResult extends MapGraph {
  truncated: boolean;
}

export const sliceKey = (filter: ServiceMapSliceFilter): string => JSON.stringify(filter);

export interface UseServiceMapSlicesResult {
  /** The active slice's topology, once loaded. */
  active: SliceResult | null;
  activeStatus: SliceStatus | null;
  /** Status per slice key (active and prefetched). */
  status: Map<string, SliceStatus>;
}

/**
 * Exact topologies of large-map slices, one request at a time per time range: the `active`
 * slice first, then `prefetch` (most important first) in the background, so opening one is often
 * instant. Results are kept for the time range; a new range aborts and starts over.
 */
export function useServiceMapSlices(
  params: Range & {
    enabled: boolean;
    active: ServiceMapSliceFilter | null;
    prefetch: ServiceMapSliceFilter[];
  }
): UseServiceMapSlicesResult {
  const { queryIndex, dataset } = useServiceMapDataset();
  const service = useMemo(() => new PPLSearchService(), []);
  const gen = rangeKey(params, queryIndex);
  const [results, setResults] = useState<{
    gen: string;
    slices: Map<string, SliceResult>;
    status: Map<string, SliceStatus>;
  }>({ gen, slices: new Map(), status: new Map() });
  const queue = useRef<{
    gen: string;
    controller: AbortController;
    pending: ServiceMapSliceFilter[];
    requested: Set<string>;
    running: boolean;
  } | null>(null);

  // New time range: drop everything and abort.
  useEffect(() => {
    const controller = new AbortController();
    queue.current = { gen, controller, pending: [], requested: new Set(), running: false };
    setResults({ gen, slices: new Map(), status: new Map() });
    return () => controller.abort();
  }, [gen]);

  const pump = useCallback(() => {
    const q = queue.current;
    if (!q || q.running || q.controller.signal.aborted || !dataset) return;
    const next = q.pending.shift();
    if (!next) return;
    q.running = true;
    const key = sliceKey(next);
    setResults((prev) =>
      prev.gen !== q.gen ? prev : { ...prev, status: new Map(prev.status).set(key, 'pending') }
    );
    service
      .getServiceMapSlice(
        { queryIndex, startTime: params.startTime, endTime: params.endTime, dataset } as any,
        next,
        q.controller.signal
      )
      .then(
        (r: any) => {
          if (q.controller.signal.aborted) return;
          setResults((prev) =>
            prev.gen !== q.gen
              ? prev
              : {
                  ...prev,
                  slices: new Map(prev.slices).set(key, {
                    nodes: r.Nodes ?? [],
                    edges: r.Edges ?? [],
                    truncated: !!r.truncated,
                  }),
                  status: new Map(prev.status).set(key, 'done'),
                }
          );
        },
        (err: unknown) => {
          if (q.controller.signal.aborted) return;

          console.error('[useServiceMapSlices] Slice failed:', err);
          setResults((prev) =>
            prev.gen !== q.gen ? prev : { ...prev, status: new Map(prev.status).set(key, 'failed') }
          );
        }
      )
      .finally(() => {
        q.running = false;
        pump();
      });
    // Range params are read through `gen` (the queue is per generation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, queryIndex, service, gen]);

  const activeKey = params.active ? sliceKey(params.active) : null;
  const prefetchKey = params.prefetch.map(sliceKey).join('&');
  useEffect(() => {
    const q = queue.current;
    if (!params.enabled || !q || q.gen !== gen) return;
    // The active slice goes to the front: newly, or moved up if it is still waiting.
    if (params.active) {
      const key = sliceKey(params.active);
      if (!q.requested.has(key)) {
        q.requested.add(key);
        q.pending.unshift(params.active);
      } else {
        const i = q.pending.findIndex((f) => sliceKey(f) === key);
        if (i > 0) q.pending.unshift(...q.pending.splice(i, 1));
      }
    }
    // Prefetch behind it, each slice once.
    params.prefetch.forEach((f) => {
      const key = sliceKey(f);
      if (q.requested.has(key)) return;
      q.requested.add(key);
      q.pending.push(f);
    });
    pump();
    // `activeKey` / `prefetchKey` stand for the filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen, params.enabled, activeKey, prefetchKey, pump]);

  const current = results.gen === gen ? results : null;
  return {
    active: activeKey ? (current?.slices.get(activeKey) ?? null) : null,
    activeStatus: activeKey ? (current?.status.get(activeKey) ?? 'pending') : null,
    status: current?.status ?? new Map(),
  };
}

// ---------------------------------------------------------------------------------------------
// Focus neighborhood
// ---------------------------------------------------------------------------------------------

const NEIGHBORHOOD_NAME_CHUNK = 100;
/** Hops a Full call path follows on a large map (one query round per hop). */
export const NEIGHBORHOOD_MAX_ROUNDS = 12;

export interface UseFocusNeighborhoodResult {
  neighborhood: Neighborhood | null;
  isLoading: boolean;
  /** A query came back partial (the connections of some names were cut). */
  truncated: boolean;
  /** The call path continues beyond NEIGHBORHOOD_MAX_ROUNDS hops (not shown). */
  pathCut: boolean;
  error: Error | null;
}

/**
 * A focused service's neighborhood on a large map, fetched directly instead of from a loaded
 * topology: the connections of the center (Direct connections), expanded round by round along
 * the call path (Full call path) until it is complete, reaches FOCUS_MAX_NODES, or runs out of
 * rounds (NEIGHBORHOOD_MAX_ROUNDS hops; reported as `pathCut`). Each round
 * queries the connections of the newly reached names only.
 */
export function useFocusNeighborhood(
  params: Range & {
    enabled: boolean;
    center: { nodeId: string; name: string } | null;
    mode: FocusMode;
  }
): UseFocusNeighborhoodResult {
  const { queryIndex, dataset } = useServiceMapDataset();
  const service = useMemo(() => new PPLSearchService(), []);
  const key = `${rangeKey(params, queryIndex)}|${params.center?.nodeId ?? ''}|${params.mode}`;
  const [state, setState] = useState<{
    key: string;
    neighborhood: Neighborhood | null;
    truncated: boolean;
    pathCut: boolean;
    error: Error | null;
  } | null>(null);

  useEffect(() => {
    if (!params.enabled || !params.center || !queryIndex || !dataset) return;
    const controller = new AbortController();
    const center = params.center;
    const base = {
      queryIndex,
      startTime: params.startTime,
      endTime: params.endTime,
      dataset,
    } as any;
    (async () => {
      let graph: MapGraph = { nodes: [], edges: [] };
      let truncated = false;
      const fetched = new Set<string>();
      let toFetch = [center.name];
      for (let round = 0; round < NEIGHBORHOOD_MAX_ROUNDS && toFetch.length > 0; round++) {
        const chunks: string[][] = [];
        for (let i = 0; i < toFetch.length; i += NEIGHBORHOOD_NAME_CHUNK) {
          chunks.push(toFetch.slice(i, i + NEIGHBORHOOD_NAME_CHUNK));
        }
        toFetch.forEach((n) => fetched.add(n));
        const parts = await Promise.all(
          chunks.map((names) =>
            service.getServiceMapSlice(base, { kind: 'names', names }, controller.signal)
          )
        );
        if (controller.signal.aborted) return;
        parts.forEach((p: any) => (truncated = truncated || !!p.truncated));
        graph = mergeGraphs([
          graph,
          ...parts.map((p: any) => ({ nodes: p.Nodes ?? [], edges: p.Edges ?? [] })),
        ]);
        if (params.mode === 'direct') {
          toFetch = [];
          break;
        }
        const reached = getNeighborhood(graph.nodes, graph.edges, center.nodeId, params.mode);
        if (!reached || reached.totalConnected > reached.nodes.length - 1) {
          toFetch = []; // capped at FOCUS_MAX_NODES (reported by the neighborhood itself)
          break;
        }
        toFetch = Array.from(new Set(reached.nodes.map((n) => n.KeyAttributes.Name))).filter(
          (n) => !fetched.has(n)
        );
      }
      // Out of rounds with names still to follow: the call path goes on beyond what is shown.
      const pathCut = toFetch.length > 0;
      setState({
        key,
        neighborhood: getNeighborhood(graph.nodes, graph.edges, center.nodeId, params.mode),
        truncated,
        pathCut,
        error: null,
      });
    })().catch((err) => {
      if (controller.signal.aborted) return;

      console.error('[useFocusNeighborhood] Error:', err);
      setState({
        key,
        neighborhood: null,
        truncated: false,
        pathCut: false,
        error: err instanceof Error ? err : new Error('Unknown error'),
      });
    });
    return () => controller.abort();
    // `key` covers the range, center and mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, params.enabled, dataset, service]);

  const current = state?.key === key ? state : null;
  return {
    neighborhood: current?.neighborhood ?? null,
    isLoading: params.enabled && !!params.center && !current,
    truncated: current?.truncated ?? false,
    pathCut: current?.pathCut ?? false,
    error: current?.error ?? null,
  };
}

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
import { APPLICATION_MAP_CONSTANTS } from '../../common/constants';
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

/** Service-map rows as the PPL search service returns them. */
interface ServiceMapResult {
  Nodes?: ServiceMapNode[];
  Edges?: ServiceMapEdge[];
  truncated?: boolean;
}

const toError = (err: unknown) => (err instanceof Error ? err : new Error('Unknown error'));

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
  // The data source and dataset ids too: the same index name on another cluster is other data.
  const datasetKey = `${dataset?.dataSource?.id ?? ''}|${dataset?.id ?? ''}|${queryIndex}`;
  return { queryIndex, dataset, datasetKey };
}

const rangeKey = (r: Range, datasetKey: string) =>
  `${datasetKey}|${r.startTime.getTime()}|${r.endTime.getTime()}|${r.refreshTrigger ?? 0}`;

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

/** Whether the page is visible (background prefetch pauses while it isn't). */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

// ---------------------------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------------------------

export interface UseServiceMapOverviewResult {
  /** The service-map dataset is configured (until then nothing loads, and nothing is known). */
  ready: boolean;
  nodes: ServiceMapNode[];
  availableGroupByAttributes: Record<string, string[]>;
  /** A node-list aggregation may have been cut (see getServiceMapOverview). */
  truncated: boolean;
  isLoading: boolean;
  error: Error | null;
  retry: () => void;
}

/**
 * Every node of the map, from aggregations (seconds even on long ranges), without reading the
 * topology. `groupByAttribute` adds that attribute's value to the nodes (for grouping by it).
 */
export function useServiceMapOverview(
  params: Range & { groupByAttribute?: string | null }
): UseServiceMapOverviewResult {
  const { queryIndex, dataset, datasetKey } = useServiceMapDataset();
  const service = useMemo(() => new PPLSearchService(), []);
  const attribute = params.groupByAttribute || undefined;
  const [attempt, setAttempt] = useState(0);
  const key = `${rangeKey(params, datasetKey)}|${attribute ?? ''}|${attempt}`;
  const [state, setState] = useState<{
    key: string;
    result: { nodes: ServiceMapNode[]; attributes: Record<string, string[]>; truncated: boolean };
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
            attributes: r.AvailableGroupByAttributes,
            truncated: r.truncated,
          },
          error: null,
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;

        console.error('[useServiceMapOverview] Error:', err);
        setState({
          key,
          result: { nodes: [], attributes: {}, truncated: false },
          error: toError(err),
        });
      });
    return () => controller.abort();
    // `key` covers the range, dataset, attribute and retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dataset, service]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const current = state?.key === key ? state : null;
  return {
    ready: !!queryIndex && !!dataset,
    nodes: current?.result.nodes ?? [],
    availableGroupByAttributes: current?.result.attributes ?? {},
    truncated: current?.result.truncated ?? false,
    isLoading: !!queryIndex && !!dataset && !current,
    error: current?.error ?? null,
    retry,
  };
}

// ---------------------------------------------------------------------------------------------
// Slices (an opened environment or group)
// ---------------------------------------------------------------------------------------------

export type SliceStatus = 'pending' | 'done' | 'failed';
export interface SliceResult extends MapGraph {
  truncated: boolean;
}
/** A slice to load: its filter, and its nodes' names (to split it if it reaches the cap). */
export interface SliceRequest {
  filter: ServiceMapSliceFilter;
  names?: string[];
}

export const sliceKey = (filter: ServiceMapSliceFilter): string => JSON.stringify(filter);

export interface UseServiceMapSlicesResult {
  /** The active slice's topology, once loaded. */
  active: SliceResult | null;
  activeStatus: SliceStatus | null;
  activeError: Error | null;
  /** Load the active slice again after a failure. */
  retryActive: () => void;
}

/**
 * Exact topologies of large-map slices, kept for the time range (a new range or data source
 * drops them and aborts). The `active` slice loads at once, in its own slot. `prefetch` (most
 * important first, at most PREFETCH_MAX_SLICES) loads one at a time behind it while enabled,
 * `prefetchEnabled` and the page is visible; the queue follows the current list, so slices no
 * longer listed (e.g. after switching Group by) are dropped. A failed prefetch is tried again
 * when opened; a failed opened slice waits for `retryActive`.
 */
export function useServiceMapSlices(
  params: Range & {
    enabled: boolean;
    prefetchEnabled: boolean;
    active: SliceRequest | null;
    prefetch: SliceRequest[];
  }
): UseServiceMapSlicesResult {
  const { queryIndex, dataset, datasetKey } = useServiceMapDataset();
  const service = useMemo(() => new PPLSearchService(), []);
  const visible = usePageVisible();
  const gen = rangeKey(params, datasetKey);
  const [results, setResults] = useState<{
    gen: string;
    slices: Map<string, SliceResult>;
    status: Map<string, { status: SliceStatus; error?: Error }>;
  }>({ gen, slices: new Map(), status: new Map() });
  // Per generation: the abort for everything, the slices in flight, the prefetch queue.
  const run = useRef<{
    gen: string;
    controller: AbortController;
    inFlight: Set<string>;
    settled: Set<string>;
    queue: SliceRequest[];
    prefetching: boolean;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    run.current = {
      gen,
      controller,
      inFlight: new Set(),
      settled: new Set(),
      queue: [],
      prefetching: false,
    };
    setResults({ gen, slices: new Map(), status: new Map() });
    return () => controller.abort();
  }, [gen]);

  const load = useCallback(
    (request: SliceRequest, opened: boolean): Promise<void> => {
      const r = run.current;
      if (!r || !dataset) return Promise.resolve();
      const key = sliceKey(request.filter);
      r.inFlight.add(key);
      const setStatus = (status: SliceStatus, extra?: Partial<SliceResult>, error?: Error) =>
        setResults((prev) => {
          if (prev.gen !== r.gen) return prev;
          const slices = extra ? new Map(prev.slices).set(key, extra as SliceResult) : prev.slices;
          return { ...prev, slices, status: new Map(prev.status).set(key, { status, error }) };
        });
      setStatus('pending');
      return service
        .getServiceMapSlice(
          { queryIndex, startTime: params.startTime, endTime: params.endTime, dataset } as any,
          request.filter,
          r.controller.signal,
          request.names
        )
        .then(
          (res: ServiceMapResult) => {
            if (r.controller.signal.aborted) return;
            r.settled.add(key);
            setStatus('done', {
              nodes: res.Nodes ?? [],
              edges: res.Edges ?? [],
              truncated: !!res.truncated,
            });
          },
          (err: unknown) => {
            if (r.controller.signal.aborted) return;

            console.error('[useServiceMapSlices] Slice failed:', err);
            // An opened slice waits for Retry; a failed prefetch is tried again when opened.
            if (opened) r.settled.add(key);
            setStatus('failed', undefined, toError(err));
          }
        )
        .finally(() => r.inFlight.delete(key));
    },
    // Range params are read through `gen` (one run per generation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataset, queryIndex, service, gen]
  );

  // The active slice: right away, in its own slot (not behind a running prefetch).
  const activeKey = params.active ? sliceKey(params.active.filter) : null;
  const [activeAttempt, setActiveAttempt] = useState(0);
  const activeRequest = useRef(params.active);
  activeRequest.current = params.active;
  useEffect(() => {
    const r = run.current;
    const request = activeRequest.current;
    if (!params.enabled || !r || r.gen !== gen || !request || !activeKey) return;
    if (r.inFlight.has(activeKey) || r.settled.has(activeKey)) return;
    load(request, true);
  }, [gen, params.enabled, activeKey, activeAttempt, load]);

  const retryActive = useCallback(() => {
    const r = run.current;
    if (!r || !activeKey) return;
    r.settled.delete(activeKey);
    setActiveAttempt((a) => a + 1);
  }, [activeKey]);

  // Prefetch: the queue is rebuilt from the current list, and runs one at a time while allowed.
  const prefetchKey = params.prefetch.map((p) => sliceKey(p.filter)).join('&');
  const prefetchRequests = useRef(params.prefetch);
  prefetchRequests.current = params.prefetch;
  const allowed = params.enabled && params.prefetchEnabled && visible;
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;
  const pump = useCallback(() => {
    const r = run.current;
    if (!r || r.prefetching || r.controller.signal.aborted || !allowedRef.current) return;
    const next = r.queue.shift();
    if (!next) return;
    r.prefetching = true;
    load(next, false).finally(() => {
      r.prefetching = false;
      pump();
    });
  }, [load]);
  useEffect(() => {
    const r = run.current;
    if (!r || r.gen !== gen) return;
    r.queue = prefetchRequests.current
      .slice(0, APPLICATION_MAP_CONSTANTS.PREFETCH_MAX_SLICES)
      .filter((p) => {
        const key = sliceKey(p.filter);
        return !r.inFlight.has(key) && !r.settled.has(key);
      });
    if (allowed) pump();
  }, [gen, allowed, prefetchKey, pump]);

  const current = results.gen === gen ? results : null;
  const status = activeKey ? current?.status.get(activeKey) : undefined;
  return {
    active: activeKey ? (current?.slices.get(activeKey) ?? null) : null,
    activeStatus: activeKey ? (status?.status ?? 'pending') : null,
    activeError: status?.error ?? null,
    retryActive,
  };
}

// ---------------------------------------------------------------------------------------------
// Focus neighborhood
// ---------------------------------------------------------------------------------------------

export interface UseFocusNeighborhoodResult {
  /** The neighborhood found (from the rounds that completed, if a later one failed). */
  neighborhood: Neighborhood | null;
  isLoading: boolean;
  /** Part of it is missing: a query came back at the bucket cap, or a round failed. */
  truncated: boolean;
  /** The call path continues beyond FOCUS_MAX_HOPS hops (not shown). */
  pathCut: boolean;
  /**
   * Expansion stopped at FOCUS_MAX_NODES, so `neighborhood.totalConnected` counts the nodes
   * found so far, not all of them.
   */
  capped: boolean;
  error: Error | null;
  retry: () => void;
}

/**
 * A focused service's neighborhood on a large map, fetched directly instead of from a loaded
 * topology: the connections of the center (Direct connections), then for Full call path one
 * round per hop along call direction: the callees of the newly reached downstream nodes
 * (`source` in the frontier) and the callers of the newly reached upstream ones (`target` in
 * the frontier), so a shared database's other callers are not pulled in. Stops when the path
 * is complete, reaches FOCUS_MAX_NODES (`capped`) or FOCUS_MAX_HOPS (`pathCut`).
 */
export function useFocusNeighborhood(
  params: Range & {
    enabled: boolean;
    center: { nodeId: string; name: string } | null;
    mode: FocusMode;
  }
): UseFocusNeighborhoodResult {
  const { queryIndex, dataset, datasetKey } = useServiceMapDataset();
  const service = useMemo(() => new PPLSearchService(), []);
  const [attempt, setAttempt] = useState(0);
  const key = `${rangeKey(params, datasetKey)}|${params.center?.nodeId ?? ''}|${
    params.mode
  }|${attempt}`;
  const [state, setState] = useState<{
    key: string;
    neighborhood: Neighborhood | null;
    truncated: boolean;
    pathCut: boolean;
    capped: boolean;
    error: Error | null;
  } | null>(null);

  useEffect(() => {
    if (!params.enabled || !params.center || !queryIndex || !dataset) return;
    const controller = new AbortController();
    const center = params.center;
    const mode = params.mode;
    const base = {
      queryIndex,
      startTime: params.startTime,
      endTime: params.endTime,
      dataset,
    } as any;
    const { NAME_CHUNK_SIZE, FOCUS_MAX_HOPS, FOCUS_MAX_NODES } = APPLICATION_MAP_CONSTANTS;
    let graph: MapGraph = { nodes: [], edges: [] };
    let truncated = false;
    let pathCut = false;
    let capped = false;
    let rounds = 0;

    const fetchNames = async (names: string[], side?: 'source' | 'target') => {
      const chunks: string[][] = [];
      for (let i = 0; i < names.length; i += NAME_CHUNK_SIZE) {
        chunks.push(names.slice(i, i + NAME_CHUNK_SIZE));
      }
      const parts: ServiceMapResult[] = await Promise.all(
        chunks.map((chunk) =>
          service.getServiceMapSlice(base, { kind: 'names', names: chunk, side }, controller.signal)
        )
      );
      parts.forEach((p) => (truncated = truncated || !!p.truncated));
      graph = mergeGraphs([
        graph,
        ...parts.map((p) => ({ nodes: p.Nodes ?? [], edges: p.Edges ?? [] })),
      ]);
    };
    const nameOf = (id: string) => graph.nodes.find((n) => n.NodeId === id)?.KeyAttributes.Name;
    const neighbors = (ids: Set<string>, dir: 'callees' | 'callers') =>
      graph.edges
        .filter((e) => ids.has(dir === 'callees' ? e.SourceNodeId : e.DestinationNodeId))
        .map((e) => (dir === 'callees' ? e.DestinationNodeId : e.SourceNodeId));

    (async () => {
      await fetchNames([center.name]);
      rounds = 1;
      if (mode === 'path') {
        const seen = new Set([center.nodeId]);
        const fresh = (ids: string[]) => {
          const out = new Set(ids.filter((id) => !seen.has(id)));
          out.forEach((id) => seen.add(id));
          return out;
        };
        let down = fresh(neighbors(new Set([center.nodeId]), 'callees'));
        let up = fresh(neighbors(new Set([center.nodeId]), 'callers'));
        while (down.size > 0 || up.size > 0) {
          if (seen.size >= FOCUS_MAX_NODES) {
            capped = true;
            break;
          }
          if (rounds >= FOCUS_MAX_HOPS) {
            pathCut = true;
            break;
          }
          const names = (ids: Set<string>) =>
            Array.from(
              new Set(
                Array.from(ids)
                  .map(nameOf)
                  .filter((n): n is string => !!n)
              )
            );
          await Promise.all([
            down.size ? fetchNames(names(down), 'source') : Promise.resolve(),
            up.size ? fetchNames(names(up), 'target') : Promise.resolve(),
          ]);
          if (controller.signal.aborted) return;
          rounds++;
          const nextDown = fresh(neighbors(down, 'callees'));
          const nextUp = fresh(neighbors(up, 'callers'));
          down = nextDown;
          up = nextUp;
        }
      }
      if (controller.signal.aborted) return;
      setState({
        key,
        neighborhood: getNeighborhood(graph.nodes, graph.edges, center.nodeId, mode),
        truncated,
        pathCut,
        capped,
        error: null,
      });
    })().catch((err) => {
      if (controller.signal.aborted) return;

      console.error('[useFocusNeighborhood] Error:', err);
      // Keep what the completed rounds found, marked partial.
      setState({
        key,
        neighborhood:
          rounds > 0 ? getNeighborhood(graph.nodes, graph.edges, center.nodeId, mode) : null,
        truncated: rounds > 0,
        pathCut: false,
        capped: false,
        error: toError(err),
      });
    });
    return () => controller.abort();
    // `key` covers the range, dataset, center, mode and retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, params.enabled, dataset, service]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const current = state?.key === key ? state : null;
  return {
    neighborhood: current?.neighborhood ?? null,
    isLoading: params.enabled && !!params.center && !current,
    truncated: current?.truncated ?? false,
    pathCut: current?.pathCut ?? false,
    capped: current?.capped ?? false,
    error: current?.error ?? null,
    retry,
  };
}

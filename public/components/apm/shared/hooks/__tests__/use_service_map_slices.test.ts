/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import {
  mergeGraphs,
  SliceRequest,
  useFocusNeighborhood,
  useServiceMapOverview,
  useServiceMapSlices,
} from '../use_service_map_slices';
import { APPLICATION_MAP_CONSTANTS } from '../../../common/constants';

const mockGetServiceMapOverview = jest.fn();
const mockGetServiceMapSlice = jest.fn();
jest.mock('../../../query_services/ppl_search_service', () => ({
  PPLSearchService: jest.fn().mockImplementation(() => ({
    getServiceMapOverview: mockGetServiceMapOverview,
    getServiceMapSlice: mockGetServiceMapSlice,
  })),
}));

const mockConfig = { serviceMapDataset: { id: 'ds', title: 'svcmap' } };
jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: jest.fn(() => ({ config: mockConfig })),
}));

import { useApmConfig } from '../../../config/apm_config_context';

const node = (name: string): any => ({
  NodeId: `id-${name}`,
  KeyAttributes: { Name: name, Environment: 'dev' },
});
const edge = (a: string, b: string): any => ({
  EdgeId: `${a}${b}`,
  SourceNodeId: `id-${a}`,
  DestinationNodeId: `id-${b}`,
});
const range = {
  startTime: new Date('2026-01-01T00:00:00Z'),
  endTime: new Date('2026-01-01T01:00:00Z'),
};
const deferred = () => {
  let resolve: (v: unknown) => void = () => {};
  let reject: (e: unknown) => void = () => {};
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  jest.clearAllMocks();
  (useApmConfig as jest.Mock).mockReturnValue({ config: mockConfig });
});

describe('mergeGraphs', () => {
  it('dedupes nodes by id and connections by their ends', () => {
    const merged = mergeGraphs([
      { nodes: [node('a'), node('b')], edges: [edge('a', 'b')] },
      {
        nodes: [node('b'), node('c')],
        edges: [{ ...edge('a', 'b'), EdgeId: 'other' }, edge('b', 'c')],
      },
    ]);
    expect(merged.nodes.map((n) => n.NodeId)).toEqual(['id-a', 'id-b', 'id-c']);
    expect(merged.edges.map((e) => e.EdgeId)).toEqual(['id-a->id-b', 'id-b->id-c']);
  });
});

describe('useServiceMapOverview', () => {
  const ok = { Nodes: [node('a')], AvailableGroupByAttributes: { team: [] }, truncated: true };

  it('is not ready and loads nothing without a service-map dataset', () => {
    (useApmConfig as jest.Mock).mockReturnValue({ config: {} });
    const { result } = renderHook(() => useServiceMapOverview(range));
    expect(result.current.ready).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(mockGetServiceMapOverview).not.toHaveBeenCalled();
  });

  it('loads the nodes, attributes and truncation', async () => {
    mockGetServiceMapOverview.mockResolvedValue(ok);
    const { result } = renderHook(() =>
      useServiceMapOverview({ ...range, groupByAttribute: 'team' })
    );
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({ ready: true, truncated: true, error: null });
    expect(result.current.availableGroupByAttributes).toEqual({ team: [] });
    expect(mockGetServiceMapOverview.mock.calls[0][0]).toMatchObject({
      queryIndex: 'svcmap',
      groupByAttribute: 'team',
    });
  });

  it('reports a failure, and loads again on retry', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetServiceMapOverview.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(ok);
    const { result } = renderHook(() => useServiceMapOverview(range));
    await waitFor(() => expect(result.current.error?.message).toBe('boom'));
    expect(result.current.isLoading).toBe(false);

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.nodes).toHaveLength(1));
    expect(result.current.error).toBeNull();
  });

  it('reloads when the data source changes, even with the same index name', async () => {
    mockGetServiceMapOverview.mockResolvedValue(ok);
    const { result, rerender } = renderHook(() => useServiceMapOverview(range));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    (useApmConfig as jest.Mock).mockReturnValue({
      config: { serviceMapDataset: { ...mockConfig.serviceMapDataset, datasourceId: 'other' } },
    });
    rerender();
    await waitFor(() => expect(mockGetServiceMapOverview).toHaveBeenCalledTimes(2));
  });
});

describe('useServiceMapSlices', () => {
  const env = (environment: string, names?: string[]): SliceRequest => ({
    filter: { kind: 'environment', environment },
    names,
  });
  const requested = () => mockGetServiceMapSlice.mock.calls.map((c) => c[1].environment);
  let pending: Array<ReturnType<typeof deferred>>;
  beforeEach(() => {
    pending = [];
    mockGetServiceMapSlice.mockImplementation(() => {
      const d = deferred();
      pending.push(d);
      return d.promise;
    });
  });
  interface Props {
    active: SliceRequest | null;
    prefetch: SliceRequest[];
    prefetchEnabled?: boolean;
    startTime?: Date;
  }
  const renderSlices = (initial: Props) =>
    renderHook(
      (p: Props) =>
        useServiceMapSlices({
          ...range,
          ...(p.startTime && { startTime: p.startTime }),
          enabled: true,
          prefetchEnabled: p.prefetchEnabled ?? true,
          active: p.active,
          prefetch: p.prefetch,
        }),
      { initialProps: initial }
    );

  it('loads the opened slice at once, alongside a running prefetch, with its names', async () => {
    const { result, rerender } = renderSlices({ active: null, prefetch: [env('big'), env('b')] });
    expect(requested()).toEqual(['big']);

    rerender({ active: env('small', ['s1', 's2']), prefetch: [env('big'), env('b')] });
    expect(requested()).toEqual(['big', 'small']);
    expect(mockGetServiceMapSlice.mock.calls[1][3]).toEqual(['s1', 's2']);

    pending[1].resolve({ Nodes: [node('x')], Edges: [], truncated: true });
    await waitFor(() => expect(result.current.activeStatus).toBe('done'));
    expect(result.current.active).toMatchObject({ truncated: true });
    expect(result.current.active?.nodes).toHaveLength(1);
  });

  it('prefetches one at a time, in order, from the current list only', async () => {
    const { rerender } = renderSlices({ active: null, prefetch: [env('a'), env('b'), env('c')] });
    expect(requested()).toEqual(['a']);
    // Switching Group by replaces the list: b and c are dropped from the queue.
    rerender({ active: null, prefetch: [env('x'), env('a')] });
    pending[0].resolve({ Nodes: [], Edges: [] });
    await waitFor(() => expect(requested()).toEqual(['a', 'x']));
    pending[1].resolve({ Nodes: [], Edges: [] });
    await new Promise((r) => setTimeout(r, 0));
    expect(requested()).toEqual(['a', 'x']);
  });

  it(`prefetches at most ${APPLICATION_MAP_CONSTANTS.PREFETCH_MAX_SLICES} slices`, async () => {
    mockGetServiceMapSlice.mockResolvedValue({ Nodes: [], Edges: [] });
    const many = Array.from({ length: 15 }, (_, i) => env(`e${i}`));
    renderSlices({ active: null, prefetch: many });
    await waitFor(() =>
      expect(mockGetServiceMapSlice).toHaveBeenCalledTimes(
        APPLICATION_MAP_CONSTANTS.PREFETCH_MAX_SLICES
      )
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(mockGetServiceMapSlice).toHaveBeenCalledTimes(
      APPLICATION_MAP_CONSTANTS.PREFETCH_MAX_SLICES
    );
  });

  it('pauses prefetch while not allowed or the page is hidden, and resumes', async () => {
    const { rerender } = renderSlices({
      active: null,
      prefetch: [env('a')],
      prefetchEnabled: false,
    });
    expect(mockGetServiceMapSlice).not.toHaveBeenCalled();

    const hidden = jest.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    rerender({ active: null, prefetch: [env('a')], prefetchEnabled: true });
    expect(mockGetServiceMapSlice).not.toHaveBeenCalled();

    hidden.mockReturnValue(false);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(requested()).toEqual(['a']);
    hidden.mockRestore();
  });

  it('reports a failed opened slice and loads it again on retry', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderSlices({ active: env('a'), prefetch: [] });
    pending[0].reject(new Error('timed out'));
    await waitFor(() => expect(result.current.activeStatus).toBe('failed'));
    expect(result.current.activeError?.message).toBe('timed out');

    act(() => result.current.retryActive());
    await waitFor(() => expect(requested()).toEqual(['a', 'a']));
    pending[1].resolve({ Nodes: [], Edges: [] });
    await waitFor(() => expect(result.current.activeStatus).toBe('done'));
  });

  it('loads a slice whose prefetch failed again when it is opened', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = renderSlices({ active: null, prefetch: [env('a')] });
    pending[0].reject(new Error('503'));
    await new Promise((r) => setTimeout(r, 0));
    rerender({ active: env('a'), prefetch: [env('a')] });
    await waitFor(() => expect(requested()).toEqual(['a', 'a']));
  });

  it('drops results and aborts on a new time range', async () => {
    const { result, rerender } = renderSlices({ active: env('a'), prefetch: [] });
    const firstSignal: AbortSignal = mockGetServiceMapSlice.mock.calls[0][2];
    pending[0].resolve({ Nodes: [node('x')], Edges: [] });
    await waitFor(() => expect(result.current.activeStatus).toBe('done'));

    rerender({ active: env('a'), prefetch: [], startTime: new Date('2026-01-01T00:30:00Z') });
    expect(firstSignal.aborted).toBe(true);
    expect(result.current.active).toBeNull();
    await waitFor(() => expect(requested()).toEqual(['a', 'a']));
  });

  it('loads nothing while disabled', () => {
    renderHook(() =>
      useServiceMapSlices({
        ...range,
        enabled: false,
        prefetchEnabled: true,
        active: env('a'),
        prefetch: [env('b')],
      })
    );
    expect(mockGetServiceMapSlice).not.toHaveBeenCalled();
  });
});

describe('useFocusNeighborhood', () => {
  // Every connection of a graph, served per query like the slice aggregation: either end in
  // `names`, or only the `side` end.
  const serve =
    (all: any[], nodes: any[]) => (_p: unknown, f: { names: string[]; side?: string }) => {
      const ids = new Set(f.names.map((n) => `id-${n}`));
      const edges = all.filter((e) =>
        f.side === 'source'
          ? ids.has(e.SourceNodeId)
          : f.side === 'target'
            ? ids.has(e.DestinationNodeId)
            : ids.has(e.SourceNodeId) || ids.has(e.DestinationNodeId)
      );
      const used = new Set(edges.flatMap((e) => [e.SourceNodeId, e.DestinationNodeId]));
      return Promise.resolve({ Nodes: nodes.filter((n) => used.has(n.NodeId)), Edges: edges });
    };
  const names = (calls = mockGetServiceMapSlice.mock.calls) =>
    calls.map((c) => `${c[1].side ?? 'both'}:${[...c[1].names].sort().join(',')}`);
  // gw -> b -> db, other -> db (a shared database's other caller)
  const graph = [edge('gw', 'b'), edge('b', 'db'), edge('other', 'db'), edge('up', 'gw')];
  const graphNodes = ['gw', 'b', 'db', 'other', 'up'].map(node);
  const center = { nodeId: 'id-b', name: 'b' };
  const hook = (mode: 'direct' | 'path', c = center) =>
    renderHook(() => useFocusNeighborhood({ ...range, enabled: true, center: c, mode }));

  it('queries only the center for direct connections', async () => {
    mockGetServiceMapSlice.mockImplementation(serve(graph, graphNodes));
    const { result } = hook('direct');
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(names()).toEqual(['both:b']);
    expect(result.current.neighborhood?.nodes.map((n) => n.NodeId).sort()).toEqual([
      'id-b',
      'id-db',
      'id-gw',
    ]);
  });

  it('follows call direction: callees of downstream nodes, callers of upstream ones', async () => {
    mockGetServiceMapSlice.mockImplementation(serve(graph, graphNodes));
    const { result } = hook('path');
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(names()).toEqual(['both:b', 'source:db', 'target:gw', 'target:up']);
    // The database's other caller is not on b's call path.
    expect(result.current.neighborhood?.nodes.map((n) => n.NodeId).sort()).toEqual([
      'id-b',
      'id-db',
      'id-gw',
      'id-up',
    ]);
    expect(result.current).toMatchObject({ truncated: false, pathCut: false, capped: false });
  });

  it('queries a wide frontier in name chunks', async () => {
    const fan = Array.from({ length: 120 }, (_, i) => `c${i}`);
    mockGetServiceMapSlice.mockImplementation(
      serve(
        fan.map((n) => edge('b', n)),
        [node('b'), ...fan.map(node)]
      )
    );
    const { result } = hook('path');
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const downstream = mockGetServiceMapSlice.mock.calls.filter((c) => c[1].side === 'source');
    expect(downstream.map((c) => c[1].names.length)).toEqual([100, 20]);
  });

  it(`stops at ${APPLICATION_MAP_CONSTANTS.FOCUS_MAX_NODES} nodes, reporting the total as open`, async () => {
    const hub = Array.from({ length: 200 }, (_, i) => `c${i}`);
    mockGetServiceMapSlice.mockImplementation(
      serve(
        [...hub.map((n) => edge('b', n)), edge('c0', 'deep')],
        [node('b'), node('deep'), ...hub.map(node)]
      )
    );
    const { result } = hook('path');
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGetServiceMapSlice).toHaveBeenCalledTimes(1);
    expect(result.current.capped).toBe(true);
    expect(result.current.neighborhood?.nodes).toHaveLength(
      APPLICATION_MAP_CONSTANTS.FOCUS_MAX_NODES
    );
  });

  it(`reports a call path longer than ${APPLICATION_MAP_CONSTANTS.FOCUS_MAX_HOPS} hops`, async () => {
    const chain = Array.from({ length: 21 }, (_, i) => `n${i}`);
    mockGetServiceMapSlice.mockImplementation(
      serve(
        chain.slice(1).map((n, i) => edge(chain[i], n)),
        chain.map(node)
      )
    );
    const { result } = hook('path', { nodeId: 'id-n0', name: 'n0' });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGetServiceMapSlice).toHaveBeenCalledTimes(APPLICATION_MAP_CONSTANTS.FOCUS_MAX_HOPS);
    expect(result.current).toMatchObject({ pathCut: true, truncated: false });
  });

  it('keeps the rounds that completed when a later one fails, marked partial', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const ok = serve(graph, graphNodes);
    mockGetServiceMapSlice.mockImplementation(
      (p: unknown, f: { side?: string; names: string[] }) =>
        f.side ? Promise.reject(new Error('timed out')) : ok(p, f)
    );
    const { result } = hook('path');
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error?.message).toBe('timed out');
    expect(result.current.truncated).toBe(true);
    expect(result.current.neighborhood?.nodes).toHaveLength(3);
  });

  it('reports a failed first round with no neighborhood, and retries', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetServiceMapSlice.mockRejectedValueOnce(new Error('503'));
    const { result } = hook('direct');
    await waitFor(() => expect(result.current.error?.message).toBe('503'));
    expect(result.current.neighborhood).toBeNull();

    mockGetServiceMapSlice.mockImplementation(serve(graph, graphNodes));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.neighborhood?.nodes).toHaveLength(3));
    expect(result.current.error).toBeNull();
  });

  it('does nothing while disabled or without a center', () => {
    renderHook(() => useFocusNeighborhood({ ...range, enabled: false, center, mode: 'direct' }));
    const { result } = renderHook(() =>
      useFocusNeighborhood({ ...range, enabled: true, center: null, mode: 'direct' })
    );
    expect(mockGetServiceMapSlice).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });
});

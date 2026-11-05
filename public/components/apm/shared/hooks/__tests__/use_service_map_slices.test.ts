/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import {
  mergeGraphs,
  useFocusNeighborhood,
  useServiceMapOverview,
  useServiceMapSlices,
} from '../use_service_map_slices';

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
import { ServiceMapSliceFilter } from '../../../query_services/query_requests/ppl_queries';

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
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
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
  it('is not ready and loads nothing without a service-map dataset', () => {
    (useApmConfig as jest.Mock).mockReturnValue({ config: {} });
    const { result } = renderHook(() => useServiceMapOverview(range));
    expect(result.current.ready).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(mockGetServiceMapOverview).not.toHaveBeenCalled();
  });

  it('loads the nodes, connection count and attributes', async () => {
    mockGetServiceMapOverview.mockResolvedValue({
      Nodes: [node('a')],
      AvailableGroupByAttributes: { team: ['pay'] },
    });
    const { result } = renderHook(() =>
      useServiceMapOverview({ ...range, groupByAttribute: 'team' })
    );
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({ ready: true, error: null });
    expect(result.current.nodes).toHaveLength(1);
    expect(mockGetServiceMapOverview.mock.calls[0][0]).toMatchObject({
      queryIndex: 'svcmap',
      groupByAttribute: 'team',
    });
  });

  it('reports a failure', async () => {
    mockGetServiceMapOverview.mockRejectedValue(new Error('boom'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useServiceMapOverview(range));
    await waitFor(() => expect(result.current.error?.message).toBe('boom'));
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useServiceMapSlices', () => {
  const env = (environment: string) => ({ kind: 'environment' as const, environment });
  const requested = () => mockGetServiceMapSlice.mock.calls.map((c) => c[1].environment);

  it('loads the active slice first, then prefetches one at a time', async () => {
    const pending: Array<ReturnType<typeof deferred>> = [];
    mockGetServiceMapSlice.mockImplementation(() => {
      const d = deferred();
      pending.push(d);
      return d.promise;
    });
    const { result } = renderHook(() =>
      useServiceMapSlices({
        ...range,
        enabled: true,
        active: env('b'),
        prefetch: [env('a'), env('b'), env('c')],
      })
    );

    expect(requested()).toEqual(['b']);
    expect(result.current.activeStatus).toBe('pending');
    pending[0].resolve({ Nodes: [node('x')], Edges: [], truncated: true });
    await waitFor(() => expect(result.current.activeStatus).toBe('done'));
    expect(result.current.active).toMatchObject({ truncated: true });
    expect(result.current.active?.nodes).toHaveLength(1);

    await waitFor(() => expect(requested()).toEqual(['b', 'a']));
    pending[1].resolve({ Nodes: [], Edges: [] });
    await waitFor(() => expect(requested()).toEqual(['b', 'a', 'c']));
  });

  it('moves a newly opened slice ahead of the prefetch queue', async () => {
    const pending: Array<ReturnType<typeof deferred>> = [];
    mockGetServiceMapSlice.mockImplementation(() => {
      const d = deferred();
      pending.push(d);
      return d.promise;
    });
    const { rerender } = renderHook(
      (props: { active: ServiceMapSliceFilter | null }) =>
        useServiceMapSlices({
          ...range,
          enabled: true,
          active: props.active,
          prefetch: [env('a'), env('b'), env('c')],
        }),
      { initialProps: { active: null as ServiceMapSliceFilter | null } }
    );
    expect(requested()).toEqual(['a']);
    rerender({ active: env('c') });
    pending[0].resolve({ Nodes: [], Edges: [] });
    await waitFor(() => expect(requested()).toEqual(['a', 'c']));
  });

  it('marks a failed slice and keeps going', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetServiceMapSlice
      .mockRejectedValueOnce(new Error('timed out'))
      .mockResolvedValue({ Nodes: [], Edges: [] });
    const { result } = renderHook(() =>
      useServiceMapSlices({ ...range, enabled: true, active: env('a'), prefetch: [env('b')] })
    );
    await waitFor(() => expect(result.current.activeStatus).toBe('failed'));
    await waitFor(() => expect(requested()).toEqual(['a', 'b']));
  });

  it('loads nothing while disabled', () => {
    renderHook(() =>
      useServiceMapSlices({ ...range, enabled: false, active: env('a'), prefetch: [env('b')] })
    );
    expect(mockGetServiceMapSlice).not.toHaveBeenCalled();
  });
});

describe('useFocusNeighborhood', () => {
  // a -> b -> c -> d
  const byName: Record<string, any> = {
    a: { Nodes: [node('a'), node('b')], Edges: [edge('a', 'b')] },
    b: { Nodes: [node('a'), node('b'), node('c')], Edges: [edge('a', 'b'), edge('b', 'c')] },
    c: { Nodes: [node('b'), node('c'), node('d')], Edges: [edge('b', 'c'), edge('c', 'd')] },
    d: { Nodes: [node('c'), node('d')], Edges: [edge('c', 'd')] },
  };
  beforeEach(() =>
    mockGetServiceMapSlice.mockImplementation((_p: unknown, filter: { names: string[] }) =>
      Promise.resolve(mergeGraphsResponse(filter.names.map((n) => byName[n])))
    )
  );
  const mergeGraphsResponse = (parts: any[]) => {
    const g = mergeGraphs(parts.map((p) => ({ nodes: p.Nodes, edges: p.Edges })));
    return { Nodes: g.nodes, Edges: g.edges };
  };
  const center = { nodeId: 'id-b', name: 'b' };

  it('queries only the center for direct connections', async () => {
    const { result } = renderHook(() =>
      useFocusNeighborhood({ ...range, enabled: true, center, mode: 'direct' })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGetServiceMapSlice).toHaveBeenCalledTimes(1);
    expect(mockGetServiceMapSlice.mock.calls[0][1]).toEqual({ kind: 'names', names: ['b'] });
    expect(result.current.neighborhood?.nodes.map((n) => n.NodeId).sort()).toEqual([
      'id-a',
      'id-b',
      'id-c',
    ]);
  });

  it('expands round by round along the call path, querying new names only', async () => {
    const { result } = renderHook(() =>
      useFocusNeighborhood({ ...range, enabled: true, center, mode: 'path' })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const rounds = mockGetServiceMapSlice.mock.calls.map((c) => c[1].names);
    expect(rounds[0]).toEqual(['b']);
    expect(rounds[1].sort()).toEqual(['a', 'c']);
    expect(rounds[2]).toEqual(['d']);
    expect(result.current.neighborhood?.nodes).toHaveLength(4);
    expect(result.current.truncated).toBe(false);
    expect(result.current.pathCut).toBe(false);
  });

  it('reports a call path longer than the rounds allow', async () => {
    // A chain n0 -> n1 -> ... -> n20: each round reaches one more hop each way from n0.
    const chain = (i: number) => {
      const names = [i - 1, i, i + 1].filter((k) => k >= 0 && k <= 20).map((k) => `n${k}`);
      return {
        Nodes: names.map((n) => node(n)),
        Edges: names.slice(1).map((n, k) => edge(names[k], n)),
      };
    };
    mockGetServiceMapSlice.mockImplementation((_p: unknown, filter: { names: string[] }) =>
      Promise.resolve(mergeGraphsResponse(filter.names.map((n) => chain(Number(n.slice(1))))))
    );
    const { result } = renderHook(() =>
      useFocusNeighborhood({
        ...range,
        enabled: true,
        center: { nodeId: 'id-n0', name: 'n0' },
        mode: 'path',
      })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGetServiceMapSlice).toHaveBeenCalledTimes(12);
    expect(result.current.pathCut).toBe(true);
    expect(result.current.truncated).toBe(false);
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

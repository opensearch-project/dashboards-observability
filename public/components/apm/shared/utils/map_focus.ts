/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServiceMapEdge, ServiceMapNode } from '../../common/types/service_map_types';

/**
 * - `direct`: the node's direct callers and callees.
 * - `path`: its full call path: everything upstream (callers, their callers, ...) and everything
 *   downstream (callees, their callees, ...), following call direction. Unlike counting hops in
 *   both directions, this never wanders up to a shared caller or topic and back down to its
 *   unrelated callees (siblings).
 */
export type FocusMode = 'direct' | 'path';

/**
 * The focused view of `centerId`: its connected nodes (see FocusMode) and the edges among them.
 * Small enough to lay out instantly and read at full size, unlike the whole map of a large
 * deployment. Returns null when the center is not on the map.
 */
export function getNeighborhood(
  nodes: ServiceMapNode[],
  edges: ServiceMapEdge[],
  centerId: string,
  mode: FocusMode
): { nodes: ServiceMapNode[]; edges: ServiceMapEdge[] } | null {
  if (!nodes.some((n) => n.NodeId === centerId)) return null;

  const callees = new Map<string, string[]>();
  const callers = new Map<string, string[]>();
  const link = (map: Map<string, string[]>, a: string, b: string) => {
    const list = map.get(a);
    if (list) list.push(b);
    else map.set(a, [b]);
  };
  edges.forEach((e) => {
    link(callees, e.SourceNodeId, e.DestinationNodeId);
    link(callers, e.DestinationNodeId, e.SourceNodeId);
  });

  // Everything reachable from the center along one direction (one step for `direct`).
  const reach = (graph: Map<string, string[]>): Set<string> => {
    const seen = new Set<string>();
    let frontier = [centerId];
    while (frontier.length > 0) {
      const next: string[] = [];
      frontier.forEach((id) =>
        (graph.get(id) ?? []).forEach((n) => {
          if (n !== centerId && !seen.has(n)) {
            seen.add(n);
            next.push(n);
          }
        })
      );
      frontier = mode === 'direct' ? [] : next;
    }
    return seen;
  };

  const included = new Set([centerId, ...reach(callees), ...reach(callers)]);
  return {
    nodes: nodes.filter((n) => included.has(n.NodeId)),
    edges: edges.filter((e) => included.has(e.SourceNodeId) && included.has(e.DestinationNodeId)),
  };
}

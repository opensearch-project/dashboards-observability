/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FocusMode, ServiceMapEdge, ServiceMapNode } from '../../common/types/service_map_types';
import { APPLICATION_MAP_CONSTANTS } from '../../common/constants';

export type { FocusMode };

export interface Neighborhood {
  nodes: ServiceMapNode[];
  edges: ServiceMapEdge[];
  /** Connected nodes in total (excluding the center), before the FOCUS_MAX_NODES cap. */
  totalConnected: number;
}

/**
 * The focused view of `centerId`: its connected nodes (see FocusMode) and the edges among them,
 * laid out on its own and readable at full size. A hub can connect to hundreds of nodes, so the
 * view keeps the center and the nearest connections (breadth-first: direct callers and callees
 * before their callers and callees) up to `maxNodes`; `totalConnected` tells how many there are.
 * Returns null when the center is not on the map.
 */
export function getNeighborhood(
  nodes: ServiceMapNode[],
  edges: ServiceMapEdge[],
  centerId: string,
  mode: FocusMode,
  maxNodes: number = APPLICATION_MAP_CONSTANTS.FOCUS_MAX_NODES
): Neighborhood | null {
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

  // Breadth-first along call direction, upstream and downstream in step, so the nearest
  // connections come first (one step only for `direct`).
  const order: string[] = [];
  const seen = new Set([centerId]);
  let up = [centerId];
  let down = [centerId];
  while (up.length > 0 || down.length > 0) {
    const step = (frontier: string[], graph: Map<string, string[]>) => {
      const next: string[] = [];
      frontier.forEach((id) =>
        (graph.get(id) ?? []).forEach((n) => {
          if (!seen.has(n)) {
            seen.add(n);
            order.push(n);
            next.push(n);
          }
        })
      );
      return next;
    };
    up = step(up, callers);
    down = step(down, callees);
    if (mode === 'direct') break;
  }

  const included = new Set([centerId, ...order.slice(0, Math.max(0, maxNodes - 1))]);
  return {
    nodes: nodes.filter((n) => included.has(n.NodeId)),
    edges: edges.filter((e) => included.has(e.SourceNodeId) && included.has(e.DestinationNodeId)),
    totalConnected: order.length,
  };
}

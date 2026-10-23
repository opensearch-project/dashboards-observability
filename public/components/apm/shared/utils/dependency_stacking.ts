/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServiceMapEdge, ServiceMapNode } from '../../common/types/service_map_types';
import { isDependencyType, normalizeNodeType } from './platform_utils';

/** The map without dependency nodes and the edges that touch them. */
export function removeDependencies(
  nodes: ServiceMapNode[],
  edges: ServiceMapEdge[]
): { nodes: ServiceMapNode[]; edges: ServiceMapEdge[] } {
  const dependencyIds = new Set(
    nodes.filter((n) => isDependencyType(n.KeyAttributes.Type)).map((n) => n.NodeId)
  );
  if (dependencyIds.size === 0) return { nodes, edges };
  return {
    nodes: nodes.filter((n) => !dependencyIds.has(n.NodeId)),
    edges: edges.filter(
      (e) => !dependencyIds.has(e.SourceNodeId) && !dependencyIds.has(e.DestinationNodeId)
    ),
  };
}

export interface DependencyStacks {
  /** Stack id per stacked dependency node id (only stacks of two or more). */
  stackIdByNodeId: Map<string, string>;
  /** Dependency nodes folded into stacks. */
  stackedNodes: number;
  /** Stacks on the map. */
  stacks: number;
}

/**
 * Group dependency nodes into stacks for a large map: dependencies of the same type that are
 * connected to exactly the same nodes (e.g. two databases both called only by `checkout`).
 * Such nodes have identical edges, so folding them into one stack hides no connection; it
 * only removes nodes from the layout. Dependencies with a unique set of neighbors stay as they
 * are.
 *
 * @param nodes - Map nodes
 * @param edges - Map edges
 * @param keepIds - Node ids never stacked (e.g. the selected node)
 */
export function computeDependencyStacks(
  nodes: ServiceMapNode[],
  edges: ServiceMapEdge[],
  keepIds: ReadonlySet<string> = new Set()
): DependencyStacks {
  const neighbors = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    const set = neighbors.get(a) ?? new Set<string>();
    set.add(b);
    neighbors.set(a, set);
  };
  edges.forEach((e) => {
    // Direction is kept: a broker's producers and consumers are different neighbors.
    link(e.SourceNodeId, `out:${e.DestinationNodeId}`);
    link(e.DestinationNodeId, `in:${e.SourceNodeId}`);
  });

  const groups = new Map<string, string[]>();
  nodes.forEach((n) => {
    if (!isDependencyType(n.KeyAttributes.Type) || keepIds.has(n.NodeId)) return;
    const key = `deps::${normalizeNodeType(n.KeyAttributes.Type)}::${Array.from(
      neighbors.get(n.NodeId) || []
    )
      .sort()
      .join('|')}`;
    const group = groups.get(key) || [];
    group.push(n.NodeId);
    groups.set(key, group);
  });

  const stackIdByNodeId = new Map<string, string>();
  let stacks = 0;
  groups.forEach((ids, key) => {
    if (ids.length < 2) return;
    stacks += 1;
    ids.forEach((id) => stackIdByNodeId.set(id, key));
  });
  return { stackIdByNodeId, stackedNodes: stackIdByNodeId.size, stacks };
}

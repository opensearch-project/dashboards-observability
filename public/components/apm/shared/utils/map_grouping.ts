/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServiceMapEdge, ServiceMapNode } from '../../common/types/service_map_types';
import { APPLICATION_MAP_CONSTANTS } from '../../common/constants';
import { computeDependencyStacks } from './dependency_stacking';

/**
 * Built-in map group-by: the node's environment (a key attribute, so it is available for every
 * node, unlike the configured groupByAttributes). Also the Prometheus label name, so group
 * metrics (useGroupMetrics) resolve it unchanged.
 */
export const ENVIRONMENT_GROUP_BY = 'environment';

/** The value a node is grouped under for a group-by attribute, if it has one. */
export function getNodeGroupValue(node: ServiceMapNode, groupBy: string): string | undefined {
  if (groupBy === ENVIRONMENT_GROUP_BY) return node.KeyAttributes?.Environment || undefined;
  return node.GroupByAttributes?.[groupBy];
}

/**
 * Node count the graph would lay out for these nodes (dependency stacks count as one node,
 * matching ServiceMapGraph), and whether that exceeds what the map can draw responsively.
 * The layout cost grows much faster than linearly (~22 s for 600 nodes on a laptop), so above
 * the cap the map is shown grouped instead.
 */
export function exceedsMapRenderCap(
  nodes: ServiceMapNode[],
  edges: ServiceMapEdge[],
  stackDependencies: boolean = true
): boolean {
  if (nodes.length <= APPLICATION_MAP_CONSTANTS.MAX_RENDERED_NODES) return false;
  if (!stackDependencies || nodes.length <= APPLICATION_MAP_CONSTANTS.DEPENDENCY_STACK_THRESHOLD) {
    return true;
  }
  const { stackedNodes, stacks } = computeDependencyStacks(nodes, edges);
  return nodes.length - stackedNodes + stacks > APPLICATION_MAP_CONSTANTS.MAX_RENDERED_NODES;
}

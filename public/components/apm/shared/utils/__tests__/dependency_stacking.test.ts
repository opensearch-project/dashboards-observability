/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { computeDependencyStacks, removeDependencies } from '../dependency_stacking';
import { ServiceMapEdge, ServiceMapNode } from '../../../common/types/service_map_types';

const node = (name: string, type = 'service'): ServiceMapNode =>
  ({
    NodeId: name,
    Name: name,
    KeyAttributes: { Name: name, Environment: 'generic:default', Type: type },
  }) as unknown as ServiceMapNode;
const edge = (source: string, target: string): ServiceMapEdge =>
  ({
    EdgeId: `${source}->${target}`,
    SourceNodeId: source,
    DestinationNodeId: target,
  }) as ServiceMapEdge;

describe('dependency stacking', () => {
  const nodes = [
    node('checkout'),
    node('cart'),
    node('pg-1', 'database'),
    node('pg-2', 'database'),
    node('pg-3', 'database'),
    node('redis', 'database'),
    node('kafka:orders', 'messaging'),
    node('kafka:payments', 'messaging'),
    node('api.openai.com', 'external'),
  ];
  const edges = [
    edge('checkout', 'cart'),
    edge('checkout', 'pg-1'),
    edge('checkout', 'pg-2'),
    edge('checkout', 'pg-3'),
    edge('cart', 'redis'),
    edge('checkout', 'kafka:orders'),
    edge('kafka:orders', 'cart'),
    edge('checkout', 'kafka:payments'),
    edge('checkout', 'api.openai.com'),
  ];

  it('removes dependency nodes and their edges', () => {
    const result = removeDependencies(nodes, edges);
    expect(result.nodes.map((n) => n.NodeId)).toEqual(['checkout', 'cart']);
    expect(result.edges.map((e) => e.EdgeId)).toEqual(['checkout->cart']);
  });

  it('stacks dependencies of one type that connect to exactly the same nodes', () => {
    const stacks = computeDependencyStacks(nodes, edges);
    // pg-1..3 are all called only by checkout: one stack. redis has other neighbors.
    expect(stacks.stacks).toBe(1);
    expect(stacks.stackedNodes).toBe(3);
    const ids = ['pg-1', 'pg-2', 'pg-3'].map((id) => stacks.stackIdByNodeId.get(id));
    expect(new Set(ids).size).toBe(1);
    expect(stacks.stackIdByNodeId.has('redis')).toBe(false);
    expect(stacks.stackIdByNodeId.has('api.openai.com')).toBe(false);
  });

  it('keeps edge direction: a broker with consumers does not stack with one without', () => {
    const stacks = computeDependencyStacks(nodes, edges);
    expect(stacks.stackIdByNodeId.has('kafka:orders')).toBe(false);
    expect(stacks.stackIdByNodeId.has('kafka:payments')).toBe(false);
  });

  it('never stacks a kept node (e.g. the selected one), nor services', () => {
    const stacks = computeDependencyStacks(nodes, edges, new Set(['pg-1']));
    expect(stacks.stackIdByNodeId.has('pg-1')).toBe(false);
    expect(stacks.stackedNodes).toBe(2);
    const servicesOnly = computeDependencyStacks(
      [node('a'), node('b'), node('c')],
      [edge('a', 'b'), edge('a', 'c')]
    );
    expect(servicesOnly.stacks).toBe(0);
  });
});

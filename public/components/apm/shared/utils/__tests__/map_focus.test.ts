/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServiceMapEdge, ServiceMapNode } from '../../../common/types/service_map_types';
import { getNeighborhood } from '../map_focus';

const node = (id: string, environment = 'dev'): ServiceMapNode => ({
  NodeId: id,
  Name: id,
  Type: 'AWS::CloudWatch::Service',
  KeyAttributes: { Environment: environment, Name: id, Type: 'service' },
  AttributeMaps: [],
  GroupByAttributes: {},
  StatisticReferences: {},
  AggregatedNodeId: null,
});
const edge = (s: string, t: string): ServiceMapEdge => ({
  EdgeId: `${s}->${t}`,
  SourceNodeId: s,
  DestinationNodeId: t,
  StatisticReferences: {},
});

// gateway -> api -> db, api -> topic (other environment) -> consumer; unrelated -> other
const nodes = [
  node('gateway'),
  node('api'),
  node('db'),
  node('topic', 'generic:default'),
  node('consumer'),
  node('unrelated'),
  node('other'),
];
const edges = [
  edge('gateway', 'api'),
  edge('api', 'db'),
  edge('api', 'topic'),
  edge('topic', 'consumer'),
  edge('unrelated', 'other'),
];
const ids = (r: ReturnType<typeof getNeighborhood>) => r?.nodes.map((n) => n.NodeId).sort();

describe('getNeighborhood', () => {
  it('direct: callers and callees, including other environments, and the edges among them', () => {
    const r = getNeighborhood(nodes, edges, 'api', 'direct');
    expect(ids(r)).toEqual(['api', 'db', 'gateway', 'topic']);
    expect(r?.edges.map((e) => e.EdgeId).sort()).toEqual(['api->db', 'api->topic', 'gateway->api']);
  });

  it('path: everything upstream and downstream, following call direction', () => {
    expect(ids(getNeighborhood(nodes, edges, 'api', 'path'))).toEqual([
      'api',
      'consumer',
      'db',
      'gateway',
      'topic',
    ]);
  });

  it('path does not wander up to a shared caller and down to its other callees (siblings)', () => {
    // db is called by api only; its path is api and api's callers, not api's other callees.
    expect(ids(getNeighborhood(nodes, edges, 'db', 'path'))).toEqual(['api', 'db', 'gateway']);
  });

  it('is null for a node not on the map', () => {
    expect(getNeighborhood(nodes, edges, 'missing', 'direct')).toBeNull();
  });
});

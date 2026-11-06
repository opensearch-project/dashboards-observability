/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServiceMapEdge, ServiceMapNode } from '../../../common/types/service_map_types';
import { APPLICATION_MAP_CONSTANTS } from '../../../common/constants';
import { ENVIRONMENT_GROUP_BY, exceedsMapRenderCap, getNodeGroupValue } from '../map_grouping';

const node = (id: string, type = 'service', environment = 'dev'): ServiceMapNode => ({
  NodeId: id,
  Name: id,
  Type: 'AWS::CloudWatch::Service',
  KeyAttributes: { Environment: environment, Name: id, Type: type },
  AttributeMaps: [],
  GroupByAttributes: { 'telemetry.sdk.language': 'java' },
  StatisticReferences: {},
  AggregatedNodeId: null,
});

describe('getNodeGroupValue', () => {
  it('groups by the environment key attribute or a configured attribute', () => {
    const n = node('a', 'service', 'eks:prod');
    expect(getNodeGroupValue(n, ENVIRONMENT_GROUP_BY)).toBe('eks:prod');
    expect(getNodeGroupValue(n, 'telemetry.sdk.language')).toBe('java');
    expect(getNodeGroupValue(n, 'team')).toBeUndefined();
  });
});

describe('exceedsMapRenderCap', () => {
  const cap = APPLICATION_MAP_CONSTANTS.MAX_RENDERED_NODES;
  const services = (n: number) => Array.from({ length: n }, (_, i) => node(`s${i}`));

  it('is false at or below the cap and true above it', () => {
    expect(exceedsMapRenderCap(services(cap), [])).toBe(false);
    expect(exceedsMapRenderCap(services(cap + 1), [])).toBe(true);
  });

  it('counts a stack of dependencies as one node, unless stacking is off', () => {
    const svc = services(cap - 10);
    const deps = Array.from({ length: 50 }, (_, i) => node(`db${i}`, 'database'));
    // Every database is called only by s0, so they fold into one stack.
    const edges: ServiceMapEdge[] = deps.map((d, i) => ({
      EdgeId: `e${i}`,
      SourceNodeId: 's0',
      DestinationNodeId: d.NodeId,
      StatisticReferences: {},
    }));
    expect(exceedsMapRenderCap([...svc, ...deps], edges)).toBe(false);
    expect(exceedsMapRenderCap([...svc, ...deps], edges, false)).toBe(true);
  });
});

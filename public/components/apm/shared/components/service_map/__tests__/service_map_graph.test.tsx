/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '@testing-library/react';

// Count CelestialMap mounts: a remount on refetch is what caused the flicker.
const mockCelestialMount = jest.fn();
const mockCelestialProps = jest.fn();
jest.mock('@osd/apm-topology', () => {
  const ReactActual = jest.requireActual('react');
  return {
    CelestialMap: (props: unknown) => {
      mockCelestialProps(props);
      ReactActual.useEffect(() => {
        mockCelestialMount();
      }, []);
      return <div data-test-subj="stubCelestialMap" />;
    },
    getIcon: () => 'icon',
  };
});

import { ServiceMapGraph, ServiceMapGraphProps } from '../service_map_graph';
import { ServiceMapNode } from '../../../../common/types/service_map_types';

const node: ServiceMapNode = {
  NodeId: 'checkout',
  Name: 'checkout',
  Type: 'Service',
  KeyAttributes: { Environment: 'generic:default', Name: 'checkout', Type: 'Service' },
  AttributeMaps: [],
  GroupByAttributes: {},
  StatisticReferences: {},
  AggregatedNodeId: null,
};

const baseProps: ServiceMapGraphProps = {
  nodes: [node],
  edges: [],
  metricsMap: new Map(),
  filters: {
    faultRateThresholds: [],
    errorRateThresholds: [],
    environments: [],
    searchQuery: '',
    groupBy: null,
  },
  navigationState: {
    level: 'application',
    breadcrumbs: [],
    groupByAttribute: null,
    groupByValue: null,
  },
  onNavigationStateChange: jest.fn(),
  onNodeClick: jest.fn(),
  isLoading: false,
};

describe('ServiceMapGraph loading states', () => {
  beforeEach(() => {
    mockCelestialMount.mockClear();
  });

  it('shows the full spinner on the initial load (nothing to draw yet)', () => {
    const { container, queryByTestId } = render(
      <ServiceMapGraph {...baseProps} nodes={[]} isLoading={true} />
    );

    expect(container.querySelector('.euiLoadingSpinner')).toBeInTheDocument();
    expect(queryByTestId('stubCelestialMap')).not.toBeInTheDocument();
  });

  it('keeps the map mounted and shows a progress bar while refetching', () => {
    const { rerender, getByTestId, queryByTestId, container } = render(
      <ServiceMapGraph {...baseProps} />
    );
    expect(mockCelestialMount).toHaveBeenCalledTimes(1);
    expect(queryByTestId('serviceMapRefetchProgress')).not.toBeInTheDocument();

    // Time range changed → refetch with the previous nodes still in hand.
    rerender(<ServiceMapGraph {...baseProps} isLoading={true} />);
    expect(getByTestId('stubCelestialMap')).toBeInTheDocument();
    expect(getByTestId('serviceMapRefetchProgress')).toBeInTheDocument();
    expect(container.querySelector('.euiLoadingSpinner')).not.toBeInTheDocument();

    // New data lands → still the same map instance, progress bar gone.
    rerender(<ServiceMapGraph {...baseProps} nodes={[{ ...node }]} isLoading={false} />);
    expect(queryByTestId('serviceMapRefetchProgress')).not.toBeInTheDocument();
    expect(mockCelestialMount).toHaveBeenCalledTimes(1);
  });
});

describe('ServiceMapGraph dependency stacks on large maps', () => {
  const svc = (name: string): ServiceMapNode => ({
    ...node,
    NodeId: name,
    Name: name,
    KeyAttributes: { Environment: 'generic:default', Name: name, Type: 'Service' },
  });
  const db = (name: string): ServiceMapNode => ({
    ...svc(name),
    KeyAttributes: { Environment: 'generic:default', Name: name, Type: 'database' },
  });
  const edge = (s: string, t: string) => ({
    EdgeId: `${s}->${t}`,
    SourceNodeId: s,
    DestinationNodeId: t,
    StatisticReferences: {},
  });
  // `services` services in a chain, plus 10 databases all called only by svc-0.
  const map = (services: number) => {
    const nodes = [...Array(services)].map((_, i) => svc(`svc-${i}`));
    const dbs = [...Array(10)].map((_, i) => db(`pg-${i}`));
    const edges = [
      ...nodes.slice(1).map((n, i) => edge(`svc-${i}`, n.NodeId)),
      ...dbs.map((d) => edge('svc-0', d.NodeId)),
    ];
    return { nodes: [...nodes, ...dbs], edges } as Pick<ServiceMapGraphProps, 'nodes' | 'edges'>;
  };
  const servicesView = { ...baseProps.navigationState, level: 'services' as const };
  const lastMapNodes = () => {
    const calls = mockCelestialProps.mock.calls;
    return (calls[calls.length - 1][0] as { map: { root: { nodes: any[] } } }).map.root.nodes;
  };

  beforeEach(() => mockCelestialProps.mockClear());

  it('folds dependencies with the same neighbors into one stack above 150 nodes, with a notice', () => {
    const onShow = jest.fn();
    const { getByTestId } = render(
      <ServiceMapGraph
        {...baseProps}
        {...map(150)}
        navigationState={servicesView}
        onShowDependenciesIndividually={onShow}
      />
    );
    const stacked = lastMapNodes().filter((n) => n.data.aggregatedNodeId);
    expect(stacked).toHaveLength(10);
    expect(new Set(stacked.map((n) => n.data.aggregatedNodeId)).size).toBe(1);
    expect(getByTestId('dependencyStacksNotice')).toHaveTextContent('10 dependencies');
    expect(getByTestId('dependencyStacksNotice')).toHaveTextContent('1 stacks');
    getByTestId('showDependenciesIndividually').click();
    expect(onShow).toHaveBeenCalled();
  });

  it('leaves maps at or below 150 nodes, and an opted-out map, unstacked', () => {
    const small = render(
      <ServiceMapGraph {...baseProps} {...map(140)} navigationState={servicesView} />
    );
    expect(lastMapNodes().some((n) => n.data.aggregatedNodeId)).toBe(false);
    expect(small.queryByTestId('dependencyStacksNotice')).toBeNull();
    small.unmount();

    const optedOut = render(
      <ServiceMapGraph
        {...baseProps}
        {...map(150)}
        navigationState={servicesView}
        stackDependencies={false}
      />
    );
    expect(lastMapNodes().some((n) => n.data.aggregatedNodeId)).toBe(false);
    expect(optedOut.queryByTestId('dependencyStacksNotice')).toBeNull();
  });

  it('never stacks the selected node', () => {
    render(
      <ServiceMapGraph
        {...baseProps}
        {...map(150)}
        navigationState={servicesView}
        selectedNodeId="pg-3"
      />
    );
    const selected = lastMapNodes().find((n) => n.id === 'pg-3');
    expect(selected.data.aggregatedNodeId).toBeUndefined();
    expect(lastMapNodes().filter((n) => n.data.aggregatedNodeId)).toHaveLength(9);
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, act } from '@testing-library/react';

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
import { ServiceMapNode, ServiceMapNodeMetrics } from '../../../../common/types/service_map_types';
import { ErrorRateThreshold } from '../../../../common/constants';

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

describe('ServiceMapGraph per-node metrics loading', () => {
  const servicesLevel = {
    ...baseProps.navigationState,
    level: 'services' as const,
    breadcrumbs: [{ id: 'services', label: 'Services' }],
  };
  const other: ServiceMapNode = {
    ...node,
    NodeId: 'cart',
    Name: 'cart',
    KeyAttributes: { ...node.KeyAttributes, Name: 'cart' },
  };
  const iconsById = () => {
    const props = mockCelestialProps.mock.calls.slice(-1)[0][0];
    return Object.fromEntries(
      props.map.root.nodes.map((n: { id: string; data: { icon: unknown } }) => [n.id, n.data.icon])
    );
  };

  it('shows a spinner on nodes whose metrics are pending, the type icon on the rest', () => {
    render(
      <ServiceMapGraph
        {...baseProps}
        nodes={[node, other]}
        navigationState={servicesLevel}
        pendingNodeIds={new Set(['cart::generic:default'])}
      />
    );
    const icons = iconsById();
    expect(icons.checkout).toBe('icon');
    expect(icons.cart).not.toBe('icon');
    expect(render(<>{icons.cart}</>).getByTestId('serviceMapNodeMetricsLoading')).toBeTruthy();
  });

  it('shows a spinner on the application node until every node has loaded', () => {
    const { rerender } = render(
      <ServiceMapGraph {...baseProps} pendingNodeIds={new Set(['checkout::generic:default'])} />
    );
    expect(iconsById()['application-root']).not.toBe('icon');
    rerender(<ServiceMapGraph {...baseProps} pendingNodeIds={new Set()} />);
    expect(iconsById()['application-root']).toBe('icon');
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

describe('ServiceMapGraph on maps too large to draw whole', () => {
  const svc = (name: string, environment: string): ServiceMapNode => ({
    ...node,
    NodeId: name,
    Name: name,
    KeyAttributes: { Environment: environment, Name: name, Type: 'Service' },
  });
  // 600 services across 3 environments: above the 500-node cap, ~200 per environment.
  const envs = ['dev', 'stage', 'prod'];
  const large = [...Array(600)].map((_, i) => svc(`svc-${i}`, envs[i % 3]));
  const lastProps = () => mockCelestialProps.mock.calls.slice(-1)[0][0];

  beforeEach(() => mockCelestialProps.mockClear());

  it('drilling into the application opens the map grouped by environment', () => {
    const onFiltersChange = jest.fn();
    const onNavigationStateChange = jest.fn();
    render(
      <ServiceMapGraph
        {...baseProps}
        nodes={large}
        onFiltersChange={onFiltersChange}
        onNavigationStateChange={onNavigationStateChange}
      />
    );
    act(() => lastProps().addBreadcrumb('Application', { isGroup: true }));
    expect(onFiltersChange).toHaveBeenCalledWith({ ...baseProps.filters, groupBy: 'environment' });
    expect(onNavigationStateChange).not.toHaveBeenCalled();
  });

  it('drilling into a small application still opens the services view', () => {
    const onFiltersChange = jest.fn();
    const onNavigationStateChange = jest.fn();
    render(
      <ServiceMapGraph
        {...baseProps}
        onFiltersChange={onFiltersChange}
        onNavigationStateChange={onNavigationStateChange}
      />
    );
    act(() => lastProps().addBreadcrumb('Application', { isGroup: true }));
    expect(onFiltersChange).not.toHaveBeenCalled();
    expect(onNavigationStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'services' })
    );
  });

  it('groups by environment with a notice, and an environment opens its services', () => {
    const groupByEnv = {
      level: 'groupBy' as const,
      breadcrumbs: [{ id: 'groupBy', label: 'environment' }],
      groupByAttribute: 'environment',
      groupByValue: null,
    };
    const { getByTestId, rerender } = render(
      <ServiceMapGraph
        {...baseProps}
        nodes={large}
        filters={{ ...baseProps.filters, groupBy: 'environment' }}
        navigationState={groupByEnv}
      />
    );
    const groups = lastProps().map.root.nodes;
    expect(groups.map((n: { id: string }) => n.id).sort()).toEqual([
      'group-dev',
      'group-prod',
      'group-stage',
    ]);
    expect(groups[0].data.numberOfServices).toBe('200');
    expect(getByTestId('largeMapGroupedNotice')).toHaveTextContent(
      'This map has 600 nodes, too many to draw at once (the limit is 500)'
    );

    rerender(
      <ServiceMapGraph
        {...baseProps}
        nodes={large}
        filters={{ ...baseProps.filters, groupBy: 'environment' }}
        navigationState={{ ...groupByEnv, level: 'groupByValue', groupByValue: 'dev' }}
      />
    );
    expect(lastProps().map.root.nodes).toHaveLength(200);
  });

  it('the too-many notice offers grouping by environment', () => {
    const onFiltersChange = jest.fn();
    const { getByTestId } = render(
      <ServiceMapGraph
        {...baseProps}
        nodes={large}
        navigationState={{ ...baseProps.navigationState, level: 'services' }}
        onFiltersChange={onFiltersChange}
      />
    );
    getByTestId('serviceMapGroupByEnvironment').click();
    expect(onFiltersChange).toHaveBeenCalledWith({ ...baseProps.filters, groupBy: 'environment' });
  });
});

describe('ServiceMapGraph map notices', () => {
  it('places the dependency-stacks notice clear of the breadcrumb and lets it be dismissed', () => {
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
    const services = [...Array(150)].map((_, i) => svc(`svc-${i}`));
    const dbs = [...Array(10)].map((_, i) => db(`pg-${i}`));
    const edges = dbs.map((d) => ({
      EdgeId: `svc-0->${d.NodeId}`,
      SourceNodeId: 'svc-0',
      DestinationNodeId: d.NodeId,
      StatisticReferences: {},
    }));
    const { getByTestId, queryByTestId } = render(
      <ServiceMapGraph
        {...baseProps}
        nodes={[...services, ...dbs]}
        edges={edges}
        navigationState={{ ...baseProps.navigationState, level: 'services' }}
      />
    );
    const notice = getByTestId('dependencyStacksNotice');
    // Notices sit at the bottom of the map, clear of the breadcrumb at the top.
    expect(getByTestId('serviceMapNotices').style.bottom).toBe('8px');
    expect(getByTestId('serviceMapNotices').contains(notice)).toBe(true);
    act(() => (notice.querySelector('button[aria-label]') as HTMLButtonElement).click());
    expect(queryByTestId('dependencyStacksNotice')).toBeNull();
  });
});

describe('ServiceMapGraph filters that match nothing', () => {
  const servicesLevel = { ...baseProps.navigationState, level: 'services' as const };
  const healthy = new Map([
    [
      'checkout::generic:default',
      { totalRequests: 100, totalErrors: 0, totalFaults: 0 } as ServiceMapNodeMetrics,
    ],
  ]);
  const lastProps = () => mockCelestialProps.mock.calls.slice(-1)[0][0];

  it('fades every node and says so, instead of looking unfiltered', () => {
    const { getByTestId } = render(
      <ServiceMapGraph
        {...baseProps}
        navigationState={servicesLevel}
        metricsMap={healthy}
        filters={{ ...baseProps.filters, errorRateThresholds: [ErrorRateThreshold.HIGH] }}
      />
    );
    const focus = lastProps().nodesInFocus;
    expect(focus).toHaveLength(1);
    expect(focus[0].id).not.toBe('checkout');
    expect(getByTestId('serviceMapNoFilterMatches')).toBeInTheDocument();
  });

  it('focuses the matching nodes when there are some', () => {
    const { queryByTestId } = render(
      <ServiceMapGraph
        {...baseProps}
        navigationState={servicesLevel}
        metricsMap={healthy}
        filters={{ ...baseProps.filters, errorRateThresholds: [ErrorRateThreshold.LOW] }}
      />
    );
    expect(lastProps().nodesInFocus.map((n: { id: string }) => n.id)).toEqual(['checkout']);
    expect(queryByTestId('serviceMapNoFilterMatches')).toBeNull();
  });
});

describe('ServiceMapGraph notices slot', () => {
  it('renders its notices into the given container (above the map) instead of over the map', () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    render(
      <ServiceMapGraph
        {...baseProps}
        navigationState={{ ...baseProps.navigationState, level: 'services' }}
        metricsMap={
          new Map([
            [
              'checkout::generic:default',
              { totalRequests: 100, totalErrors: 0, totalFaults: 0 } as ServiceMapNodeMetrics,
            ],
          ])
        }
        filters={{ ...baseProps.filters, errorRateThresholds: [ErrorRateThreshold.HIGH] }}
        noticesContainer={slot}
      />
    );
    expect(slot.querySelector('[data-test-subj="serviceMapNoFilterMatches"]')).not.toBeNull();
    expect(
      slot.querySelector('[data-test-subj="serviceMapNotices"]')?.getAttribute('style')
    ).toBeNull();
    slot.remove();
  });
});

describe('ServiceMapGraph fitAll', () => {
  const lastProps = () => mockCelestialProps.mock.calls.slice(-1)[0][0];
  it('lets a focused view zoom out to fit everything and re-fit on resize', () => {
    const servicesLevel = { ...baseProps.navigationState, level: 'services' as const };
    const { rerender } = render(<ServiceMapGraph {...baseProps} navigationState={servicesLevel} />);
    expect(lastProps().fitViewOptions).toBeUndefined();
    expect(lastProps().refitOnResize).toBe(false);
    rerender(<ServiceMapGraph {...baseProps} navigationState={servicesLevel} fitAll />);
    expect(lastProps().fitViewOptions.minZoom).toBeLessThan(0.6);
    expect(lastProps().refitOnResize).toBe(true);
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '@testing-library/react';

// Count CelestialMap mounts: a remount on refetch is what caused the flicker.
const mockCelestialMount = jest.fn();
jest.mock('@osd/apm-topology', () => {
  const ReactActual = jest.requireActual('react');
  return {
    CelestialMap: () => {
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

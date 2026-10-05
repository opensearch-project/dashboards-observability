/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, act, screen } from '@testing-library/react';
import { ApplicationMapPage } from '../application_map_page';
import { APM_INCLUDE_DEPENDENCIES_STORAGE_KEY } from '../../../common/constants';

const node = (name: string, type: string) => ({
  NodeId: name,
  Name: name,
  Type: 'AWS::CloudWatch::Service',
  KeyAttributes: { Environment: 'generic:default', Name: name, Type: type },
  AttributeMaps: [],
  GroupByAttributes: {},
  StatisticReferences: {},
  AggregatedNodeId: null,
});
const mockMap = {
  nodes: [node('checkout', 'service'), node('postgresql', 'database')],
  edges: [
    {
      EdgeId: 'e1',
      SourceNodeId: 'checkout',
      DestinationNodeId: 'postgresql',
      StatisticReferences: {},
    },
  ],
};

jest.mock('../../../shared/hooks/use_persistent_time_range', () => ({
  usePersistentTimeRange: (fallback: unknown) => [fallback, jest.fn()],
}));
jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: () => ({
    config: { prometheusDataSource: { name: 'prom' }, serviceMapDataset: { id: 'm', title: 'm' } },
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));
jest.mock('../../../shared/hooks/use_service_map', () => ({
  useServiceMap: jest.fn(() => ({
    nodes: mockMap.nodes,
    edges: mockMap.edges,
    isLoading: false,
    error: null,
    availableGroupByAttributes: {},
    truncated: false,
  })),
}));
jest.mock('../../../shared/hooks/use_service_map_metrics', () => ({
  useServiceMapMetrics: () => ({ metrics: new Map(), isLoading: false, refetch: jest.fn() }),
}));
jest.mock('../../../shared/hooks/use_selected_edge_metrics', () => ({
  useSelectedEdgeMetrics: () => ({ metrics: null, isLoading: false }),
}));
jest.mock('../../../shared/hooks/use_group_metrics', () => ({
  useGroupMetrics: () => ({ metrics: null, isLoading: false }),
}));
jest.mock('../../../../../../../../src/plugins/opensearch_dashboards_utils/public', () => ({
  useOpenOnUrlMarker: jest.fn(),
}));
jest.mock('../../../common/apm_empty_state', () => ({ ApmEmptyState: () => null }));
jest.mock('../../../config/apm_settings_modal', () => ({ ApmSettingsModal: () => null }));
const mockSidebar = jest.fn();
const mockGraph = jest.fn();
jest.mock('../../../shared/components/service_map', () => ({
  ServiceMapSidebar: (props: unknown) => {
    mockSidebar(props);
    return null;
  },
  ServiceMapGraph: (props: unknown) => {
    mockGraph(props);
    return null;
  },
  ServiceDetailsPanel: () => null,
  EdgeMetricsFlyout: () => null,
}));
jest.mock('../../../shared/components/service_correlations_flyout', () => ({
  ServiceCorrelationsFlyout: () => null,
}));
jest.mock('../../../shared/components/active_filter_badges', () => ({
  ActiveFilterBadges: (props: { filters: Array<{ key: string }>; onClearAll: () => void }) => (
    <div data-test-subj="badges">
      {props.filters.map((f) => f.key).join(',')}
      <button data-test-subj="clearAll" onClick={props.onClearAll} />
    </div>
  ),
}));

const props = {
  chrome: { setBreadcrumbs: jest.fn() } as any,
  notifications: { toasts: { addDanger: jest.fn() } } as any,
};
const last = (mock: jest.Mock) => mock.mock.calls[mock.mock.calls.length - 1][0];

describe('ApplicationMapPage "Include external dependencies"', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    window.history.replaceState(null, '', '#/application-map');
  });

  it('includes dependencies by default and offers the checkbox when the map has them', () => {
    render(<ApplicationMapPage {...props} />);
    expect(last(mockSidebar).dependencies.included).toBe(true);
    expect(last(mockGraph).nodes.map((n: { NodeId: string }) => n.NodeId)).toEqual([
      'checkout',
      'postgresql',
    ]);
  });

  it('hides dependency nodes and their edges, keeps the choice in sessionStorage, shows a badge', () => {
    render(<ApplicationMapPage {...props} />);
    act(() => last(mockSidebar).dependencies.onChange(false));

    expect(last(mockGraph).nodes.map((n: { NodeId: string }) => n.NodeId)).toEqual(['checkout']);
    expect(last(mockGraph).edges).toEqual([]);
    expect(sessionStorage.getItem(APM_INCLUDE_DEPENDENCIES_STORAGE_KEY)).toBe('false');
    expect(screen.getByTestId('badges')).toHaveTextContent('dependencies');

    // Clear all filters brings them back.
    act(() => screen.getByTestId('clearAll').click());
    expect(last(mockGraph).nodes).toHaveLength(2);
    expect(sessionStorage.getItem(APM_INCLUDE_DEPENDENCIES_STORAGE_KEY)).toBe('true');
  });

  it('restores the choice from sessionStorage', () => {
    sessionStorage.setItem(APM_INCLUDE_DEPENDENCIES_STORAGE_KEY, 'false');
    render(<ApplicationMapPage {...props} />);
    expect(last(mockSidebar).dependencies.included).toBe(false);
    expect(last(mockGraph).nodes).toHaveLength(1);
  });

  it('turns stacking off for the page when the notice asks to show dependencies individually', () => {
    render(<ApplicationMapPage {...props} />);
    expect(last(mockGraph).stackDependencies).toBe(true);
    act(() => last(mockGraph).onShowDependenciesIndividually());
    expect(last(mockGraph).stackDependencies).toBe(false);
  });
});

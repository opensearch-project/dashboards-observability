/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, act, screen, fireEvent, within } from '@testing-library/react';
import { ApplicationMapPage } from '../application_map_page';
import { APM_INCLUDE_DEPENDENCIES_STORAGE_KEY } from '../../../common/constants';

const node = (name: string, type: string, environment = 'generic:default') => ({
  NodeId: name,
  Name: name,
  Type: 'AWS::CloudWatch::Service',
  KeyAttributes: { Environment: environment, Name: name, Type: type },
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

// A stable setter, like the real hook's: the page's URL-param effect depends on it.
const mockSetTimeRange = jest.fn();
jest.mock('../../../shared/hooks/use_persistent_time_range', () => ({
  usePersistentTimeRange: (fallback: unknown) => [fallback, mockSetTimeRange],
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
const mockGroupTotalsHook = jest.fn();
jest.mock('../../../shared/hooks/use_map_group_totals', () => ({
  ALL_GROUPS_KEY: '__all__',
  useMapGroupTotals: (params: unknown) => {
    mockGroupTotalsHook(params);
    return { totals: null, isLoading: false, failed: false, error: null, retry: jest.fn() };
  },
}));
const mockMetricsHook = jest.fn();
const mockFailedNodeIds: { current: Set<string> } = { current: new Set() };
const mockRetryFailed = jest.fn();
jest.mock('../../../shared/hooks/use_service_map_metrics', () => ({
  useServiceMapMetrics: (params: unknown) => {
    mockMetricsHook(params);
    return {
      metricsMap: new Map(),
      pendingNodeIds: new Set(),
      failedNodeIds: mockFailedNodeIds.current,
      retryFailed: mockRetryFailed,
      isLoading: false,
      refetch: jest.fn(),
    };
  },
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
const mockExceedsCap = jest.fn(() => false);
jest.mock('../../../shared/utils/map_grouping', () => ({
  ...jest.requireActual('../../../shared/utils/map_grouping'),
  exceedsMapRenderCap: () => mockExceedsCap(),
}));
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
// Focus mode shows the focus bar; the service search (in the page header) shows the service.
const isFocused = () => !!screen.queryByTestId('mapFocusBar');
const searchText = () => screen.getByTestId('mapServiceSearch').textContent;
const clearSearch = () =>
  act(() =>
    within(screen.getByTestId('mapServiceSearch')).getByTestId('comboBoxClearButton').click()
  );
const exitFocus = () => act(() => screen.getByTestId('mapFocusExit').click());

describe('ApplicationMapPage "Include external dependencies"', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    window.history.replaceState(null, '', '#/application-map');
  });

  const metricNames = () =>
    last(mockMetricsHook).services.map((s: { serviceName: string }) => s.serviceName);
  const openServices = () =>
    act(() =>
      last(mockGraph).onNavigationStateChange({
        level: 'services',
        breadcrumbs: [],
        groupByAttribute: null,
        groupByValue: null,
      })
    );

  it('at the Application level fetches only the totals, no per-node metrics', () => {
    render(<ApplicationMapPage {...props} />);
    expect(metricNames()).toEqual([]);
    expect(last(mockGroupTotalsHook)).toEqual(
      expect.objectContaining({ groupBy: null, enabled: true })
    );
    openServices();
    expect(metricNames()).toEqual(['checkout']);
    expect(last(mockGroupTotalsHook).enabled).toBe(false);
  });

  it('hides dependencies by default, offers the checkbox, and does not query their metrics', () => {
    render(<ApplicationMapPage {...props} />);
    openServices();
    expect(last(mockSidebar).dependencies.included).toBe(false);
    expect(last(mockGraph).nodes.map((n: { NodeId: string }) => n.NodeId)).toEqual(['checkout']);
    expect(last(mockGraph).edges).toEqual([]);
    expect(metricNames()).toEqual(['checkout']);
    // Hidden is the default, so no filter badge for it.
    expect(screen.queryByTestId('badges')).toBeNull();
  });

  it('shows dependency nodes, their edges and metrics when included, and keeps the choice', () => {
    render(<ApplicationMapPage {...props} />);
    openServices();
    act(() => last(mockSidebar).dependencies.onChange(true));

    expect(last(mockGraph).nodes.map((n: { NodeId: string }) => n.NodeId)).toEqual([
      'checkout',
      'postgresql',
    ]);
    expect(last(mockGraph).edges).toHaveLength(1);
    expect(metricNames()).toEqual(['checkout', 'postgresql']);
    expect(sessionStorage.getItem(APM_INCLUDE_DEPENDENCIES_STORAGE_KEY)).toBe('true');
  });

  it('restores the choice from sessionStorage', () => {
    sessionStorage.setItem(APM_INCLUDE_DEPENDENCIES_STORAGE_KEY, 'true');
    render(<ApplicationMapPage {...props} />);
    expect(last(mockSidebar).dependencies.included).toBe(true);
    expect(last(mockGraph).nodes).toHaveLength(2);
  });

  it('turns stacking off for the page when the notice asks to show dependencies individually', () => {
    render(<ApplicationMapPage {...props} />);
    expect(last(mockGraph).stackDependencies).toBe(true);
    act(() => last(mockGraph).onShowDependenciesIndividually());
    expect(last(mockGraph).stackDependencies).toBe(false);
  });
});

describe('ApplicationMapPage deep link into a large map', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });
  afterEach(() => mockExceedsCap.mockReturnValue(false));

  it("opens the linked service's environment, grouped by environment, with the service selected", () => {
    mockExceedsCap.mockReturnValue(true);
    window.history.replaceState(
      null,
      '',
      '#/application-map?service=checkout&environment=generic:default'
    );
    render(<ApplicationMapPage {...props} />);

    // Opens focused on the service; leaving focus lands on its environment group.
    expect(isFocused()).toBe(true);
    expect(searchText()).toContain('checkout');
    exitFocus();

    expect(last(mockGraph).filters.groupBy).toBe('environment');
    expect(last(mockGraph).filters.environments).toEqual(['generic:default']);
    expect(last(mockGraph).navigationState).toEqual(
      expect.objectContaining({
        level: 'groupByValue',
        groupByAttribute: 'environment',
        groupByValue: 'generic:default',
      })
    );
    expect(last(mockGraph).selectedNodeId).toBe('checkout');
  });

  it('keeps the services view for a deep link into a map that fits', () => {
    window.history.replaceState(null, '', '#/application-map?service=checkout');
    render(<ApplicationMapPage {...props} />);
    exitFocus();
    expect(last(mockGraph).filters.groupBy).toBeNull();
    expect(last(mockGraph).navigationState.level).toBe('services');
  });
});

describe('ApplicationMapPage focus mode with dependencies hidden', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    window.history.replaceState(null, '', '#/application-map');
  });

  it("still shows the focused service's dependencies", () => {
    render(<ApplicationMapPage {...props} />);
    act(() => last(mockGraph).onNodeClick('checkout', 'checkout', 'generic:default'));
    expect(
      last(mockGraph)
        .nodes.map((n: { NodeId: string }) => n.NodeId)
        .sort()
    ).toEqual(['checkout', 'postgresql']);
    expect(
      last(mockMetricsHook).services.map((x: { serviceName: string }) => x.serviceName)
    ).toContain('postgresql');
  });
});

describe('ApplicationMapPage focus mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.setItem(APM_INCLUDE_DEPENDENCIES_STORAGE_KEY, 'true');
    window.history.replaceState(null, '', '#/application-map');
  });
  afterEach(() => sessionStorage.clear());

  it('clicking a service shows only its neighborhood; clearing the search restores the view', () => {
    render(<ApplicationMapPage {...props} />);
    const before = last(mockGraph).navigationState;
    act(() => last(mockGraph).onNodeClick('postgresql', 'postgresql', 'generic:default'));

    expect(isFocused()).toBe(true);
    expect(searchText()).toContain('postgresql');
    expect(screen.getByTestId('mapFocusBar')).toHaveTextContent(
      'Focused on postgresql in generic:default and its 1 connected node'
    );
    expect(
      last(mockGraph)
        .nodes.map((n: { NodeId: string }) => n.NodeId)
        .sort()
    ).toEqual(['checkout', 'postgresql']);
    expect(last(mockGraph).navigationState.level).toBe('services');
    // The neighborhood is fitted, not zoomed onto the one selected card.
    expect(last(mockGraph).selectedNodeId).toBeUndefined();

    clearSearch();
    expect(isFocused()).toBe(false);
    expect(last(mockGraph).navigationState).toEqual(before);
    expect(last(mockGraph).selectedNodeId).toBeUndefined();
  });

  it('Back lands on the view containing the service, keeping it selected until cleared', () => {
    render(<ApplicationMapPage {...props} />);
    act(() => last(mockGraph).onNodeClick('postgresql', 'postgresql', 'generic:default'));
    exitFocus();

    expect(isFocused()).toBe(false);
    // From the Application level of a small map: the services view, centered on the service.
    expect(last(mockGraph).navigationState.level).toBe('services');
    expect(last(mockGraph).selectedNodeId).toBe('postgresql');
    expect(searchText()).toContain('postgresql');

    clearSearch();
    expect(last(mockGraph).selectedNodeId).toBeUndefined();
  });

  it("Back while grouped opens the service's group", () => {
    render(<ApplicationMapPage {...props} />);
    act(() =>
      last(mockSidebar).onFiltersChange({ ...last(mockSidebar).filters, groupBy: 'environment' })
    );
    act(() => last(mockGraph).onNodeClick('checkout', 'checkout', 'generic:default'));
    exitFocus();
    expect(last(mockGraph).navigationState).toEqual(
      expect.objectContaining({ level: 'groupByValue', groupByValue: 'generic:default' })
    );
    expect(last(mockGraph).filters.environments).toEqual(['generic:default']);
    expect(last(mockGraph).selectedNodeId).toBe('checkout');
  });

  it('map navigation (breadcrumbs, drill-down) leaves focus mode', () => {
    render(<ApplicationMapPage {...props} />);
    act(() => last(mockGraph).onNodeClick('checkout', 'checkout', 'generic:default'));
    expect(isFocused()).toBe(true);
    act(() =>
      last(mockGraph).onNavigationStateChange({
        level: 'application',
        breadcrumbs: [],
        groupByAttribute: null,
        groupByValue: null,
      })
    );
    expect(isFocused()).toBe(false);
  });

  it('picking a service in the search focuses it, like clicking it', () => {
    render(<ApplicationMapPage {...props} />);
    const search = screen.getByTestId('mapServiceSearch');
    fireEvent.change(within(search).getByTestId('comboBoxSearchInput'), {
      target: { value: 'postg' },
    });
    // Options are grouped under their environment.
    expect(document.querySelector('.euiComboBoxTitle')).toHaveTextContent('generic:default');
    fireEvent.click(screen.getByRole('option', { name: 'postgresql' }));

    expect(isFocused()).toBe(true);
    // The selection carries its environment (it is outside the group headers).
    expect(searchText()).toContain('postgresql (generic:default)');
    expect(
      last(mockGraph)
        .nodes.map((n: { NodeId: string }) => n.NodeId)
        .sort()
    ).toEqual(['checkout', 'postgresql']);
  });
});

describe('ApplicationMapPage environment grouping and the Environment filter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    window.history.replaceState(null, '', '#/application-map');
  });

  const groupByEnvironment = () =>
    act(() =>
      last(mockSidebar).onFiltersChange({ ...last(mockSidebar).filters, groupBy: 'environment' })
    );

  it('opening an environment checks it, and going back clears it', () => {
    render(<ApplicationMapPage {...props} />);
    groupByEnvironment();
    act(() =>
      last(mockGraph).onNavigationStateChange({
        level: 'groupByValue',
        breadcrumbs: [],
        groupByAttribute: 'environment',
        groupByValue: 'generic:default',
      })
    );
    expect(last(mockSidebar).filters.environments).toEqual(['generic:default']);

    act(() =>
      last(mockGraph).onNavigationStateChange({
        level: 'groupBy',
        breadcrumbs: [],
        groupByAttribute: 'environment',
        groupByValue: null,
      })
    );
    expect(last(mockSidebar).filters.environments).toEqual([]);
  });

  it('checking an environment opens it; clearing returns to the environment groups', () => {
    render(<ApplicationMapPage {...props} />);
    groupByEnvironment();
    act(() =>
      last(mockSidebar).onFiltersChange({
        ...last(mockSidebar).filters,
        environments: ['generic:default'],
      })
    );
    expect(last(mockGraph).navigationState).toEqual(
      expect.objectContaining({ level: 'groupByValue', groupByValue: 'generic:default' })
    );

    act(() =>
      last(mockSidebar).onFiltersChange({ ...last(mockSidebar).filters, environments: [] })
    );
    expect(last(mockGraph).navigationState.level).toBe('groupBy');
  });
});

describe('ApplicationMapPage service search scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.setItem(APM_INCLUDE_DEPENDENCIES_STORAGE_KEY, 'true');
    window.history.replaceState(null, '', '#/application-map');
  });
  afterEach(() => {
    sessionStorage.clear();
    mockMap.nodes.pop();
  });

  const openList = () => {
    const toggle = within(screen.getByTestId('mapServiceSearch')).getByTestId(
      'comboBoxToggleListButton'
    );
    // Close (if open) and reopen, so the list reflects the current options.
    if (document.querySelector('.euiComboBoxTitle')) fireEvent.click(toggle);
    fireEvent.click(toggle);
  };
  const listedGroups = () =>
    Array.from(document.querySelectorAll('.euiComboBoxTitle')).map((t) => t.textContent);

  it('lists every environment regardless of the Environment filter', () => {
    mockMap.nodes.push(node('billing', 'service', 'dev'));
    render(<ApplicationMapPage {...props} />);
    openList();
    expect(listedGroups()).toEqual(['dev', 'generic:default']);

    act(() =>
      last(mockSidebar).onFiltersChange({ ...last(mockSidebar).filters, environments: ['dev'] })
    );
    openList();
    expect(listedGroups()).toEqual(['dev', 'generic:default']);
    expect(screen.getByRole('option', { name: 'checkout' })).toBeInTheDocument();
  });
});

describe('ApplicationMapPage review fixes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.setItem(APM_INCLUDE_DEPENDENCIES_STORAGE_KEY, 'true');
    window.history.replaceState(null, '', '#/application-map');
  });
  afterEach(() => {
    sessionStorage.clear();
    mockFailedNodeIds.current = new Set();
    mockExceedsCap.mockReturnValue(false);
  });

  it('focus ignores the Environment filter (cross-environment neighbors are not faded) and restores it on exit', () => {
    render(<ApplicationMapPage {...props} />);
    act(() =>
      last(mockSidebar).onFiltersChange({ ...last(mockSidebar).filters, environments: ['dev'] })
    );
    act(() => last(mockGraph).onNodeClick('checkout', 'checkout', 'generic:default'));
    expect(last(mockGraph).filters.environments).toEqual([]);
    expect(last(mockSidebar).filters.environments).toEqual(['dev']);

    act(() => screen.getByTestId('mapFocusExit').click());
    expect(last(mockGraph).filters.environments).toEqual(['dev']);
  });

  it('says when node metrics failed, and Retry re-fetches them', () => {
    mockFailedNodeIds.current = new Set(['checkout::generic:default']);
    render(<ApplicationMapPage {...props} />);
    expect(screen.getByTestId('mapMetricsFailedCallout')).toHaveTextContent('1 node shows');
    expect(last(mockGraph).failedNodeIds).toEqual(new Set(['checkout::generic:default']));
    act(() => screen.getByTestId('mapMetricsRetry').click());
    expect(mockRetryFailed).toHaveBeenCalled();
  });

  it('fetches no node metrics for an opened group that is too large to draw', () => {
    render(<ApplicationMapPage {...props} />);
    act(() =>
      last(mockSidebar).onFiltersChange({ ...last(mockSidebar).filters, groupBy: 'environment' })
    );
    mockExceedsCap.mockReturnValue(true);
    act(() =>
      last(mockGraph).onNavigationStateChange({
        level: 'groupByValue',
        breadcrumbs: [],
        groupByAttribute: 'environment',
        groupByValue: 'generic:default',
      })
    );
    expect(last(mockMetricsHook).services).toEqual([]);
  });

  it('offers hiding dependencies to the graph only while they are shown', () => {
    render(<ApplicationMapPage {...props} />);
    expect(typeof last(mockGraph).onHideDependencies).toBe('function');
    act(() => last(mockGraph).onHideDependencies());
    expect(last(mockSidebar).dependencies.included).toBe(false);
    expect(last(mockGraph).onHideDependencies).toBeUndefined();
  });
});

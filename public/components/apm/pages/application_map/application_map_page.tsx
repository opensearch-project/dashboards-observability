/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo, useEffect, useReducer } from 'react';
import {
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentBody,
  EuiSpacer,
  EuiCallOut,
  EuiResizableContainer,
  EuiButtonEmpty,
  EuiLoadingSpinner,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButtonGroup,
  EuiComboBox,
  EuiPanel,
  EuiText,
} from '@elastic/eui';
import { ChromeStart, NotificationsStart } from '../../../../../../../src/core/public';
import { useOpenOnUrlMarker } from '../../../../../../../src/plugins/opensearch_dashboards_utils/public';
import { useApmConfig } from '../../config/apm_config_context';
import { ApmSettingsModal } from '../../config/apm_settings_modal';
import { ApmEmptyState } from '../../common/apm_empty_state';
import { HeaderControlledComponentsWrapper } from '../../../../plugin_helpers/plugin_headerControl';
import { ApmPageHeader } from '../../shared/components/apm_page_header';
import { ActiveFilterBadges, FilterBadge } from '../../shared/components/active_filter_badges';
import { useServiceMap } from '../../shared/hooks/use_service_map';
import { filterFocusOptions } from '../../shared/utils/focus_search_options';
import {
  NEIGHBORHOOD_MAX_ROUNDS,
  useFocusNeighborhood,
  useServiceMapOverview,
  useServiceMapSlices,
} from '../../shared/hooks/use_service_map_slices';
import { ServiceMapSliceFilter } from '../../query_services/query_requests/ppl_queries';
import { useServiceMapMetrics } from '../../shared/hooks/use_service_map_metrics';
import { useSelectedEdgeMetrics } from '../../shared/hooks/use_selected_edge_metrics';
import { useGroupMetrics } from '../../shared/hooks/use_group_metrics';
import { parseTimeRange } from '../../shared/utils/time_utils';
import { usePersistentTimeRange } from '../../shared/hooks/use_persistent_time_range';
import { readUrlTimeRange, useTimeRangeUrlSync } from '../../shared/hooks/use_time_range_url_sync';
import { openServiceDetailsInNewTab } from '../../shared/utils/navigation_utils';
import {
  ServiceMapSidebar,
  ServiceMapGraph,
  ServiceDetailsPanel,
  EdgeMetricsFlyout,
} from '../../shared/components/service_map';
import {
  ApplicationMapFilters,
  MapNavigationState,
  ServiceMapEdge,
  ServiceMapNode,
  SelectedEdgeState,
} from '../../common/types/service_map_types';
import { TimeRange } from '../../common/types/service_types';
import {
  APM_INCLUDE_DEPENDENCIES_STORAGE_KEY,
  APPLICATION_MAP_CONSTANTS,
  THRESHOLD_LABELS,
  getEnvironmentDisplayName,
  getPlatformTypeFromEnvironment,
} from '../../common/constants';
import { removeDependencies } from '../../shared/utils/dependency_stacking';
import {
  ENVIRONMENT_GROUP_BY,
  exceedsMapRenderCap,
  getNodeGroupValue,
} from '../../shared/utils/map_grouping';
import { getNeighborhood } from '../../shared/utils/map_focus';
import { useMapGroupTotals } from '../../shared/hooks/use_map_group_totals';
import { ALL_GROUPS_KEY } from '../../common/constants';
import { ExitFocusTarget, INITIAL_MAP_VIEW_STATE, mapViewReducer } from './application_map_state';
import { isDependencyType } from '../../shared/utils/platform_utils';

/**
 * Whether the map shows dependency nodes; kept per tab (sessionStorage), default off. Large
 * deployments have far more dependencies (external hosts, databases, topics) than services, so
 * showing them by default overloaded both the layout and the metric queries.
 */
const readIncludeDependencies = (): boolean => {
  try {
    return sessionStorage.getItem(APM_INCLUDE_DEPENDENCIES_STORAGE_KEY) === 'true';
  } catch {
    // sessionStorage unavailable (e.g. privacy mode): default off.
    return false;
  }
};
import { applicationMapI18nTexts as i18nTexts } from './application_map_i18n';
import { LegacyBanner } from '../../shared/components/legacy_banner';
import { ServiceCorrelationsFlyout } from '../../shared/components/service_correlations_flyout';
import './application_map.scss';
import '../../shared/styles/apm_common.scss';

/**
 * URL parameter validation constants
 */
const URL_PARAM_VALIDATION = {
  /** Maximum allowed length for URL parameters */
  MAX_PARAM_LENGTH: 256,
  /** Allowed characters for service names (alphanumeric, dashes, underscores, dots, colons, slashes) */
  SERVICE_NAME_REGEX: /^[a-zA-Z0-9_\-:./ ]+$/,
};

/**
 * Sanitize a service/environment URL parameter to prevent XSS attacks. Time bounds are
 * validated by `readUrlTimeRange` (shared with the URL writer).
 * @param value - Raw URL parameter value
 * @returns Sanitized value or null if invalid
 */
function sanitizeUrlParam(value: string | null): string | null {
  if (!value) return null;

  // Check length limit
  if (value.length > URL_PARAM_VALIDATION.MAX_PARAM_LENGTH) {
    return null;
  }

  if (!URL_PARAM_VALIDATION.SERVICE_NAME_REGEX.test(value)) {
    return null;
  }

  return value;
}

/**
 * The Environment filter's id for a raw environment. The filter lists one id per display name
 * (the first raw environment seen with it, as availableEnvironments does), so e.g.
 * "eks:cluster2" maps to the "eks:cluster1" checkbox when both display as "eks".
 */
function environmentFilterId(nodes: ServiceMapNode[], environment: string): string {
  const display = getEnvironmentDisplayName(environment);
  return (
    nodes.find((n) => getEnvironmentDisplayName(n.KeyAttributes.Environment) === display)
      ?.KeyAttributes.Environment ?? environment
  );
}

const NO_EDGES: ServiceMapEdge[] = [];

/** Navigation state that renders the focused neighborhood as a plain graph. */
const FOCUS_NAVIGATION_STATE: MapNavigationState = {
  level: 'services',
  breadcrumbs: [],
  groupByAttribute: null,
  groupByValue: null,
};

const APPLICATION_MAP_HASH_PATH = '#/application-map';

/** The map app has no router: an empty hash (app root) or `#/application-map` is the map. */
const isApplicationMapPath = (hashPath: string) =>
  hashPath === '' ||
  hashPath === '#' ||
  hashPath === '#/' ||
  hashPath === APPLICATION_MAP_HASH_PATH ||
  hashPath.startsWith(`${APPLICATION_MAP_HASH_PATH}/`);

export interface ApplicationMapPageProps {
  chrome: ChromeStart;
  notifications: NotificationsStart;
  [key: string]: any;
}

/**
 * ApplicationMapPage - Main page for APM Topology Map
 *
 * Displays a service topology visualization using CelestialMap.
 * Supports hierarchical navigation (Application -> Services view).
 */
export const ApplicationMapPage: React.FC<ApplicationMapPageProps> = ({
  chrome,
  notifications,
}) => {
  const {
    config,
    loading: configLoading,
    error: configError,
    refresh: refreshConfig,
  } = useApmConfig();

  // Modal state
  const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false);

  // Shared, persisted time range (sessionStorage) so the map keeps the user's
  // selection instead of resetting to the default. A `from`/`to` deep link (see
  // the URL-param effect below) still overrides this on mount.
  const [timeRange, setTimeRange] = usePersistentTimeRange(
    APPLICATION_MAP_CONSTANTS.DEFAULT_TIME_RANGE
  );

  // Navigation, filters, focus and selection change together (see application_map_state).
  const [view, dispatch] = useReducer(mapViewReducer, INITIAL_MAP_VIEW_STATE);
  const { filters, navigation: navigationState, focus, selectedNode, selectedEdge } = view;

  // "Include external dependencies" (sessionStorage, like the time range) and, on a large map,
  // whether the user chose to see stacked dependencies individually (this page view only).
  const [includeDependencies, setIncludeDependenciesState] = useState(readIncludeDependencies);
  const setIncludeDependencies = useCallback((included: boolean) => {
    setIncludeDependenciesState(included);
    try {
      sessionStorage.setItem(APM_INCLUDE_DEPENDENCIES_STORAGE_KEY, String(included));
    } catch {
      // Not persisted when sessionStorage is unavailable.
    }
  }, []);
  const [showDependenciesIndividually, setShowDependenciesIndividually] = useState(false);

  // Refresh trigger
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Where the map renders its notices: above the map, with the page's other banners.
  const [mapNoticesEl, setMapNoticesEl] = useState<HTMLDivElement | null>(null);

  // State for pending node selection from URL params (auto-select after data loads)
  const [pendingNodeSelection, setPendingNodeSelection] = useState<{
    serviceName: string;
    environment: string;
  } | null>(null);

  // Set page-level breadcrumb
  useEffect(() => {
    chrome?.setBreadcrumbs([{ text: i18nTexts.breadcrumb, href: APPLICATION_MAP_HASH_PATH }]);
  }, [chrome]);

  // The side-nav "APM settings" popover action navigates here with an
  // `_apmSettings=true` hash marker (a popover action only has navigateToApp, so
  // it can't open the modal itself). useOpenOnUrlMarker opens the modal on the
  // marker and strips it (cooldown / replaceState handled in the hook).
  const openSettingsModal = useCallback(() => setIsSettingsModalVisible(true), []);
  useOpenOnUrlMarker('_apmSettings', openSettingsModal);

  // Parse URL parameters on mount to support deep-linking from Services Home
  useEffect(() => {
    const hashParts = window.location.hash.split('?');
    if (hashParts.length < 2) return;

    const params = new URLSearchParams(hashParts[1]);
    const serviceParam = sanitizeUrlParam(params.get('service'));
    const environmentParam = sanitizeUrlParam(params.get('environment'));
    // Time bounds share one validator with the URL writer, so every value the map writes
    // (including `now/d` from the "Today" quick select) reads back on reload.
    const urlTimeRange = readUrlTimeRange(params);

    // If service parameter exists and is valid, navigate to services level and queue node selection
    if (serviceParam) {
      dispatch({ type: 'urlService' });

      // Store pending selection - will be applied once nodes are loaded
      setPendingNodeSelection({
        serviceName: serviceParam,
        environment: environmentParam || 'generic:default',
      });
    }

    // Apply time range from URL if provided
    if (urlTimeRange) {
      setTimeRange(urlTimeRange);
    }
    // `setTimeRange` is stable (useCallback); listed to satisfy exhaustive-deps
    // without changing the mount-only intent.
  }, [setTimeRange]); // Run only on mount

  // Show toast when config fetch error occurs
  useEffect(() => {
    if (configError) {
      notifications.toasts.addDanger({
        title: 'Failed to load APM configuration',
        text: configError.message || 'An error occurred while loading the configuration.',
      });
    }
  }, [configError, notifications]);

  // Parse time range
  const parsedTimeRange = useMemo(
    () => parseTimeRange(timeRange),
    // Recalculate when refreshTrigger changes so relative ranges advance to `now`
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timeRange, refreshTrigger]
  );

  // Overview first: every node from aggregations (about a second even on long ranges, no row
  // cap). A map too large to draw whole (more than MAX_RENDERED_NODES nodes on screen) never
  // needs its whole topology: its Application / group levels come from the overview, an opened
  // environment or group from its exact slice, and focus from the neighborhood. A map that fits
  // loads its whole topology as before.
  const overviewGroupBy =
    filters.groupBy && filters.groupBy !== ENVIRONMENT_GROUP_BY ? filters.groupBy : null;
  const overview = useServiceMapOverview({
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
    refreshTrigger,
    groupByAttribute: overviewGroupBy,
  });
  const overviewNodesShown = useMemo(
    () =>
      includeDependencies
        ? overview.nodes
        : overview.nodes.filter((n) => !isDependencyType(n.KeyAttributes.Type)),
    [overview.nodes, includeDependencies]
  );
  // Decided per time range (not re-decided while an attribute regroups the overview), so the
  // view does not flip modes mid-load. An overview failure falls back to the whole topology.
  const rangeId = `${parsedTimeRange.startTime.getTime()}|${parsedTimeRange.endTime.getTime()}|${refreshTrigger}|${includeDependencies}`;
  const [largeByRange, setLargeByRange] = useState<{ rangeId: string; large: boolean } | null>(
    null
  );
  useEffect(() => {
    // Undecided until the overview has loaded for this range (not while the config loads).
    if (!overview.ready || overview.isLoading) return;
    const large =
      !overview.error && overviewNodesShown.length > APPLICATION_MAP_CONSTANTS.MAX_RENDERED_NODES;
    setLargeByRange((prev) =>
      prev?.rangeId === rangeId && prev.large === large ? prev : { rangeId, large }
    );
  }, [overview.ready, overview.isLoading, overview.error, overviewNodesShown, rangeId]);
  const modeKnown = largeByRange?.rangeId === rangeId;
  const isLargeMap = modeKnown && largeByRange!.large;

  const full = useServiceMap({
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
    refreshTrigger,
    enabled: modeKnown && !isLargeMap,
  });
  const nodes = isLargeMap ? overview.nodes : full.nodes;
  const edges = isLargeMap ? NO_EDGES : full.edges;
  const mapLoading = !modeKnown || (isLargeMap ? overview.isLoading : full.isLoading);
  const mapError = isLargeMap ? overview.error : full.error;
  const availableGroupByAttributes = isLargeMap
    ? overview.availableGroupByAttributes
    : full.availableGroupByAttributes;

  // Dependency nodes exist only with a data-prepper that synthesizes them; without them the
  // checkbox is not shown and the map renders as before.
  const hasDependencyNodes = useMemo(
    () => nodes.some((n) => isDependencyType(n.KeyAttributes.Type)),
    [nodes]
  );
  const mapGraph = useMemo(
    () =>
      isLargeMap
        ? { nodes: overviewNodesShown, edges: NO_EDGES }
        : includeDependencies
          ? { nodes, edges }
          : removeDependencies(nodes, edges),
    [isLargeMap, overviewNodesShown, includeDependencies, nodes, edges]
  );
  // The focused neighborhood, from the whole map (so callers / callees in other environments
  // or groups are included), dependencies included even when the map hides them: a focused view
  // is small, and a service's connections are often mostly databases / topics / externals.
  // Null when not focused or the node is no longer on the map.
  const focusCenter = useMemo(() => {
    const node = focus ? nodes.find((n) => n.NodeId === focus.nodeId) : undefined;
    return node ? { nodeId: node.NodeId, name: node.KeyAttributes.Name } : null;
  }, [focus, nodes]);
  const neighborhood = useFocusNeighborhood({
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
    refreshTrigger,
    enabled: isLargeMap,
    center: isLargeMap ? focusCenter : null,
    mode: focus?.mode ?? 'direct',
  });
  const localFocusGraph = useMemo(
    () => (focus && !isLargeMap ? getNeighborhood(nodes, edges, focus.nodeId, focus.mode) : null),
    [focus, isLargeMap, nodes, edges]
  );
  // While a large map's neighborhood loads, the focused view shows just the center.
  const focusGraph = useMemo(
    () =>
      isLargeMap
        ? focusCenter
          ? (neighborhood.neighborhood ?? {
              nodes: nodes.filter((n) => n.NodeId === focusCenter.nodeId),
              edges: NO_EDGES,
              totalConnected: 0,
            })
          : null
        : localFocusGraph,
    [isLargeMap, focusCenter, neighborhood.neighborhood, nodes, localFocusGraph]
  );

  // A large map's opened environment / group: its exact slice (prefetched, largest first).
  const groupBy = navigationState.groupByAttribute;
  const sliceFor = useCallback(
    (attribute: string, value: string): ServiceMapSliceFilter =>
      attribute === ENVIRONMENT_GROUP_BY
        ? { kind: 'environment', environment: value }
        : { kind: 'attribute', attribute, value },
    []
  );
  const activeSlice = useMemo(
    () =>
      isLargeMap &&
      navigationState.level === 'groupByValue' &&
      groupBy &&
      navigationState.groupByValue
        ? sliceFor(groupBy, navigationState.groupByValue)
        : null,
    [isLargeMap, navigationState, groupBy, sliceFor]
  );
  const prefetchSlices = useMemo(() => {
    if (!isLargeMap || !groupBy) return [];
    const sizes = new Map<string, number>();
    mapGraph.nodes.forEach((n) => {
      const v = getNodeGroupValue(n, groupBy);
      if (v) sizes.set(v, (sizes.get(v) ?? 0) + 1);
    });
    return Array.from(sizes.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value]) => sliceFor(groupBy, value));
  }, [isLargeMap, groupBy, mapGraph.nodes, sliceFor]);
  const slices = useServiceMapSlices({
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
    refreshTrigger,
    enabled: isLargeMap && !mapLoading,
    active: activeSlice,
    prefetch: prefetchSlices,
  });
  const sliceLoading = !!activeSlice && slices.activeStatus === 'pending';
  // What the graph draws: an opened slice on a large map, else the map.
  const viewGraph = useMemo(() => {
    if (!activeSlice) return mapGraph;
    const slice = slices.active ?? { nodes: [], edges: NO_EDGES };
    return includeDependencies ? slice : removeDependencies(slice.nodes, slice.edges);
  }, [activeSlice, slices.active, mapGraph, includeDependencies]);
  const mapTruncated = isLargeMap
    ? (!!activeSlice && (!!slices.active?.truncated || slices.activeStatus === 'failed')) ||
      (!!focus && neighborhood.truncated)
    : full.truncated;

  // Auto-select node from URL params once nodes are loaded
  useEffect(() => {
    if (!pendingNodeSelection || nodes.length === 0) return;

    const { serviceName, environment } = pendingNodeSelection;

    // Find the matching node by service name and environment
    const matchingNode = nodes.find(
      (n) => n.KeyAttributes.Name === serviceName && n.KeyAttributes.Environment === environment
    );

    if (matchingNode) {
      // Focus the linked service. A map too large to draw whole has its environment underneath
      // (grouped by environment, that environment checked), so Back lands there.
      const large = exceedsMapRenderCap(
        mapGraph.nodes,
        mapGraph.edges,
        !showDependenciesIndividually
      );
      dispatch({
        type: 'deepLink',
        nodeId: matchingNode.NodeId,
        selection: {
          nodeId: matchingNode.NodeId,
          serviceName,
          environment,
          platformType: getPlatformTypeFromEnvironment(environment),
          nodeType: matchingNode.KeyAttributes?.Type,
          groupByAttributes: matchingNode.GroupByAttributes,
        },
        environmentGroup: large
          ? { value: environment, environmentFilterId: environmentFilterId(nodes, environment) }
          : undefined,
      });
    }

    // Clear pending selection (only attempt once)
    setPendingNodeSelection(null);
  }, [nodes, pendingNodeSelection, mapGraph, showDependenciesIndividually]);

  // Per-node metrics are fetched only for the nodes on screen: the focused neighborhood, the
  // opened group, or the services view. The Application and group levels show per-group
  // totals instead (useMapGroupTotals), so a large map never fetches metrics for every service
  // until it is drilled into. Hidden dependencies are never queried.
  const onScreenNodes = useMemo(() => {
    // A view over the render cap shows a notice, not its nodes: fetch nothing for it.
    const drawable = (graph: { nodes: ServiceMapNode[]; edges: ServiceMapEdge[] }) =>
      exceedsMapRenderCap(graph.nodes, graph.edges, !showDependenciesIndividually)
        ? []
        : graph.nodes;
    if (focusGraph) return drawable(focusGraph);
    if (navigationState.level === 'groupByValue' && navigationState.groupByAttribute) {
      const groupNodes = viewGraph.nodes.filter(
        (n) =>
          getNodeGroupValue(n, navigationState.groupByAttribute!) === navigationState.groupByValue
      );
      const ids = new Set(groupNodes.map((n) => n.NodeId));
      return drawable({
        nodes: groupNodes,
        edges: viewGraph.edges.filter(
          (e) => ids.has(e.SourceNodeId) && ids.has(e.DestinationNodeId)
        ),
      });
    }
    if (navigationState.level === 'services') return drawable(mapGraph);
    return [];
  }, [focusGraph, navigationState, mapGraph, viewGraph, showDependenciesIndividually]);

  // Totals for the Application node / group nodes when that level is on screen.
  const showsGroupTotals =
    !focusGraph && (navigationState.level === 'application' || navigationState.level === 'groupBy');
  const {
    totals: groupTotals,
    failed: groupTotalsFailed,
    retry: retryGroupTotals,
  } = useMapGroupTotals({
    groupBy:
      navigationState.level === 'groupBy' ? (navigationState.groupByAttribute ?? null) : null,
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
    // mapLoading stays true until the current request has loaded (see useServiceMap), so a new
    // time range never sends totals for the previous range's nodes.
    enabled: showsGroupTotals && !mapLoading && nodes.length > 0,
    refreshTrigger,
  });

  // Most-connected first, so the hubs of the view fill in before the leaves.
  const servicesList = useMemo(() => {
    const onScreen = new Set(onScreenNodes.map((n) => n.NodeId));
    const degree = new Map<string, number>();
    [...viewGraph.edges, ...(focusGraph?.edges ?? [])].forEach((e) => {
      if (!onScreen.has(e.SourceNodeId) || !onScreen.has(e.DestinationNodeId)) return;
      degree.set(e.SourceNodeId, (degree.get(e.SourceNodeId) ?? 0) + 1);
      degree.set(e.DestinationNodeId, (degree.get(e.DestinationNodeId) ?? 0) + 1);
    });
    return [...onScreenNodes]
      .sort((a, b) => (degree.get(b.NodeId) ?? 0) - (degree.get(a.NodeId) ?? 0))
      .map((node) => ({
        serviceName: node.KeyAttributes.Name,
        environment: node.KeyAttributes.Environment,
        type: node.KeyAttributes.Type,
      }));
  }, [onScreenNodes, viewGraph, focusGraph]);

  // Extract unique environments from nodes (sorted alphabetically by display name).
  // Dedupe on the display name rather than the raw env string: the map filters by
  // display name (see service_map_graph), so two raw envs sharing a prefix (e.g.
  // "eks:cluster1" and "eks:cluster2") must collapse into a single "eks" checkbox
  // instead of rendering as identical duplicates.
  const availableEnvironments = useMemo(() => {
    const byDisplayName = new Map<string, string>();
    nodes.forEach((node) => {
      const env = node.KeyAttributes.Environment;
      if (env) {
        const displayName = getEnvironmentDisplayName(env);
        if (!byDisplayName.has(displayName)) {
          byDisplayName.set(displayName, env);
        }
      }
    });
    return Array.from(byDisplayName.values()).sort((a, b) =>
      getEnvironmentDisplayName(a).localeCompare(getEnvironmentDisplayName(b))
    );
  }, [nodes]);

  // Fetch RED metrics for the rendered nodes in bounded batches; each node fills in as its
  // batch lands (pendingNodeIds). Waits for the topology of the current time range so the
  // previous range's node list is not queried and then cancelled.
  const {
    metricsMap,
    pendingNodeIds,
    failedNodeIds,
    retryFailed: retryFailedMetrics,
    isLoading: metricsLoading,
    refetch: refetchMetrics,
  } = useServiceMapMetrics({
    services: servicesList,
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
    enabled: !mapLoading,
  });

  // Fetch metrics for the selected edge (on-demand)
  const { metrics: selectedEdgeMetrics, isLoading: edgeMetricsLoading } = useSelectedEdgeMetrics({
    selectedEdge,
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
  });

  // Determine if selected node is a group node
  const isGroupNode = selectedNode?.nodeId?.startsWith('group-') ?? false;
  const selectedGroupValue = isGroupNode ? selectedNode?.nodeId?.replace('group-', '') : '';

  // Fetch metrics for selected group node (on-demand)
  const { metrics: groupMetrics, isLoading: groupMetricsLoading } = useGroupMetrics({
    groupByAttribute: filters.groupBy || '',
    groupByValue: selectedGroupValue || '',
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
    enabled: isGroupNode && !!filters.groupBy && !!selectedGroupValue,
  });

  // Combined loading state (map progress bar). The filters are client-side and only wait for
  // the topology (mapLoading), not for every metrics batch to land.
  const isLoading = mapLoading || metricsLoading;

  // Keep URL `from`/`to` in sync with the time range (picker or flyout brush) so a
  // picked range survives reload and can be shared; a missing or invalid range is
  // backfilled. The map is its own app, so any hash in it is this page.
  useTimeRangeUrlSync({
    timeRange,
    isCurrentPage: isApplicationMapPath,
    fallbackPath: APPLICATION_MAP_HASH_PATH,
  });

  // Handle time range change
  const handleTimeChange = useCallback(
    (newTimeRange: TimeRange) => {
      setTimeRange(newTimeRange);
    },
    [setTimeRange]
  );

  // Chart brush in the insights flyout: zoom the whole map's time range (map +
  // flyout charts re-query). Charts report ISO-8601 start/end.
  const handleChartTimeRangeChange = useCallback(
    (from: string, to: string) => {
      setTimeRange({ from, to });
    },
    [setTimeRange]
  );

  // Handle refresh
  const handleRefresh = useCallback(() => {
    // Map refetches via the refreshTrigger prop; the metrics hook only exposes
    // refetch(). Bumping the trigger AND calling refetchMap() double-fetched the map.
    setRefreshTrigger((prev) => prev + 1);
    refetchMetrics();
    // Clear selected edge on refresh
    dispatch({ type: 'selectEdge', edge: null });
  }, [refetchMetrics]);

  // The environment groups an Environment filter selection matches (by display name, as the
  // map filters), for the environment grouping's filter / opened-environment sync.
  const environmentGroups = useCallback(
    (environments: string[]) => {
      const selected = new Set(environments.map(getEnvironmentDisplayName));
      return Array.from(
        new Set(
          mapGraph.nodes
            .map((n) => getNodeGroupValue(n, ENVIRONMENT_GROUP_BY))
            .filter((v): v is string => !!v && selected.has(getEnvironmentDisplayName(v)))
        )
      );
    },
    [mapGraph.nodes]
  );
  const setFilters = useCallback(
    (next: ApplicationMapFilters | ((prev: ApplicationMapFilters) => ApplicationMapFilters)) =>
      dispatch({ type: 'setFilters', filters: next, environmentGroups }),
    [environmentGroups]
  );
  const handleFiltersChange = setFilters;

  // Map navigation (drill-down, breadcrumbs). Leaves focus mode; opening an environment (grouped
  // by environment) checks it in the Environment filter.
  const handleNavigationStateChange = useCallback(
    (next: MapNavigationState) =>
      dispatch({
        type: 'navigate',
        navigation: next,
        environmentFilterId:
          next.groupByAttribute === ENVIRONMENT_GROUP_BY && next.groupByValue
            ? environmentFilterId(mapGraph.nodes, next.groupByValue)
            : undefined,
      }),
    [mapGraph.nodes]
  );

  // Handle node click (View insights)
  const handleNodeClick = useCallback(
    (nodeId: string, serviceName: string, environment: string) => {
      // Check if this is a group node
      if (nodeId.startsWith('group-')) {
        const groupByValue = nodeId.replace('group-', '');
        dispatch({
          type: 'selectGroup',
          selection: {
            nodeId,
            serviceName: groupByValue, // Use group value as title
            environment: 'group',
            platformType: 'Group',
            groupByAttributes: { [filters.groupBy || '']: groupByValue },
          },
        });
        return;
      }

      const node = nodes.find((n) => n.NodeId === nodeId);
      const selection = {
        nodeId,
        serviceName,
        environment,
        platformType: getPlatformTypeFromEnvironment(environment),
        nodeType: node?.KeyAttributes?.Type,
        groupByAttributes: node?.GroupByAttributes,
      };
      // Focus the map on the clicked node's neighborhood (clicking a neighbor moves the focus).
      if (node) dispatch({ type: 'focus', nodeId, selection });
      else dispatch({ type: 'selectGroup', selection });
    },
    [nodes, filters.groupBy]
  );

  // Handle edge click (show metrics popup)
  const handleEdgeSelect = useCallback((edge: SelectedEdgeState | null) => {
    // Selecting an edge closes the service flyout.
    dispatch({ type: 'selectEdge', edge });
  }, []);

  // Handle view service details
  const handleViewServiceDetails = useCallback(
    (serviceName: string, environment: string) => {
      const node = nodes.find(
        (n) => n.KeyAttributes.Name === serviceName && n.KeyAttributes.Environment === environment
      );
      const language = node?.GroupByAttributes?.['telemetry.sdk.language'];

      openServiceDetailsInNewTab(serviceName, environment, {
        timeRange,
        language,
        nodeType: node?.KeyAttributes?.Type,
      });
    },
    [nodes, timeRange]
  );

  // Close details panel
  const handleCloseDetailsPanel = useCallback(() => {
    dispatch({ type: 'closeDetails' });
  }, []);

  // Correlations flyout state (for Show Spans / Show Logs from service details panel)
  const [correlationsFlyout, setCorrelationsFlyout] = useState<{
    serviceName: string;
    environment: string;
    language?: string;
    initialTab: 'spans' | 'logs' | 'dashboards';
  } | null>(null);

  const handleShowSpans = useCallback(
    (serviceName: string, environment: string) => {
      const node = nodes.find(
        (n) => n.KeyAttributes.Name === serviceName && n.KeyAttributes.Environment === environment
      );
      setCorrelationsFlyout({
        serviceName,
        environment,
        language: node?.GroupByAttributes?.['telemetry.sdk.language'],
        initialTab: 'spans',
      });
    },
    [nodes]
  );

  const handleShowLogs = useCallback(
    (serviceName: string, environment: string) => {
      const node = nodes.find(
        (n) => n.KeyAttributes.Name === serviceName && n.KeyAttributes.Environment === environment
      );
      setCorrelationsFlyout({
        serviceName,
        environment,
        language: node?.GroupByAttributes?.['telemetry.sdk.language'],
        initialTab: 'logs',
      });
    },
    [nodes]
  );

  const handleShowDashboards = useCallback(
    (serviceName: string, environment: string) => {
      const node = nodes.find(
        (n) => n.KeyAttributes.Name === serviceName && n.KeyAttributes.Environment === environment
      );
      setCorrelationsFlyout({
        serviceName,
        environment,
        language: node?.GroupByAttributes?.['telemetry.sdk.language'],
        initialTab: 'dashboards',
      });
    },
    [nodes]
  );

  // Get metrics for selected node
  const selectedNodeMetrics = useMemo(() => {
    if (!selectedNode) return null;

    // For group nodes, use the fetched group metrics from Prometheus
    if (selectedNode.nodeId.startsWith('group-')) {
      return groupMetrics;
    }

    // For the application root node, the whole-map totals
    if (selectedNode.nodeId === 'application-root') {
      const all = groupTotals?.get(ALL_GROUPS_KEY);
      if (!all) return null;
      const { totalRequests, totalFaults, totalErrors } = all;

      return {
        latency: [],
        avgLatency: 0,
        latencyP99: [],
        avgLatencyP99: 0,
        latencyP90: [],
        avgLatencyP90: 0,
        latencyP50: [],
        avgLatencyP50: 0,
        throughput: [],
        avgThroughput: 0,
        failureRatio: [],
        avgFailureRatio:
          totalRequests > 0 ? ((totalFaults + totalErrors) / totalRequests) * 100 : 0,
        faults: [],
        totalFaults,
        errors: [],
        totalErrors,
        totalRequests,
      };
    }

    // For regular service nodes, look up by nodeId
    const nodeId = `${selectedNode.serviceName}::${selectedNode.environment}`;
    return metricsMap.get(nodeId) || null;
  }, [selectedNode, metricsMap, groupMetrics, groupTotals]);

  // Compute node IDs to focus on when edge is selected
  const selectedEdgeNodeIds = useMemo(() => {
    if (!selectedEdge) return undefined;
    return [selectedEdge.sourceNodeId, selectedEdge.targetNodeId];
  }, [selectedEdge]);

  // Handle settings modal close
  const handleModalClose = useCallback(
    (saved?: boolean) => {
      setIsSettingsModalVisible(false);
      if (saved) {
        refreshConfig();
      }
    },
    [refreshConfig]
  );

  // Handle get started click
  const handleGetStartedClick = useCallback(() => {
    setIsSettingsModalVisible(true);
  }, []);

  // Build active filter badges
  const activeFilters: FilterBadge[] = useMemo(() => {
    const badges: FilterBadge[] = [];

    // Fault rate (5xx) threshold badges
    if (filters.faultRateThresholds.length > 0) {
      badges.push({
        key: 'faultRate',
        category: i18nTexts.filters.faultRate,
        values: filters.faultRateThresholds.map(
          (threshold) => THRESHOLD_LABELS.errorRate[threshold]
        ),
        onRemove: () => setFilters((prev) => ({ ...prev, faultRateThresholds: [] })),
      });
    }

    // Error rate (4xx) threshold badges
    if (filters.errorRateThresholds.length > 0) {
      badges.push({
        key: 'errorRate',
        category: i18nTexts.filters.errorRate,
        values: filters.errorRateThresholds.map(
          (threshold) => THRESHOLD_LABELS.errorRate[threshold]
        ),
        onRemove: () => setFilters((prev) => ({ ...prev, errorRateThresholds: [] })),
      });
    }

    // Environment filter badges
    if (filters.environments.length > 0) {
      badges.push({
        key: 'environment',
        category: i18nTexts.filters.environment,
        values: filters.environments.map((env) => getEnvironmentDisplayName(env)),
        onRemove: () => setFilters((prev) => ({ ...prev, environments: [] })),
      });
    }

    // Group by badge
    if (filters.groupBy) {
      badges.push({
        key: 'groupBy',
        category: i18nTexts.filters.groupBy,
        values: [filters.groupBy],
        onRemove: () => setFilters((prev) => ({ ...prev, groupBy: null })),
      });
    }

    return badges;
  }, [filters, setFilters]);

  // Clear all filters. Dependencies stay as chosen: hidden is the default, and the sidebar
  // checkbox (not a filter badge) controls them.
  const handleClearAllFilters = useCallback(() => {
    dispatch({ type: 'clearAllFilters' });
  }, []);

  // Service search on the map: picking a service focuses it (as clicking it, or arriving from the
  // Services page, does); clearing it returns to the full map.
  // Grouped by environment (OUI combo box groups): the environment is the group header, so each
  // option is just the service name, and names shared across environments stay distinct. Lists
  // every service regardless of the sidebar filters: focusing works from anywhere on the map.
  const serviceSearchOptions = useMemo(() => {
    const byEnvironment = new Map<string, Array<{ label: string; value: string; key: string }>>();
    mapGraph.nodes.forEach((n) => {
      const env = n.KeyAttributes.Environment;
      const list = byEnvironment.get(env) ?? [];
      // `key`: names repeat across environments; the node id is unique.
      list.push({ label: n.Name, value: n.NodeId, key: n.NodeId });
      byEnvironment.set(env, list);
    });
    return Array.from(byEnvironment.entries())
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([env, options]) => ({
        label: env,
        options: options.sort((x, y) => x.label.localeCompare(y.label)),
      }));
  }, [mapGraph.nodes]);
  // The search shows the focused service, or the selected one after leaving focus, until cleared.
  // Shown with its environment, since the selection is outside the group headers.
  const searchNodeId = focusGraph ? focus?.nodeId : selectedNode?.nodeId;
  const searchNode = searchNodeId ? nodes.find((n) => n.NodeId === searchNodeId) : undefined;
  const focusedOption = searchNode
    ? {
        label: `${searchNode.Name} (${searchNode.KeyAttributes.Environment})`,
        value: searchNode.NodeId,
      }
    : undefined;
  const focusNode = focusGraph ? nodes.find((n) => n.NodeId === focus?.nodeId) : undefined;
  // The Application level is a single card: nothing to find. A query typed deeper is cleared on
  // the way back, rather than left hidden in a disabled box.
  const searchUnavailable = !focusGraph && navigationState.level === 'application';
  useEffect(() => {
    if (searchUnavailable && filters.searchQuery) {
      setFilters((prev) => ({ ...prev, searchQuery: '' }));
    }
  }, [searchUnavailable, filters.searchQuery, setFilters]);
  const focusFilters = useMemo(() => ({ ...filters, environments: [] }), [filters]);

  // Leave focus mode back to the view that contains the service, with it still selected (flyout
  // open, map centered on it): its group when grouped (e.g. its environment), else the services
  // view, or the environment groups when the map is too large to draw whole.
  const exitFocus = useCallback(() => {
    const node = focus ? nodes.find((n) => n.NodeId === focus.nodeId) : undefined;
    const onMap = !!node && mapGraph.nodes.some((n) => n.NodeId === node.NodeId);
    const filterGroupBy = filters.groupBy;
    let target: ExitFocusTarget = { kind: 'stay' };
    if (node && onMap && filterGroupBy) {
      const value = getNodeGroupValue(node, filterGroupBy);
      const alreadyThere =
        navigationState.level === 'groupByValue' && navigationState.groupByValue === value;
      if (value && !alreadyThere) {
        target = {
          kind: 'group',
          groupBy: filterGroupBy,
          value,
          environmentFilterId:
            filterGroupBy === ENVIRONMENT_GROUP_BY ? environmentFilterId(nodes, value) : undefined,
        };
      }
    } else if (node && onMap && navigationState.level === 'application') {
      const env = node.KeyAttributes.Environment;
      target = exceedsMapRenderCap(mapGraph.nodes, mapGraph.edges, !showDependenciesIndividually)
        ? {
            kind: 'group',
            groupBy: ENVIRONMENT_GROUP_BY,
            value: env,
            environmentFilterId: environmentFilterId(nodes, env),
          }
        : { kind: 'services' };
    }
    dispatch({ type: 'exitFocus', target });
  }, [focus, nodes, mapGraph, filters.groupBy, navigationState, showDependenciesIndividually]);
  const handleServiceSearchChange = useCallback(
    (selected: Array<{ label: string; value?: string }>) => {
      const nodeId = selected[0]?.value;
      const node = nodeId ? mapGraph.nodes.find((n) => n.NodeId === nodeId) : undefined;
      if (!node) {
        // Cleared: leave focus and drop the selection.
        dispatch({ type: 'clearSelection' });
        return;
      }
      handleNodeClick(node.NodeId, node.KeyAttributes.Name, node.KeyAttributes.Environment);
    },
    [mapGraph.nodes, handleNodeClick]
  );
  const [serviceSearchValue, setServiceSearchValue] = useState('');
  const matchingServiceSearchOptions = useMemo(
    () => filterFocusOptions(serviceSearchOptions, serviceSearchValue),
    [serviceSearchOptions, serviceSearchValue]
  );
  const serviceSearch = (
    <div style={{ width: 340 }}>
      <EuiComboBox
        compressed
        fullWidth
        prepend={i18nTexts.focus.searchPrepend}
        // Filtered here (`async` turns off the combo box's own filtering), keeping the
        // environment groups: its startsWith sort flattens them, separating each service from
        // its environment header.
        async
        onSearchChange={setServiceSearchValue}
        singleSelection={{ asPlainText: true }}
        placeholder={i18nTexts.focus.searchPlaceholder}
        aria-label={i18nTexts.focus.searchAriaLabel}
        options={matchingServiceSearchOptions}
        selectedOptions={focusedOption ? [focusedOption] : []}
        onChange={handleServiceSearchChange}
        isClearable
        isDisabled={mapLoading}
        data-test-subj="mapServiceSearch"
      />
    </div>
  );

  // APM Settings button for header area
  const settingsButton = (
    <EuiButtonEmpty iconType="gear" size="s" onClick={() => setIsSettingsModalVisible(true)}>
      APM Settings
    </EuiButtonEmpty>
  );

  // Show loading spinner while checking config
  if (configLoading) {
    return (
      <EuiPage>
        <EuiPageBody>
          <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: '400px' }}>
            <EuiFlexItem grow={false}>
              <EuiLoadingSpinner size="xl" />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPageBody>
      </EuiPage>
    );
  }

  // Show empty state if no config exists
  if (!config) {
    return (
      <EuiPage>
        <EuiPageBody>
          <HeaderControlledComponentsWrapper
            components={[settingsButton]}
            bottomControls={<LegacyBanner />}
          />

          <ApmEmptyState onGetStartedClick={handleGetStartedClick} />

          {isSettingsModalVisible && (
            <ApmSettingsModal onClose={handleModalClose} notifications={notifications} />
          )}
        </EuiPageBody>
      </EuiPage>
    );
  }

  // Show error state
  if (mapError) {
    return (
      <EuiPage data-test-subj="applicationMapPage">
        <EuiPageBody>
          <HeaderControlledComponentsWrapper components={[settingsButton]} />
          <EuiPageContent>
            <EuiPageContentBody>
              <EuiCallOut title={i18nTexts.error.title} color="danger" iconType="alert">
                <p>{mapError.message}</p>
              </EuiCallOut>
            </EuiPageContentBody>
          </EuiPageContent>
        </EuiPageBody>

        {isSettingsModalVisible && (
          <ApmSettingsModal onClose={handleModalClose} notifications={notifications} />
        )}
      </EuiPage>
    );
  }

  return (
    <EuiPage
      data-test-subj="applicationMapPage"
      className="apm-application-map"
      style={{ height: 'calc(100vh - 100px)', overflow: 'hidden' }}
    >
      <EuiPageBody component="main">
        <HeaderControlledComponentsWrapper components={[settingsButton]} />

        <EuiPageContent color="transparent" hasBorder={false} paddingSize="none">
          <EuiPageContentBody>
            {/* Search bar and time filter */}
            <ApmPageHeader
              timeRange={timeRange}
              onTimeChange={handleTimeChange}
              onRefresh={handleRefresh}
              searchQuery={filters.searchQuery}
              onSearchChange={(query) => setFilters((prev) => ({ ...prev, searchQuery: query }))}
              prepend={serviceSearch}
              searchPlaceholder={
                searchUnavailable
                  ? i18nTexts.searchDisabledPlaceholder
                  : i18nTexts.searchPlaceholder
              }
              searchDisabled={searchUnavailable}
            />

            {/* Active filter badges */}
            {activeFilters.length > 0 && (
              <>
                <EuiSpacer size="s" />
                <ActiveFilterBadges
                  filters={activeFilters}
                  onClearAll={handleClearAllFilters}
                  disabled={mapLoading}
                />
              </>
            )}

            {/* Edge-cap truncation notice: the graph's node-count notice does
                not cover a dense mesh where edges are cut before the node cap. */}
            {mapTruncated && (
              <>
                <EuiSpacer size="s" />
                <EuiCallOut
                  title={i18nTexts.partial.title}
                  color="warning"
                  iconType="alert"
                  size="s"
                  data-test-subj="mapPartialTopologyCallout"
                >
                  {i18nTexts.partial.body}
                </EuiCallOut>
              </>
            )}

            {/* Metrics that could not be loaded: unavailable on the map, with a retry. */}
            {(failedNodeIds.size > 0 || (showsGroupTotals && groupTotalsFailed)) && (
              <>
                <EuiSpacer size="s" />
                <EuiCallOut
                  title={i18nTexts.metrics.failedTitle}
                  color="warning"
                  iconType="alert"
                  size="s"
                  data-test-subj="mapMetricsFailedCallout"
                >
                  <p>
                    {failedNodeIds.size > 0
                      ? i18nTexts.metrics.failedBody(failedNodeIds.size)
                      : i18nTexts.metrics.totalsFailedBody}
                  </p>
                  <EuiButtonEmpty
                    size="xs"
                    flush="left"
                    iconType="refresh"
                    onClick={() => {
                      if (failedNodeIds.size > 0) retryFailedMetrics();
                      if (showsGroupTotals && groupTotalsFailed) retryGroupTotals();
                    }}
                    data-test-subj="mapMetricsRetry"
                  >
                    {i18nTexts.metrics.retry}
                  </EuiButtonEmpty>
                </EuiCallOut>
              </>
            )}

            {/* The map's own notices (large map grouped, dependency stacks, no filter matches)
                render here, so all banners sit together above the map. */}
            <div ref={setMapNoticesEl} data-test-subj="mapNotices" />

            {/* Focus mode bar: the way back, what is shown, and which connections. */}
            {focusGraph && (
              <>
                <EuiSpacer size="s" />
                <EuiPanel paddingSize="s" hasShadow={false} hasBorder data-test-subj="mapFocusBar">
                  <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiButtonEmpty
                        size="s"
                        iconType="arrowLeft"
                        flush="left"
                        onClick={exitFocus}
                        data-test-subj="mapFocusExit"
                      >
                        {i18nTexts.focus.exit}
                      </EuiButtonEmpty>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiText size="s">
                        {focusGraph.totalConnected > focusGraph.nodes.length - 1
                          ? // A hub's connections are capped (FOCUS_MAX_NODES), nearest first.
                            i18nTexts.focus.labelCapped(
                              focusNode?.Name ?? '',
                              focusNode?.KeyAttributes.Environment ?? '',
                              focusGraph.nodes.length - 1,
                              focusGraph.totalConnected
                            )
                          : isLargeMap && neighborhood.pathCut
                            ? i18nTexts.focus.labelPathCut(
                                focusNode?.Name ?? '',
                                focusNode?.KeyAttributes.Environment ?? '',
                                focusGraph.nodes.length - 1,
                                NEIGHBORHOOD_MAX_ROUNDS
                              )
                            : i18nTexts.focus.label(
                                focusNode?.Name ?? '',
                                focusNode?.KeyAttributes.Environment ?? '',
                                focusGraph.nodes.length - 1
                              )}
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiButtonGroup
                        legend={i18nTexts.focus.modeLegend}
                        buttonSize="compressed"
                        options={[
                          { id: 'mapFocusDirect', label: i18nTexts.focus.direct },
                          { id: 'mapFocusPath', label: i18nTexts.focus.path },
                        ]}
                        idSelected={focus?.mode === 'path' ? 'mapFocusPath' : 'mapFocusDirect'}
                        onChange={(id) =>
                          dispatch({
                            type: 'setFocusMode',
                            mode: id === 'mapFocusPath' ? 'path' : 'direct',
                          })
                        }
                        data-test-subj="mapFocusMode"
                      />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiPanel>
              </>
            )}

            {/* Main content with resizable filter sidebar */}
            <EuiResizableContainer className="apm-application-map__container">
              {(EuiResizablePanel, EuiResizableButton, { togglePanel }) => (
                <>
                  {/* Left Side: Filter Sidebar - Collapsible */}
                  <EuiResizablePanel
                    mode={['custom', { position: 'top' }]}
                    id="filter-sidebar"
                    initialSize={APPLICATION_MAP_CONSTANTS.SIDEBAR_INITIAL_WIDTH}
                    minSize={APPLICATION_MAP_CONSTANTS.SIDEBAR_MIN_WIDTH}
                    paddingSize="none"
                    style={{ paddingTop: '8px', paddingRight: '8px' }}
                  >
                    <ServiceMapSidebar
                      filters={filters}
                      onFiltersChange={handleFiltersChange}
                      availableGroupByAttributes={availableGroupByAttributes}
                      availableEnvironments={availableEnvironments}
                      isLoading={mapLoading}
                      onToggle={() => togglePanel('filter-sidebar', { direction: 'left' })}
                      dependencies={
                        hasDependencyNodes
                          ? { included: includeDependencies, onChange: setIncludeDependencies }
                          : undefined
                      }
                    />
                  </EuiResizablePanel>

                  <EuiResizableButton />

                  {/* Right Side: Service Map Graph */}
                  <EuiResizablePanel
                    id="main-content"
                    initialSize={85}
                    minSize="50%"
                    paddingSize="none"
                    scrollable={false}
                    style={{ padding: '8px 0px 0px 8px' }}
                  >
                    <ServiceMapGraph
                      nodes={focusGraph ? focusGraph.nodes : viewGraph.nodes}
                      edges={focusGraph ? focusGraph.edges : viewGraph.edges}
                      stackDependencies={!showDependenciesIndividually}
                      onShowDependenciesIndividually={() => setShowDependenciesIndividually(true)}
                      metricsMap={metricsMap}
                      pendingNodeIds={pendingNodeIds}
                      failedNodeIds={failedNodeIds}
                      onHideDependencies={
                        includeDependencies ? () => setIncludeDependencies(false) : undefined
                      }
                      noticesContainer={mapNoticesEl}
                      groupTotals={
                        showsGroupTotals ? (groupTotalsFailed ? 'failed' : groupTotals) : undefined
                      }
                      // A focused view is small: show all of it, even a call path wider than the panel.
                      fitAll={!!focusGraph}
                      // In focus mode the Environment filter (a view scope, synced with the opened
                      // environment) would fade the cross-environment neighbors focus exists to
                      // show; the highlight filters (search, rates) still apply to what's on
                      // screen. The filter itself is untouched, so leaving focus restores it.
                      filters={focusGraph ? focusFilters : filters}
                      navigationState={focusGraph ? FOCUS_NAVIGATION_STATE : navigationState}
                      onNavigationStateChange={handleNavigationStateChange}
                      onNodeClick={handleNodeClick}
                      isLoading={isLoading || sliceLoading || (!!focus && neighborhood.isLoading)}
                      selectedEdge={selectedEdge}
                      onEdgeSelect={handleEdgeSelect}
                      // In focus mode the map fits the whole neighborhood; a selected node would
                      // zoom onto that one card and push its connections off screen.
                      selectedNodeId={focusGraph ? undefined : selectedNode?.nodeId}
                      selectedEdgeNodeIds={selectedEdgeNodeIds}
                      onFiltersChange={handleFiltersChange}
                    />
                  </EuiResizablePanel>
                </>
              )}
            </EuiResizableContainer>
          </EuiPageContentBody>
        </EuiPageContent>
      </EuiPageBody>

      {/* Service Details Flyout */}
      {selectedNode && config?.prometheusDataSource?.name && (
        <ServiceDetailsPanel
          node={selectedNode}
          metrics={selectedNodeMetrics}
          isLoading={isGroupNode ? groupMetricsLoading : metricsLoading}
          timeRange={timeRange}
          prometheusConnectionId={config.prometheusDataSource.name}
          onClose={handleCloseDetailsPanel}
          onViewDetails={handleViewServiceDetails}
          onShowSpans={handleShowSpans}
          onShowLogs={handleShowLogs}
          onShowDashboards={handleShowDashboards}
          refreshTrigger={refreshTrigger}
          onTimeRangeChange={handleChartTimeRangeChange}
        />
      )}

      {/* Service Correlations Flyout */}
      {correlationsFlyout && (
        <ServiceCorrelationsFlyout
          serviceName={correlationsFlyout.serviceName}
          environment={correlationsFlyout.environment}
          language={correlationsFlyout.language}
          timeRange={timeRange}
          initialTab={correlationsFlyout.initialTab}
          onClose={() => setCorrelationsFlyout(null)}
        />
      )}

      {/* Edge Metrics Flyout */}
      {selectedEdge && (
        <EdgeMetricsFlyout
          selectedEdge={selectedEdge}
          metrics={selectedEdgeMetrics}
          isLoading={edgeMetricsLoading}
          onClose={() => dispatch({ type: 'selectEdge', edge: null })}
        />
      )}

      {/* Settings Modal */}
      {isSettingsModalVisible && (
        <ApmSettingsModal onClose={handleModalClose} notifications={notifications} />
      )}
    </EuiPage>
  );
};

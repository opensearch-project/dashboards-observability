/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiLoadingSpinner,
  EuiEmptyPrompt,
  EuiProgress,
  EuiCallOut,
  EuiButton,
  EuiButtonEmpty,
} from '@elastic/eui';
import { CelestialMap, getIcon } from '@osd/apm-topology';
import type { CelestialCardProps, CelestialEdge, Breadcrumb } from '@osd/apm-topology';
import { MarkerType } from '@xyflow/react';
import {
  ServiceMapNode,
  ServiceMapEdge,
  ServiceMapNodeMetrics,
  CelestialMapNode,
  CelestialMapEdge,
  MapNavigationState,
  ApplicationMapFilters,
  SelectedEdgeState,
} from '../../../common/types/service_map_types';
import {
  getNodeIconType,
  getNodeSubtitle,
  getEnvironmentDisplayName,
  APPLICATION_MAP_CONSTANTS,
} from '../../../common/constants';
import { matchesErrorRateThreshold } from '../filters';
import { computeDependencyStacks } from '../../utils/dependency_stacking';
import {
  ENVIRONMENT_GROUP_BY,
  exceedsMapRenderCap,
  getNodeGroupValue,
} from '../../utils/map_grouping';
import { ALL_GROUPS_KEY, GroupTotals } from '../../hooks/use_map_group_totals';
import { applicationMapI18nTexts as i18nTexts } from '../../../pages/application_map/application_map_i18n';

export interface ServiceMapGraphProps {
  nodes: ServiceMapNode[];
  edges: ServiceMapEdge[];
  metricsMap: Map<string, ServiceMapNodeMetrics>;
  /** nodeIds (serviceName::environment) whose metrics are still loading; shown with a spinner. */
  pendingNodeIds?: Set<string>;
  /**
   * Where to render the map's notices (large map grouped, dependency stacks, no filter matches),
   * e.g. a slot above the map next to the page's other banners. Without it they float over the
   * bottom of the map.
   */
  noticesContainer?: HTMLElement | null;
  /**
   * Totals for the Application node (ALL_GROUPS_KEY) or the group nodes, from per-group queries
   * (useMapGroupTotals); null while loading. When omitted, group totals are summed from
   * metricsMap.
   */
  groupTotals?: Map<string, GroupTotals> | null;
  /**
   * Fit the whole graph in view, zooming out as far as needed (e.g. a focused call path wider
   * than the panel). By default the map does not zoom out below 0.6, to keep cards readable.
   */
  fitAll?: boolean;
  filters: ApplicationMapFilters;
  navigationState: MapNavigationState;
  onNavigationStateChange: (state: MapNavigationState) => void;
  onNodeClick: (nodeId: string, serviceName: string, environment: string) => void;
  isLoading: boolean;
  /** Currently selected edge state (for flyout display) */
  selectedEdge?: SelectedEdgeState | null;
  /** Callback when an edge is selected (clicked) */
  onEdgeSelect?: (edge: SelectedEdgeState | null) => void;
  /** Currently selected node ID (for centering the view) */
  selectedNodeId?: string | null;
  /** Node IDs of selected edge endpoints (for focusing) */
  selectedEdgeNodeIds?: string[];
  /** Callback when filters change (e.g., clearing groupBy on breadcrumb click) */
  onFiltersChange?: (filters: ApplicationMapFilters) => void;
  /**
   * Fold dependencies that connect to the same nodes into expandable stacks when the view has
   * more than DEPENDENCY_STACK_THRESHOLD nodes. Defaults to true.
   */
  stackDependencies?: boolean;
  /** Called from the stacking notice's "Show individually". */
  onShowDependenciesIndividually?: () => void;
}

/**
 * ServiceMapGraph - CelestialMap wrapper with transform logic
 *
 * Handles:
 * - Transforming PPL nodes/edges to CelestialMap format
 * - Hierarchical navigation (Application -> Services)
 * - Client-side filtering
 * - Node click and keyboard interactions
 */
export const ServiceMapGraph: React.FC<ServiceMapGraphProps> = ({
  nodes,
  edges,
  metricsMap,
  pendingNodeIds = NO_PENDING_NODES,
  noticesContainer,
  groupTotals,
  fitAll = false,
  filters,
  navigationState,
  onNavigationStateChange,
  onNodeClick,
  isLoading,
  selectedEdge,
  onEdgeSelect,
  selectedNodeId,
  selectedEdgeNodeIds,
  onFiltersChange,
  stackDependencies = true,
  onShowDependenciesIndividually,
}) => {
  // Build a map from NodeId to service info for edge click handling
  const nodeIdToServiceInfo = useMemo(() => {
    const map = new Map<string, { serviceName: string; environment: string; type?: string }>();
    nodes.forEach((node) => {
      map.set(node.NodeId, {
        serviceName: node.KeyAttributes.Name,
        environment: node.KeyAttributes.Environment,
        type: node.KeyAttributes.Type,
      });
    });
    return map;
  }, [nodes]);

  // Structural graph for the current level: which raw nodes/edges render.
  // Excludes metric values and edge selection so a metrics tick or edge click
  // does not rebuild it (and does not force a dagre relayout of all nodes).
  const levelGraph = useMemo(() => {
    if (navigationState.level === 'application') {
      return { kind: 'application' as const };
    }
    if (navigationState.level === 'groupBy' && navigationState.groupByAttribute) {
      return { kind: 'groupBy' as const };
    }
    if (
      navigationState.level === 'groupByValue' &&
      navigationState.groupByAttribute &&
      navigationState.groupByValue
    ) {
      const filteredNodes = nodes.filter(
        (node) =>
          getNodeGroupValue(node, navigationState.groupByAttribute!) ===
          navigationState.groupByValue
      );
      const filteredNodeIds = new Set(filteredNodes.map((n) => n.NodeId));
      const filteredEdges = edges.filter(
        (edge) =>
          filteredNodeIds.has(edge.SourceNodeId) && filteredNodeIds.has(edge.DestinationNodeId)
      );
      return { kind: 'graph' as const, nodes: filteredNodes, edges: filteredEdges };
    }
    // Services view - all nodes (filtering handled by nodesInFocus)
    return { kind: 'graph' as const, nodes, edges };
  }, [nodes, edges, navigationState]);

  // Large maps: dependencies connected to the same nodes fold into stacks (no edge is lost),
  // which keeps them visible while taking them out of the layout. The selected node is never
  // stacked, so it stays on the map.
  const dependencyStacks = useMemo(() => {
    if (
      !stackDependencies ||
      levelGraph.kind !== 'graph' ||
      levelGraph.nodes.length <= APPLICATION_MAP_CONSTANTS.DEPENDENCY_STACK_THRESHOLD
    ) {
      return { stackIdByNodeId: new Map<string, string>(), stackedNodes: 0, stacks: 0 };
    }
    return computeDependencyStacks(
      levelGraph.nodes,
      levelGraph.edges,
      new Set(selectedNodeId ? [selectedNodeId] : [])
    );
  }, [stackDependencies, levelGraph, selectedNodeId]);

  // Node overlay: metric values applied on top of the structural graph.
  // Recomputes on metric ticks but leaves edges (layout inputs) untouched.
  const celestialNodes = useMemo(() => {
    if (levelGraph.kind === 'application') {
      const aggregatedNode = createAggregatedApplicationNode(
        nodes,
        metricsMap,
        pendingNodeIds,
        groupTotals
      );
      return aggregatedNode ? [aggregatedNode] : [];
    }
    if (levelGraph.kind === 'groupBy') {
      return createGroupByNodes(
        nodes,
        metricsMap,
        navigationState.groupByAttribute!,
        pendingNodeIds,
        groupTotals
      );
    }
    const built = buildCelestialNodes(levelGraph.nodes, metricsMap, pendingNodeIds);
    if (dependencyStacks.stacks === 0) return built;
    // The topology package folds nodes sharing an aggregatedNodeId into one expandable stack.
    return built.map((node) => {
      const stackId = dependencyStacks.stackIdByNodeId.get(node.id);
      return stackId ? { ...node, data: { ...node.data, aggregatedNodeId: stackId } } : node;
    });
  }, [
    levelGraph,
    nodes,
    metricsMap,
    pendingNodeIds,
    groupTotals,
    navigationState.groupByAttribute,
    dependencyStacks,
  ]);

  // Edge overlay: selection styling applied on top of the structural edges.
  // Recomputes only when the selected edge changes, never rebuilding nodes.
  const celestialEdges = useMemo(() => {
    if (levelGraph.kind !== 'graph') return [];
    return buildCelestialEdges(levelGraph.edges, selectedEdge?.edgeId || null);
  }, [levelGraph, selectedEdge?.edgeId]);

  // Above the cap the graph switches to a guidance notice instead of laying out
  // hundreds of nodes (dagre is O(N+E) and re-runs on interaction).
  // Stacked dependencies are not laid out, so only the visible nodes count against the cap.
  const visibleNodeCount =
    celestialNodes.length - dependencyStacks.stackedNodes + dependencyStacks.stacks;
  const exceedsRenderCap =
    levelGraph.kind === 'graph' && visibleNodeCount > APPLICATION_MAP_CONSTANTS.MAX_RENDERED_NODES;

  // At the environment grouping of a map too large to draw whole, say why it is grouped
  // (dismissible: it floats over the bottom of the map).
  const [groupedNoticeDismissed, setGroupedNoticeDismissed] = useState(false);
  const [stacksNoticeDismissed, setStacksNoticeDismissed] = useState(false);
  const showGroupedNotice = useMemo(
    () =>
      !groupedNoticeDismissed &&
      levelGraph.kind === 'groupBy' &&
      navigationState.groupByAttribute === ENVIRONMENT_GROUP_BY &&
      exceedsMapRenderCap(nodes, edges, stackDependencies),
    [
      groupedNoticeDismissed,
      levelGraph.kind,
      navigationState.groupByAttribute,
      nodes,
      edges,
      stackDependencies,
    ]
  );

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      filters.faultRateThresholds.length > 0 ||
      filters.errorRateThresholds.length > 0 ||
      filters.environments.length > 0 ||
      filters.searchQuery.trim() !== ''
    );
  }, [filters]);

  // Compute focused node IDs based on filters (for fading non-matching nodes)
  const matchedNodes = useMemo(() => {
    // Application level doesn't use focus
    if (navigationState.level === 'application') {
      return undefined;
    }

    // If an edge is selected, focus on its source and target nodes
    if (selectedEdgeNodeIds && selectedEdgeNodeIds.length > 0) {
      const edgeNodes = celestialNodes.filter((n) => selectedEdgeNodeIds.includes(n.id));
      // If filters are also active, combine filter matches with edge nodes
      if (hasActiveFilters) {
        const filterMatchingNodes =
          navigationState.level === 'groupBy' && navigationState.groupByAttribute
            ? getFilterMatchingGroupNodes()
            : getFilterMatchingNodes();
        // Combine filter matches with edge nodes (use Set to avoid duplicates)
        const combinedIds = new Set([
          ...filterMatchingNodes.map((n) => n.id),
          ...edgeNodes.map((n) => n.id),
        ]);
        return celestialNodes.filter((n) => combinedIds.has(n.id));
      }
      return edgeNodes;
    }

    // If no filters are active and no edge selected, return undefined (no focus mode)
    if (!hasActiveFilters) {
      return undefined;
    }

    // Use group-level filtering when at groupBy level
    if (navigationState.level === 'groupBy' && navigationState.groupByAttribute) {
      return getFilterMatchingGroupNodes();
    }

    return getFilterMatchingNodes();

    // Helper function to get filter-matching group nodes (aggregate metrics per group)
    function getFilterMatchingGroupNodes() {
      const groupByAttribute = navigationState.groupByAttribute!;

      // Group raw nodes by the active groupBy attribute
      const groups = new Map<string, ServiceMapNode[]>();
      nodes.forEach((node) => {
        const attrValue = getNodeGroupValue(node, groupByAttribute);
        if (attrValue) {
          if (!groups.has(attrValue)) {
            groups.set(attrValue, []);
          }
          groups.get(attrValue)!.push(node);
        }
      });

      // Filter groups based on aggregate metrics
      const matchingGroupIds: string[] = [];

      groups.forEach((groupNodes, groupValue) => {
        // Aggregate metrics for this group
        const { totalRequests, totalFaults, totalErrors } = sumGroupMetrics(
          groupNodes,
          metricsMap,
          pendingNodeIds,
          groupTotals,
          groupValue
        );

        let matches = true;

        // Apply fault rate threshold filter on aggregate
        if (filters.faultRateThresholds.length > 0) {
          const faultRate = totalRequests > 0 ? (totalFaults / totalRequests) * 100 : 0;
          const faultMatch = filters.faultRateThresholds.some((threshold) =>
            matchesErrorRateThreshold(faultRate, threshold)
          );
          if (!faultMatch) matches = false;
        }

        // Apply error rate threshold filter on aggregate
        if (matches && filters.errorRateThresholds.length > 0) {
          const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
          const errorMatch = filters.errorRateThresholds.some((threshold) =>
            matchesErrorRateThreshold(errorRate, threshold)
          );
          if (!errorMatch) matches = false;
        }

        // Apply environment filter: include group if ANY member matches
        if (matches && filters.environments.length > 0) {
          const selectedDisplayNames = new Set(
            filters.environments.map((env) => getEnvironmentDisplayName(env))
          );
          const envMatch = groupNodes.some((node) => {
            const nodeEnvDisplayName = getEnvironmentDisplayName(node.KeyAttributes.Environment);
            return selectedDisplayNames.has(nodeEnvDisplayName);
          });
          if (!envMatch) matches = false;
        }

        // Apply search filter: match against group value name
        if (matches && filters.searchQuery.trim()) {
          const query = filters.searchQuery.toLowerCase();
          if (!groupValue.toLowerCase().includes(query)) matches = false;
        }

        if (matches) {
          matchingGroupIds.push(`group-${groupValue}`);
        }
      });

      const matchingIds = new Set(matchingGroupIds);
      return celestialNodes.filter((n) => matchingIds.has(n.id));
    }

    // Helper function to get filter-matching nodes
    function getFilterMatchingNodes() {
      // Start with all nodes and progressively filter
      let matchingNodes = [...nodes];

      // Apply fault rate (5xx) threshold filter
      if (filters.faultRateThresholds.length > 0) {
        matchingNodes = matchingNodes.filter((node) => {
          const nodeId = `${node.KeyAttributes.Name}::${node.KeyAttributes.Environment}`;
          const metrics = metricsMap.get(nodeId);
          // If no metrics, include the node (don't filter it out)
          if (!metrics) return true;
          // Calculate fault rate (5xx) as percentage
          const faultRate =
            metrics.totalRequests > 0 ? (metrics.totalFaults / metrics.totalRequests) * 100 : 0;
          return filters.faultRateThresholds.some((threshold) =>
            matchesErrorRateThreshold(faultRate, threshold)
          );
        });
      }

      // Apply error rate (4xx) threshold filter
      if (filters.errorRateThresholds.length > 0) {
        matchingNodes = matchingNodes.filter((node) => {
          const nodeId = `${node.KeyAttributes.Name}::${node.KeyAttributes.Environment}`;
          const metrics = metricsMap.get(nodeId);
          // If no metrics, include the node (don't filter it out)
          if (!metrics) return true;
          // Calculate error rate (4xx) as percentage
          const errorRate =
            metrics.totalRequests > 0 ? (metrics.totalErrors / metrics.totalRequests) * 100 : 0;
          return filters.errorRateThresholds.some((threshold) =>
            matchesErrorRateThreshold(errorRate, threshold)
          );
        });
      }

      // Apply environment filter (compare display names)
      if (filters.environments.length > 0) {
        // Get the display names of selected environments for comparison
        const selectedDisplayNames = new Set(
          filters.environments.map((env) => getEnvironmentDisplayName(env))
        );
        matchingNodes = matchingNodes.filter((node) => {
          const nodeEnvDisplayName = getEnvironmentDisplayName(node.KeyAttributes.Environment);
          return selectedDisplayNames.has(nodeEnvDisplayName);
        });
      }

      // Apply search filter
      if (filters.searchQuery.trim()) {
        const query = filters.searchQuery.toLowerCase();
        matchingNodes = matchingNodes.filter((node) => node.Name.toLowerCase().includes(query));
      }

      // Build the set of matching node IDs
      const matchingNodeIds = new Set(matchingNodes.map((n) => n.NodeId));

      // Return celestial nodes that match the filters
      return celestialNodes.filter((n) => matchingNodeIds.has(n.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    nodes,
    filters,
    metricsMap,
    groupTotals,
    hasActiveFilters,
    navigationState.level,
    celestialNodes,
    selectedEdgeNodeIds,
  ]);

  // The topology package treats an empty focus list as "no filter" and shows every node at full
  // strength, which made a filter that matches nothing (e.g. Error rate > 5% on a healthy view)
  // look broken. Focus a placeholder instead, so every node fades, and say so.
  const noFilterMatches = matchedNodes?.length === 0;
  const nodesInFocus = useMemo(
    () => (noFilterMatches ? [NO_MATCH_FOCUS_NODE] : matchedNodes),
    [noFilterMatches, matchedNodes]
  );

  // Handle node dashboard click (View insights)
  const handleDashboardClick = useCallback(
    (node: CelestialCardProps) => {
      const keyAttrs = (node as any).keyAttributes || {};
      onNodeClick(node.id, keyAttrs.Name || node.title, keyAttrs.Environment || 'generic:default');
    },
    [onNodeClick]
  );

  // Handle breadcrumb addition (triggered by clicking or pressing Enter on a group node in CelestialMap)
  const handleAddBreadcrumb = useCallback(
    (title: string, node?: CelestialCardProps) => {
      // GUARD: If groupBy filter is active but navigation state hasn't synced yet,
      // ignore the call to prevent race conditions.
      if (filters.groupBy && navigationState.level === 'application') {
        return;
      }

      // Handle drill-down from application level (no groupBy active)
      if (node?.isGroup && navigationState.level === 'application') {
        // Too many nodes to lay out at once: open the map grouped by environment instead of
        // the "too many services" notice, so every service stays one click away.
        if (onFiltersChange && exceedsMapRenderCap(nodes, edges, stackDependencies)) {
          onFiltersChange({ ...filters, groupBy: ENVIRONMENT_GROUP_BY });
          return;
        }
        onNavigationStateChange({
          level: 'services',
          breadcrumbs: [
            { id: 'application', label: i18nTexts.navigation.application },
            { id: 'services', label: i18nTexts.navigation.services },
          ],
          groupByAttribute: null,
          groupByValue: null,
        });
        return;
      }

      // Handle drill-down from groupBy level to groupByValue level
      if (node?.isGroup && navigationState.level === 'groupBy') {
        const groupByValue = (node as any).keyAttributes?.groupByValue || node.title;
        onNavigationStateChange({
          level: 'groupByValue',
          breadcrumbs: [
            ...navigationState.breadcrumbs,
            { id: `group-${groupByValue}`, label: groupByValue },
          ],
          groupByAttribute: navigationState.groupByAttribute,
          groupByValue,
        });
      }
    },
    [
      filters,
      navigationState,
      onNavigationStateChange,
      onFiltersChange,
      nodes,
      edges,
      stackDependencies,
    ]
  );

  // Handle edge click - show metrics flyout
  const handleEdgeClick = useCallback(
    (edge: CelestialEdge) => {
      if (!onEdgeSelect) return;

      // If clicking the same edge, deselect it
      if (selectedEdge?.edgeId === edge.id) {
        onEdgeSelect(null);
        return;
      }

      // Find source/target service info from nodeIdToServiceInfo map
      const sourceInfo = nodeIdToServiceInfo.get(edge.source);
      const targetInfo = nodeIdToServiceInfo.get(edge.target);

      if (sourceInfo && targetInfo) {
        onEdgeSelect({
          edgeId: edge.id,
          sourceService: sourceInfo.serviceName,
          sourceEnvironment: sourceInfo.environment,
          targetService: targetInfo.serviceName,
          sourceNodeId: edge.source,
          targetNodeId: edge.target,
          sourceNodeType: sourceInfo.type,
          targetNodeType: targetInfo.type,
          targetEnvironment: targetInfo.environment,
        });
      }
    },
    [onEdgeSelect, selectedEdge?.edgeId, nodeIdToServiceInfo]
  );

  // Handle click on map background to deselect edge
  const handleMapClick = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement;
      // ReactFlow pane has class 'react-flow__pane' - clicking on it should deselect
      if (target.classList.contains('react-flow__pane') && onEdgeSelect) {
        onEdgeSelect(null);
      }
    },
    [onEdgeSelect]
  );

  // Handle keyboard events - Escape key deselects edge
  const handleMapKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape' && onEdgeSelect) {
        onEdgeSelect(null);
      }
    },
    [onEdgeSelect]
  );

  // Compute breadcrumbs based on navigation state
  const breadcrumbs: Breadcrumb[] = useMemo(() => {
    // Application breadcrumb node (used at all levels)
    const applicationNode = {
      id: 'application-root',
      title: i18nTexts.navigation.application,
      icon: getIcon('Generic'),
      keyAttributes: {},
    };

    if (navigationState.level === 'application') {
      // Root level - show "Application"
      return [{ title: i18nTexts.navigation.application, node: applicationNode }];
    }

    if (navigationState.level === 'groupBy' && navigationState.groupByAttribute) {
      // Group by level - show "groupByAttribute"
      const groupByNode = {
        id: 'groupBy',
        title: navigationState.groupByAttribute,
        icon: getIcon('Generic'),
        keyAttributes: {},
      };
      return [{ title: navigationState.groupByAttribute, node: groupByNode }];
    }

    if (
      navigationState.level === 'groupByValue' &&
      navigationState.groupByAttribute &&
      navigationState.groupByValue
    ) {
      // Group by value level - show "groupByAttribute > groupByValue"
      const groupByNode = {
        id: 'groupBy',
        title: navigationState.groupByAttribute,
        icon: getIcon('Generic'),
        keyAttributes: {},
      };
      const groupValueNode = {
        id: `group-${navigationState.groupByValue}`,
        title: navigationState.groupByValue,
        icon: getIcon('Generic'),
        keyAttributes: { groupByValue: navigationState.groupByValue },
      };
      return [
        { title: navigationState.groupByAttribute, node: groupByNode },
        { title: navigationState.groupByValue, node: groupValueNode },
      ];
    }

    // Services level - show "Application > Services"
    const servicesNode = {
      id: 'services',
      title: i18nTexts.navigation.services,
      icon: getIcon('Generic'),
      keyAttributes: {},
    };
    return [
      { title: i18nTexts.navigation.application, node: applicationNode },
      { title: i18nTexts.navigation.services, node: servicesNode },
    ];
  }, [navigationState]);

  // Handle breadcrumb click for navigation
  const handleBreadcrumbClick = useCallback(
    (breadcrumb: Breadcrumb, index: number) => {
      // GUARD: If groupBy filter is active but navigation state hasn't synced yet,
      // ignore the breadcrumb click to prevent race conditions.
      // This can happen when CelestialMap fires onBreadcrumbClick during prop transitions.
      if (filters.groupBy && navigationState.level === 'application') {
        // groupBy is set but navigation hasn't updated yet - ignore this call
        return;
      }

      // Clicking first breadcrumb at groupBy/groupByValue level - return to groupBy level (with filter still active)
      if (
        index === 0 &&
        (navigationState.level === 'groupBy' || navigationState.level === 'groupByValue') &&
        navigationState.groupByAttribute
      ) {
        onNavigationStateChange({
          level: 'groupBy',
          breadcrumbs: [{ id: 'groupBy', label: navigationState.groupByAttribute }],
          groupByAttribute: navigationState.groupByAttribute,
          groupByValue: null,
        });
        return;
      }

      // Navigate to application level - only when no groupBy filter is active
      if (
        index === 0 &&
        (navigationState.level === 'application' || navigationState.level === 'services') &&
        !filters.groupBy
      ) {
        onNavigationStateChange({
          level: 'application',
          breadcrumbs: [],
          groupByAttribute: null,
          groupByValue: null,
        });
      }
    },
    [onNavigationStateChange, filters, navigationState]
  );

  // The map's notices: in the page's banner slot when given, else over the bottom of the map
  // (clear of the breadcrumb at the top-left and the controls on the right).
  const hasNotices =
    noFilterMatches || showGroupedNotice || (dependencyStacks.stacks > 0 && !stacksNoticeDismissed);
  const noticeList = (
    <>
      {noFilterMatches && (
        <EuiCallOut
          size="s"
          iconType="filter"
          color="warning"
          title={i18nTexts.filters.noMatches}
          data-test-subj="serviceMapNoFilterMatches"
        />
      )}
      {showGroupedNotice && (
        <EuiCallOut
          size="s"
          iconType="iInCircle"
          title={i18nTexts.largeMap.groupedTitle}
          data-test-subj="largeMapGroupedNotice"
          dismissible
          onDismiss={() => setGroupedNoticeDismissed(true)}
        >
          <p>
            {i18nTexts.largeMap.groupedBody(
              nodes.length,
              APPLICATION_MAP_CONSTANTS.MAX_RENDERED_NODES
            )}
          </p>
        </EuiCallOut>
      )}
      {dependencyStacks.stacks > 0 && !stacksNoticeDismissed && (
        <EuiCallOut
          size="s"
          iconType="iInCircle"
          title={i18nTexts.dependencyStacks.title}
          data-test-subj="dependencyStacksNotice"
          dismissible
          onDismiss={() => setStacksNoticeDismissed(true)}
        >
          <p>
            {i18nTexts.dependencyStacks.body(
              dependencyStacks.stackedNodes,
              dependencyStacks.stacks,
              APPLICATION_MAP_CONSTANTS.DEPENDENCY_STACK_THRESHOLD
            )}
          </p>
          {onShowDependenciesIndividually && (
            <EuiButtonEmpty
              size="xs"
              flush="left"
              onClick={onShowDependenciesIndividually}
              data-test-subj="showDependenciesIndividually"
            >
              {i18nTexts.dependencyStacks.showIndividually}
            </EuiButtonEmpty>
          )}
        </EuiCallOut>
      )}
    </>
  );
  const notices = !hasNotices ? null : noticesContainer ? (
    createPortal(
      <div data-test-subj="serviceMapNotices" className="apmMapNotices">
        {noticeList}
      </div>,
      noticesContainer
    )
  ) : (
    <div
      data-test-subj="serviceMapNotices"
      style={{
        position: 'absolute',
        bottom: 8,
        left: 8,
        right: 64,
        zIndex: 5,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {noticeList}
    </div>
  );

  // Initial load only: show the full spinner while there is nothing to draw yet.
  // On a refetch (time-range change, chart brush, refresh) keep the current map
  // mounted and show a progress bar instead — swapping in the spinner unmounts
  // CelestialMap, which flashes the page and re-runs layout from scratch.
  if (isLoading && celestialNodes.length === 0) {
    return (
      <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: 400 }}>
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner size="xl" />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  // Empty state
  if (celestialNodes.length === 0) {
    return (
      <EuiEmptyPrompt
        iconType="navAiFlow"
        title={<h2>{i18nTexts.empty.title}</h2>}
        body={<p>{i18nTexts.empty.body}</p>}
      />
    );
  }

  // Too-large state: guide the user to narrow the selection instead of
  // laying out more nodes than the map can render responsively.
  if (exceedsRenderCap) {
    return (
      <EuiEmptyPrompt
        iconType="alert"
        title={<h2>{i18nTexts.largeMap.tooManyTitle}</h2>}
        body={
          <p>
            {i18nTexts.largeMap.tooManyBody(
              visibleNodeCount,
              APPLICATION_MAP_CONSTANTS.MAX_RENDERED_NODES
            )}
          </p>
        }
        actions={
          onFiltersChange && filters.groupBy !== ENVIRONMENT_GROUP_BY ? (
            <EuiButton
              size="s"
              onClick={() => onFiltersChange({ ...filters, groupBy: ENVIRONMENT_GROUP_BY })}
              data-test-subj="serviceMapGroupByEnvironment"
            >
              {i18nTexts.largeMap.groupByEnvironment}
            </EuiButton>
          ) : undefined
        }
      />
    );
  }

  return (
    <EuiPanel paddingSize="s" style={{ height: '100%', position: 'relative' }}>
      {isLoading && (
        <EuiProgress
          size="xs"
          color="accent"
          position="absolute"
          data-test-subj="serviceMapRefetchProgress"
        />
      )}
      {notices}
      {/* CelestialMap - click/keyboard handlers for deselecting edges */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="region"
        aria-label="Service map"
        tabIndex={0}
        style={{
          width: '100%',
          height: '100%',
          minHeight: APPLICATION_MAP_CONSTANTS.MAP_MIN_HEIGHT,
          outline: 'none',
        }}
        onClick={handleMapClick}
        onKeyDown={handleMapKeyDown}
      >
        <CelestialMap
          map={{
            root: {
              nodes: celestialNodes,
              edges: celestialEdges,
            },
          }}
          breadcrumbs={breadcrumbs}
          onBreadcrumbClick={handleBreadcrumbClick}
          onDashboardClick={handleDashboardClick}
          onEdgeClick={handleEdgeClick}
          addBreadcrumb={handleAddBreadcrumb}
          nodesInFocus={nodesInFocus}
          selectedNodeId={selectedNodeId || undefined}
          layoutOptions={visibleNodeCount > COMPACT_LAYOUT_MIN_NODES ? COMPACT_LAYOUT : undefined}
          fitViewOptions={fitAll ? FIT_ALL_VIEW_OPTIONS : undefined}
          // Re-fit when the panel narrows (e.g. the details flyout opens next to a focused view).
          refitOnResize={fitAll}
        />
      </div>
    </EuiPanel>
  );
};

const NO_PENDING_NODES: Set<string> = new Set();

/** Fit-to-view that may zoom out far enough to show every node (see `fitAll`). */
const FIT_ALL_VIEW_OPTIONS = { minZoom: 0.2, maxZoom: 1, padding: 0.15 };

/**
 * Totals for a group of nodes (or the whole map, ALL_GROUPS_KEY): from the per-group queries
 * when the page provides them (null while they load), else summed from the nodes' metrics.
 */
function sumGroupMetrics(
  groupNodes: ServiceMapNode[],
  metricsMap: Map<string, ServiceMapNodeMetrics>,
  pendingNodeIds: Set<string>,
  groupTotals: Map<string, GroupTotals> | null | undefined,
  groupKey: string
): GroupTotals & { pending: boolean } {
  if (groupTotals !== undefined) {
    const totals = groupTotals?.get(groupKey);
    return {
      totalRequests: totals?.totalRequests ?? 0,
      totalFaults: totals?.totalFaults ?? 0,
      totalErrors: totals?.totalErrors ?? 0,
      pending: groupTotals === null,
    };
  }
  const sum = { totalRequests: 0, totalFaults: 0, totalErrors: 0, pending: false };
  groupNodes.forEach((node) => {
    const nodeId = `${node.KeyAttributes.Name}::${node.KeyAttributes.Environment}`;
    if (pendingNodeIds.has(nodeId)) sum.pending = true;
    const metrics = metricsMap.get(nodeId);
    if (metrics) {
      sum.totalRequests += metrics.totalRequests;
      sum.totalFaults += metrics.totalFaults;
      sum.totalErrors += metrics.totalErrors;
    }
  });
  return sum;
}

/** Focus placeholder matching no node: fades the whole map when the filters match nothing. */
const NO_MATCH_FOCUS_NODE = {
  id: '__apmNoFilterMatch__',
  type: 'celestialNode' as const,
  position: { x: 0, y: 0 },
  data: { id: '__apmNoFilterMatch__', title: '', keyAttributes: {} },
} as CelestialMapNode;

/**
 * Tighter spacing for larger maps. The default layout reserves 156px per card plus a 100px gap
 * (cards are ~96-120px tall), which spreads a few hundred services across mostly empty space.
 * Small maps keep the default look.
 */
const COMPACT_LAYOUT_MIN_NODES = 40;
const COMPACT_LAYOUT = { nodeHeight: 120, nodeSeparation: 30, rankSeparation: 140 };

/** Shown in a node's donut while its metrics are loading. */
const NODE_LOADING_ICON = (
  <EuiLoadingSpinner size="l" data-test-subj="serviceMapNodeMetricsLoading" />
);

/**
 * Create an aggregated application node representing all services
 */
function createAggregatedApplicationNode(
  nodes: ServiceMapNode[],
  metricsMap: Map<string, ServiceMapNodeMetrics>,
  pendingNodeIds: Set<string>,
  groupTotals: Map<string, GroupTotals> | null | undefined
): CelestialMapNode | null {
  if (nodes.length === 0) return null;

  // Aggregate metrics from all services
  const { totalRequests, totalFaults, totalErrors, pending } = sumGroupMetrics(
    nodes,
    metricsMap,
    pendingNodeIds,
    groupTotals,
    ALL_GROUPS_KEY
  );

  // Calculate aggregated health status
  const failureRate = totalRequests > 0 ? ((totalFaults + totalErrors) / totalRequests) * 100 : 0;
  const healthStatus = getHealthStatus(failureRate);

  return {
    id: 'application-root',
    type: 'celestialNode',
    position: { x: 0, y: 0 },
    data: {
      id: 'application-root',
      title: i18nTexts.navigation.application,
      // Totals are partial until every node's batch has landed.
      icon: pending ? NODE_LOADING_ICON : getIcon('Generic'),
      isGroup: true,
      keyAttributes: {},
      isInstrumented: true,
      numberOfServices: String(nodes.length),
      health: {
        breached: healthStatus === 'breached' ? 1 : 0,
        recovered: healthStatus === 'recovered' ? 1 : 0,
        total: 1,
        status: healthStatus,
      },
      metrics: {
        requests: Math.round(totalRequests),
        faults5xx: Math.round(totalFaults),
        errors4xx: Math.round(totalErrors),
      },
    },
  };
}

/**
 * Create group nodes from unique attribute values
 * Each group node represents all services sharing the same attribute value
 */
function createGroupByNodes(
  nodes: ServiceMapNode[],
  metricsMap: Map<string, ServiceMapNodeMetrics>,
  groupByAttribute: string,
  pendingNodeIds: Set<string>,
  groupTotals: Map<string, GroupTotals> | null | undefined
): CelestialMapNode[] {
  // Get unique values for the group by attribute
  const groupValues = new Map<string, ServiceMapNode[]>();

  nodes.forEach((node) => {
    const attrValue = getNodeGroupValue(node, groupByAttribute);
    if (attrValue) {
      if (!groupValues.has(attrValue)) {
        groupValues.set(attrValue, []);
      }
      groupValues.get(attrValue)!.push(node);
    }
  });

  // Create a group node for each unique value
  return Array.from(groupValues.entries()).map(([value, groupNodes]) => {
    // Aggregate metrics for all services in this group
    const {
      totalRequests,
      totalFaults,
      totalErrors,
      pending: groupPending,
    } = sumGroupMetrics(groupNodes, metricsMap, pendingNodeIds, groupTotals, value);

    return {
      id: `group-${value}`,
      type: 'celestialNode' as const,
      position: { x: 0, y: 0 },
      data: {
        id: `group-${value}`,
        title: value,
        icon: groupPending ? NODE_LOADING_ICON : getIcon('Generic'),
        isGroup: true,
        keyAttributes: { groupByValue: value },
        isInstrumented: true,
        numberOfServices: String(groupNodes.length),
        metrics: {
          requests: Math.round(totalRequests),
          faults5xx: Math.round(totalFaults),
          errors4xx: Math.round(totalErrors),
        },
      },
    };
  });
}

/**
 * Build CelestialMap nodes with metric values applied.
 */
function buildCelestialNodes(
  nodes: ServiceMapNode[],
  metricsMap: Map<string, ServiceMapNodeMetrics>,
  pendingNodeIds: Set<string>
): CelestialMapNode[] {
  return nodes.map((node) => {
    const serviceName = node.KeyAttributes.Name;
    const environment = node.KeyAttributes.Environment;
    const nodeId = `${serviceName}::${environment}`;
    const metrics = metricsMap.get(nodeId);

    const nodeType = node.KeyAttributes.Type;
    const iconType = getNodeIconType(nodeType, environment, serviceName);
    const subtitle = getNodeSubtitle(nodeType, environment);
    const failureRate = metrics
      ? ((metrics.totalFaults + metrics.totalErrors) / (metrics.totalRequests || 1)) * 100
      : 0;
    const healthStatus = getHealthStatus(failureRate);

    return {
      id: node.NodeId,
      type: 'celestialNode' as const,
      position: { x: 0, y: 0 }, // dagre layout calculates positions
      data: {
        id: node.NodeId,
        title: node.Name,
        subtitle,
        // While the node's metrics batch is in flight, the donut shows a spinner instead of
        // the type icon (its counts would otherwise read as a misleading 0).
        icon: pendingNodeIds.has(nodeId) ? NODE_LOADING_ICON : getIcon(iconType),
        isGroup: false,
        keyAttributes: node.KeyAttributes,
        groupByAttributes: node.GroupByAttributes,
        isInstrumented: true,
        health: {
          breached: healthStatus === 'breached' ? 1 : 0,
          recovered: healthStatus === 'recovered' ? 1 : 0,
          total: 1,
          status: healthStatus,
        },
        metrics: {
          requests: Math.round(metrics?.totalRequests || 0),
          faults5xx: Math.round(metrics?.totalFaults || 0),
          errors4xx: Math.round(metrics?.totalErrors || 0),
        },
      },
    };
  });
}

/**
 * Build CelestialMap edges with selection styling applied.
 */
function buildCelestialEdges(
  edges: ServiceMapEdge[],
  selectedEdgeId: string | null
): CelestialMapEdge[] {
  return edges.map((edge) => {
    const isSelected = edge.EdgeId === selectedEdgeId;

    return {
      id: edge.EdgeId,
      source: edge.SourceNodeId,
      target: edge.DestinationNodeId,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 15,
        height: 15,
      },
      // Add animation for selected edge (moving dashes effect)
      animated: isSelected,
      // DO NOT add selected: isSelected - this causes map reset
      style: isSelected ? { strokeWidth: 3, stroke: '#0077cc' } : undefined,
    };
  });
}

/**
 * Get health status based on failure rate
 * Note: Returns 'ok' always to hide SLI breach notification in CelestialMap
 * The health coloring is handled separately via metrics display
 */
function getHealthStatus(_failureRate: number): 'ok' | 'recovered' | 'breached' {
  // Return 'ok' always to hide SLI breach notification
  // CelestialMap shows "SLI breach" text when status is 'breached'
  return 'ok';
}

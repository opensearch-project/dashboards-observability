/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useCallback } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiLoadingSpinner,
  EuiEmptyPrompt,
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
  getPlatformTypeFromEnvironment,
  getEnvironmentDisplayName,
  APPLICATION_MAP_CONSTANTS,
} from '../../../common/constants';
import { matchesErrorRateThreshold } from '../filters';
import { applicationMapI18nTexts as i18nTexts } from '../../../pages/application_map/application_map_i18n';

export interface ServiceMapGraphProps {
  nodes: ServiceMapNode[];
  edges: ServiceMapEdge[];
  metricsMap: Map<string, ServiceMapNodeMetrics>;
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
}

/**
 * ServiceMapGraph - CelestialMap wrapper with transform logic
 *
 * Handles:
 * - Transforming PPL nodes/edges to CelestialMap format
 * - Hierarchical navigation (Application -> Services)
 * - Client-side filtering
 * - Node click/double-click interactions
 */
export const ServiceMapGraph: React.FC<ServiceMapGraphProps> = ({
  nodes,
  edges,
  metricsMap,
  filters,
  navigationState,
  onNavigationStateChange,
  onNodeClick,
  isLoading,
  selectedEdge,
  onEdgeSelect,
  selectedNodeId,
  selectedEdgeNodeIds,
  onFiltersChange: _onFiltersChange,
}) => {
  // Build a map from NodeId to service info for edge click handling
  const nodeIdToServiceInfo = useMemo(() => {
    const map = new Map<string, { serviceName: string; environment: string }>();
    nodes.forEach((node) => {
      map.set(node.NodeId, {
        serviceName: node.KeyAttributes.Name,
        environment: node.KeyAttributes.Environment,
      });
    });
    return map;
  }, [nodes]);

  // Transform ALL nodes to CelestialMap format based on navigation level
  const { celestialNodes, celestialEdges } = useMemo(() => {
    if (navigationState.level === 'application') {
      // Aggregated application view - single node representing all services
      const aggregatedNode = createAggregatedApplicationNode(nodes, metricsMap);
      return {
        celestialNodes: aggregatedNode ? [aggregatedNode] : [],
        celestialEdges: [],
      };
    }

    if (navigationState.level === 'groupBy' && navigationState.groupByAttribute) {
      // Group by attribute view - show group nodes for each unique value
      const groupNodes = createGroupByNodes(nodes, metricsMap, navigationState.groupByAttribute);
      return {
        celestialNodes: groupNodes,
        celestialEdges: [], // No edges between groups
      };
    }

    if (
      navigationState.level === 'groupByValue' &&
      navigationState.groupByAttribute &&
      navigationState.groupByValue
    ) {
      // Filter nodes to those matching the selected group value
      const filteredNodes = nodes.filter((node) => {
        const attrValue = node.GroupByAttributes?.[navigationState.groupByAttribute];
        return attrValue === navigationState.groupByValue;
      });

      // Get node IDs for edge filtering
      const filteredNodeIds = new Set(filteredNodes.map((n) => n.NodeId));

      // Filter edges to only those between filtered nodes
      const filteredEdges = edges.filter(
        (edge) =>
          filteredNodeIds.has(edge.SourceNodeId) && filteredNodeIds.has(edge.DestinationNodeId)
      );

      const transformed = transformToCelestialFormat(
        filteredNodes,
        filteredEdges,
        metricsMap,
        selectedEdge?.edgeId || null
      );
      return {
        celestialNodes: transformed.nodes,
        celestialEdges: transformed.edges,
      };
    }

    // Services view - transform all nodes (filtering handled by nodesInFocus)
    const transformed = transformToCelestialFormat(
      nodes,
      edges,
      metricsMap,
      selectedEdge?.edgeId || null
    );

    return {
      celestialNodes: transformed.nodes,
      celestialEdges: transformed.edges,
    };
  }, [nodes, edges, metricsMap, navigationState, selectedEdge?.edgeId]);

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
  const nodesInFocus = useMemo(() => {
    // Application level doesn't use focus
    if (navigationState.level === 'application') {
      return undefined;
    }

    // If an edge is selected, focus on its source and target nodes
    if (selectedEdgeNodeIds && selectedEdgeNodeIds.length > 0) {
      const edgeNodes = celestialNodes.filter((n) => selectedEdgeNodeIds.includes(n.id));
      // If filters are also active, combine filter matches with edge nodes
      if (hasActiveFilters) {
        const filterMatchingNodes = getFilterMatchingNodes();
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

    return getFilterMatchingNodes();

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
  }, [
    nodes,
    filters,
    metricsMap,
    hasActiveFilters,
    navigationState.level,
    celestialNodes,
    selectedEdgeNodeIds,
  ]);

  // Handle node dashboard click (View insights)
  const handleDashboardClick = useCallback(
    (node: CelestialCardProps) => {
      const keyAttrs = (node as any).keyAttributes || {};
      onNodeClick(node.id, keyAttrs.Name || node.title, keyAttrs.Environment || 'generic:default');
    },
    [onNodeClick]
  );

  // Handle breadcrumb addition (triggered by double-clicking group nodes in CelestialMap)
  const handleAddBreadcrumb = useCallback(
    (title: string, node?: CelestialCardProps) => {
      // GUARD: If groupBy filter is active but navigation state hasn't synced yet,
      // ignore the call to prevent race conditions.
      if (filters.groupBy && navigationState.level === 'application') {
        return;
      }

      // Handle drill-down from application level (no groupBy active)
      if (node?.isGroup && navigationState.level === 'application') {
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
    [filters.groupBy, navigationState, onNavigationStateChange]
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

  // Loading state
  if (isLoading) {
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
        iconType="graphApp"
        title={<h2>{i18nTexts.empty.title}</h2>}
        body={<p>{i18nTexts.empty.body}</p>}
      />
    );
  }

  return (
    <EuiPanel paddingSize="s" style={{ height: '100%', position: 'relative' }}>
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
        />
      </div>
    </EuiPanel>
  );
};

/**
 * Create an aggregated application node representing all services
 */
function createAggregatedApplicationNode(
  nodes: ServiceMapNode[],
  metricsMap: Map<string, ServiceMapNodeMetrics>
): CelestialMapNode | null {
  if (nodes.length === 0) return null;

  // Aggregate metrics from all services
  let totalRequests = 0;
  let totalFaults = 0;
  let totalErrors = 0;

  nodes.forEach((node) => {
    const nodeId = `${node.KeyAttributes.Name}::${node.KeyAttributes.Environment}`;
    const metrics = metricsMap.get(nodeId);
    if (metrics) {
      totalRequests += metrics.totalRequests;
      totalFaults += metrics.totalFaults;
      totalErrors += metrics.totalErrors;
    }
  });

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
      icon: getIcon('Generic'),
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
  groupByAttribute: string
): CelestialMapNode[] {
  // Get unique values for the group by attribute
  const groupValues = new Map<string, ServiceMapNode[]>();

  nodes.forEach((node) => {
    const attrValue = node.GroupByAttributes?.[groupByAttribute];
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
    let totalRequests = 0;
    let totalFaults = 0;
    let totalErrors = 0;

    groupNodes.forEach((node) => {
      const nodeId = `${node.KeyAttributes.Name}::${node.KeyAttributes.Environment}`;
      const metrics = metricsMap.get(nodeId);
      if (metrics) {
        totalRequests += metrics.totalRequests;
        totalFaults += metrics.totalFaults;
        totalErrors += metrics.totalErrors;
      }
    });

    return {
      id: `group-${value}`,
      type: 'celestialNode' as const,
      position: { x: 0, y: 0 },
      data: {
        id: `group-${value}`,
        title: value,
        icon: getIcon('Generic'),
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
 * Transform PPL nodes/edges to CelestialMap format
 */
function transformToCelestialFormat(
  nodes: ServiceMapNode[],
  edges: ServiceMapEdge[],
  metricsMap: Map<string, ServiceMapNodeMetrics>,
  selectedEdgeId: string | null
): { nodes: CelestialMapNode[]; edges: CelestialMapEdge[] } {
  const celestialNodes: CelestialMapNode[] = nodes.map((node) => {
    const serviceName = node.KeyAttributes.Name;
    const environment = node.KeyAttributes.Environment;
    const nodeId = `${serviceName}::${environment}`;
    const metrics = metricsMap.get(nodeId);

    const platformType = getPlatformTypeFromEnvironment(environment);
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
        subtitle: platformType,
        icon: getIcon(platformType),
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

  const celestialEdges: CelestialMapEdge[] = edges.map((edge) => {
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

  return { nodes: celestialNodes, edges: celestialEdges };
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

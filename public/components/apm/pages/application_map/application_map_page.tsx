/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
} from '@elastic/eui';
import { ChromeStart, NotificationsStart } from '../../../../../../../src/core/public';
import { useApmConfig } from '../../config/apm_config_context';
import { ApmSettingsModal } from '../../config/apm_settings_modal';
import { ApmEmptyState } from '../../common/apm_empty_state';
import { HeaderControlledComponentsWrapper } from '../../../../plugin_helpers/plugin_headerControl';
import { ApmPageHeader } from '../../shared/components/apm_page_header';
import { ActiveFilterBadges, FilterBadge } from '../../shared/components/active_filter_badges';
import { useServiceMap } from '../../shared/hooks/use_service_map';
import { useServiceMapMetrics } from '../../shared/hooks/use_service_map_metrics';
import { useSelectedEdgeMetrics } from '../../shared/hooks/use_selected_edge_metrics';
import { useGroupMetrics } from '../../shared/hooks/use_group_metrics';
import { parseTimeRange } from '../../shared/utils/time_utils';
import { navigateToServiceDetails } from '../../shared/utils/navigation_utils';
import {
  ServiceMapSidebar,
  ServiceMapGraph,
  ServiceDetailsPanel,
  EdgeMetricsFlyout,
} from '../../shared/components/service_map';
import {
  ApplicationMapFilters,
  MapNavigationState,
  SelectedNodeState,
  SelectedEdgeState,
  DEFAULT_FILTERS,
  DEFAULT_NAVIGATION_STATE,
} from '../../common/types/service_map_types';
import { TimeRange } from '../../common/types/service_types';
import {
  APPLICATION_MAP_CONSTANTS,
  THRESHOLD_LABELS,
  getEnvironmentDisplayName,
  getPlatformTypeFromEnvironment,
} from '../../common/constants';
import { applicationMapI18nTexts as i18nTexts } from './application_map_i18n';
import { LegacyBanner } from '../../shared/components/legacy_banner';
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
  /** Allowed characters for time range values (e.g., "now-15m", "2024-01-01T00:00:00Z") */
  TIME_RANGE_REGEX: /^[a-zA-Z0-9_\-:+.TZ]+$/,
};

/**
 * Sanitize URL parameter to prevent XSS attacks
 * @param value - Raw URL parameter value
 * @param type - Type of parameter for appropriate validation
 * @returns Sanitized value or null if invalid
 */
function sanitizeUrlParam(
  value: string | null,
  type: 'service' | 'environment' | 'time'
): string | null {
  if (!value) return null;

  // Check length limit
  if (value.length > URL_PARAM_VALIDATION.MAX_PARAM_LENGTH) {
    return null;
  }

  // Apply appropriate regex validation based on type
  const regex =
    type === 'time'
      ? URL_PARAM_VALIDATION.TIME_RANGE_REGEX
      : URL_PARAM_VALIDATION.SERVICE_NAME_REGEX;

  if (!regex.test(value)) {
    return null;
  }

  return value;
}

export interface ApplicationMapPageProps {
  chrome: ChromeStart;
  notifications: NotificationsStart;
  [key: string]: any;
}

/**
 * ApplicationMapPage - Main page for APM Application Map
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

  // Time range state
  const [timeRange, setTimeRange] = useState<TimeRange>(
    APPLICATION_MAP_CONSTANTS.DEFAULT_TIME_RANGE
  );

  // Filter state
  const [filters, setFilters] = useState<ApplicationMapFilters>(DEFAULT_FILTERS);

  // Navigation state for hierarchical view
  const [navigationState, setNavigationState] = useState<MapNavigationState>(
    DEFAULT_NAVIGATION_STATE
  );

  // Selected node state for details panel
  const [selectedNode, setSelectedNode] = useState<SelectedNodeState | null>(null);

  // Refresh trigger
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Selected edge state for popup
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdgeState | null>(null);

  // Ref to track if navigation was initialized from URL params
  const initializedFromUrlRef = useRef(false);

  // State for pending node selection from URL params (auto-select after data loads)
  const [pendingNodeSelection, setPendingNodeSelection] = useState<{
    serviceName: string;
    environment: string;
  } | null>(null);

  // Set page-level breadcrumb
  useEffect(() => {
    chrome?.setBreadcrumbs([{ text: i18nTexts.breadcrumb, href: '#/application-map' }]);
  }, [chrome]);

  // Parse URL parameters on mount to support deep-linking from Services Home
  useEffect(() => {
    const hashParts = window.location.hash.split('?');
    if (hashParts.length < 2) return;

    const params = new URLSearchParams(hashParts[1]);
    const serviceParam = sanitizeUrlParam(params.get('service'), 'service');
    const environmentParam = sanitizeUrlParam(params.get('environment'), 'environment');
    const fromParam = sanitizeUrlParam(params.get('from'), 'time');
    const toParam = sanitizeUrlParam(params.get('to'), 'time');

    // If service parameter exists and is valid, navigate to services level and queue node selection
    if (serviceParam) {
      // Mark that we initialized from URL to prevent groupBy effect from resetting
      initializedFromUrlRef.current = true;

      setNavigationState({
        level: 'services',
        breadcrumbs: [{ id: 'services', label: 'Services' }],
        groupByAttribute: null,
        groupByValue: null,
      });

      // Store pending selection - will be applied once nodes are loaded
      setPendingNodeSelection({
        serviceName: serviceParam,
        environment: environmentParam || 'generic:default',
      });
    }

    // Apply time range from URL if provided
    if (fromParam && toParam) {
      setTimeRange({ from: fromParam, to: toParam });
    }
  }, []); // Empty deps - run only on mount

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
  const parsedTimeRange = useMemo(() => parseTimeRange(timeRange), [timeRange]);

  // Fetch service map topology data
  const {
    nodes,
    edges,
    isLoading: mapLoading,
    error: mapError,
    availableGroupByAttributes,
    refetch: refetchMap,
  } = useServiceMap({
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
    refreshTrigger,
  });

  // Auto-select node from URL params once nodes are loaded
  useEffect(() => {
    if (!pendingNodeSelection || nodes.length === 0) return;

    const { serviceName, environment } = pendingNodeSelection;

    // Find the matching node by service name and environment
    const matchingNode = nodes.find(
      (n) => n.KeyAttributes.Name === serviceName && n.KeyAttributes.Environment === environment
    );

    if (matchingNode) {
      const platformType = getPlatformTypeFromEnvironment(environment);

      // Auto-select the node (this triggers the flyout to open)
      setSelectedNode({
        nodeId: matchingNode.NodeId,
        serviceName,
        environment,
        platformType,
        groupByAttributes: matchingNode.GroupByAttributes,
      });
    }

    // Clear pending selection (only attempt once)
    setPendingNodeSelection(null);
  }, [nodes, pendingNodeSelection]);

  // Build services list from nodes for metrics fetching
  const servicesList = useMemo(() => {
    return nodes.map((node) => ({
      serviceName: node.KeyAttributes.Name,
      environment: node.KeyAttributes.Environment,
    }));
  }, [nodes]);

  // Extract unique environments from nodes (sorted alphabetically by display name)
  const availableEnvironments = useMemo(() => {
    const envSet = new Set<string>();
    nodes.forEach((node) => {
      if (node.KeyAttributes.Environment) {
        envSet.add(node.KeyAttributes.Environment);
      }
    });
    return Array.from(envSet).sort((a, b) =>
      getEnvironmentDisplayName(a).localeCompare(getEnvironmentDisplayName(b))
    );
  }, [nodes]);

  // Fetch RED metrics for all services
  const { metricsMap, isLoading: metricsLoading, refetch: refetchMetrics } = useServiceMapMetrics({
    services: servicesList,
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
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

  // Handle groupBy filter changes - update navigation state
  useEffect(() => {
    if (filters.groupBy) {
      // Switch to groupBy level when attribute is selected
      setNavigationState({
        level: 'groupBy',
        breadcrumbs: [{ id: 'groupBy', label: filters.groupBy }],
        groupByAttribute: filters.groupBy,
        groupByValue: null,
      });
      // Clear URL initialization flag when user changes groupBy
      initializedFromUrlRef.current = false;
    } else if (!initializedFromUrlRef.current) {
      // Reset to application level when groupBy is cleared
      // Skip if we just initialized from URL params (to preserve services level)
      setNavigationState(DEFAULT_NAVIGATION_STATE);
    }
    // Clear selected node/edge when groupBy changes
    setSelectedNode(null);
    setSelectedEdge(null);
  }, [filters.groupBy]);

  // Combined loading state
  const isLoading = mapLoading || metricsLoading;

  // Handle time range change
  const handleTimeChange = useCallback((newTimeRange: TimeRange) => {
    setTimeRange(newTimeRange);
  }, []);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
    refetchMap();
    refetchMetrics();
    // Clear selected edge on refresh
    setSelectedEdge(null);
  }, [refetchMap, refetchMetrics]);

  // Handle filter changes
  const handleFiltersChange = useCallback((newFilters: ApplicationMapFilters) => {
    setFilters(newFilters);
  }, []);

  // Handle node click (View insights)
  const handleNodeClick = useCallback(
    (nodeId: string, serviceName: string, environment: string) => {
      // Close edge popup when viewing node details
      setSelectedEdge(null);

      // Check if this is a group node
      if (nodeId.startsWith('group-')) {
        const groupByValue = nodeId.replace('group-', '');

        setSelectedNode({
          nodeId,
          serviceName: groupByValue, // Use group value as title
          environment: 'group',
          platformType: 'Group',
          groupByAttributes: { [filters.groupBy || '']: groupByValue },
        });
        return;
      }

      const node = nodes.find((n) => n.NodeId === nodeId);
      const platformType = getPlatformTypeFromEnvironment(environment);

      setSelectedNode({
        nodeId,
        serviceName,
        environment,
        platformType,
        groupByAttributes: node?.GroupByAttributes,
      });
    },
    [nodes, filters.groupBy]
  );

  // Handle edge click (show metrics popup)
  const handleEdgeSelect = useCallback((edge: SelectedEdgeState | null) => {
    // Close service flyout when selecting an edge
    if (edge) {
      setSelectedNode(null);
    }
    setSelectedEdge(edge);
  }, []);

  // Handle view service details
  const handleViewServiceDetails = useCallback(
    (serviceName: string, environment: string) => {
      const node = nodes.find(
        (n) => n.KeyAttributes.Name === serviceName && n.KeyAttributes.Environment === environment
      );
      const language = node?.GroupByAttributes?.['telemetry.sdk.language'];

      navigateToServiceDetails(serviceName, environment, {
        timeRange,
        language,
      });
    },
    [nodes, timeRange]
  );

  // Close details panel
  const handleCloseDetailsPanel = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Get metrics for selected node
  const selectedNodeMetrics = useMemo(() => {
    if (!selectedNode) return null;

    // For group nodes, use the fetched group metrics from Prometheus
    if (selectedNode.nodeId.startsWith('group-')) {
      return groupMetrics;
    }

    // For the application root node, aggregate metrics from all services
    if (selectedNode.nodeId === 'application-root') {
      let totalRequests = 0;
      let totalFaults = 0;
      let totalErrors = 0;

      metricsMap.forEach((metrics) => {
        totalRequests += metrics.totalRequests;
        totalFaults += metrics.totalFaults;
        totalErrors += metrics.totalErrors;
      });

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
  }, [selectedNode, metricsMap, groupMetrics]);

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
  }, [filters]);

  // Clear all filters
  const handleClearAllFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

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
            />

            {/* Active filter badges */}
            {activeFilters.length > 0 && (
              <>
                <EuiSpacer size="s" />
                <ActiveFilterBadges
                  filters={activeFilters}
                  onClearAll={handleClearAllFilters}
                  disabled={isLoading}
                />
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
                      isLoading={isLoading}
                      onToggle={() => togglePanel('filter-sidebar', { direction: 'left' })}
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
                      nodes={nodes}
                      edges={edges}
                      metricsMap={metricsMap}
                      filters={filters}
                      navigationState={navigationState}
                      onNavigationStateChange={setNavigationState}
                      onNodeClick={handleNodeClick}
                      isLoading={isLoading}
                      selectedEdge={selectedEdge}
                      onEdgeSelect={handleEdgeSelect}
                      selectedNodeId={selectedNode?.nodeId}
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
      {selectedNode && config?.prometheusDataSource?.id && (
        <ServiceDetailsPanel
          node={selectedNode}
          metrics={selectedNodeMetrics}
          isLoading={isGroupNode ? groupMetricsLoading : metricsLoading}
          timeRange={timeRange}
          prometheusConnectionId={config.prometheusDataSource.id}
          onClose={handleCloseDetailsPanel}
          onViewDetails={handleViewServiceDetails}
          refreshTrigger={refreshTrigger}
        />
      )}

      {/* Edge Metrics Flyout */}
      {selectedEdge && (
        <EdgeMetricsFlyout
          selectedEdge={selectedEdge}
          metrics={selectedEdgeMetrics}
          isLoading={edgeMetricsLoading}
          onClose={() => setSelectedEdge(null)}
        />
      )}

      {/* Settings Modal */}
      {isSettingsModalVisible && (
        <ApmSettingsModal onClose={handleModalClose} notifications={notifications} />
      )}
    </EuiPage>
  );
};

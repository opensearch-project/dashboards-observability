/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';

/**
 * i18n texts for Topology Map page
 */
export const applicationMapI18nTexts = {
  breadcrumb: i18n.translate('observability.apm.applicationMap.breadcrumb', {
    defaultMessage: 'Topology Map',
  }),

  // Page header
  pageTitle: i18n.translate('observability.apm.applicationMap.pageTitle', {
    defaultMessage: 'Topology Map',
  }),
  // On the map the search finds matches in what is on screen (zooms to them, others fade);
  // Focus on (any service) is what moves the map.
  searchPlaceholder: i18n.translate('observability.apm.applicationMap.search.placeholder', {
    defaultMessage: 'Find in this view by service or environment',
  }),
  // At the Application level (one card) there is nothing to find.
  searchDisabledPlaceholder: i18n.translate(
    'observability.apm.applicationMap.search.disabledPlaceholder',
    { defaultMessage: 'Open an environment to find services' }
  ),

  // Navigation breadcrumbs
  navigation: {
    world: i18n.translate('observability.apm.applicationMap.navigation.world', {
      defaultMessage: 'World',
    }),
    application: i18n.translate('observability.apm.applicationMap.navigation.application', {
      defaultMessage: 'Application',
    }),
    services: i18n.translate('observability.apm.applicationMap.navigation.services', {
      defaultMessage: 'Services',
    }),
  },

  // Filter sidebar
  filters: {
    title: i18n.translate('observability.apm.applicationMap.filters.title', {
      defaultMessage: 'Filters',
    }),
    toggleAriaLabel: i18n.translate('observability.apm.applicationMap.filters.toggleAriaLabel', {
      defaultMessage: 'Toggle filter sidebar',
    }),
    noMatches: i18n.translate('observability.apm.applicationMap.filters.noMatches', {
      defaultMessage: 'No nodes in this view match the selected filters',
    }),
    groupBy: i18n.translate('observability.apm.applicationMap.filters.groupBy', {
      defaultMessage: 'Group by',
    }),
    includeDependencies: i18n.translate(
      'observability.apm.applicationMap.filters.includeDependencies',
      { defaultMessage: 'Include external dependencies' }
    ),
    noGrouping: i18n.translate('observability.apm.applicationMap.filters.noGrouping', {
      defaultMessage: 'No grouping',
    }),
    faultRate: i18n.translate('observability.apm.applicationMap.filters.faultRate', {
      defaultMessage: 'Fault Rate (5xx)',
    }),
    errorRate: i18n.translate('observability.apm.applicationMap.filters.errorRate', {
      defaultMessage: 'Error Rate (4xx)',
    }),
    environment: i18n.translate('observability.apm.applicationMap.filters.environment', {
      defaultMessage: 'Environment',
    }),
    selectAll: i18n.translate('observability.apm.applicationMap.filters.selectAll', {
      defaultMessage: 'Select all',
    }),
    clearAll: i18n.translate('observability.apm.applicationMap.filters.clearAll', {
      defaultMessage: 'Clear all',
    }),
    showLess: i18n.translate('observability.apm.applicationMap.filters.showLess', {
      defaultMessage: 'Show less',
    }),
    showMore: (count: number) =>
      i18n.translate('observability.apm.applicationMap.filters.showMore', {
        defaultMessage: '+{count} more',
        values: { count },
      }),
    noMatchingValues: i18n.translate('observability.apm.applicationMap.filters.noMatchingValues', {
      defaultMessage: 'No matching values',
    }),
    noEnvironments: i18n.translate('observability.apm.applicationMap.filters.noEnvironments', {
      defaultMessage: 'No environments available',
    }),
    loadingEnvironments: i18n.translate(
      'observability.apm.applicationMap.filters.loadingEnvironments',
      {
        defaultMessage: 'Loading environments…',
      }
    ),
  },

  // Service details panel
  detailsPanel: {
    title: i18n.translate('observability.apm.applicationMap.detailsPanel.title', {
      defaultMessage: 'Service Details',
    }),
    viewDetails: i18n.translate('observability.apm.applicationMap.detailsPanel.viewDetails', {
      defaultMessage: 'View details',
    }),
    health: i18n.translate('observability.apm.applicationMap.detailsPanel.health', {
      defaultMessage: 'Health',
    }),
    metrics: i18n.translate('observability.apm.applicationMap.detailsPanel.metrics', {
      defaultMessage: 'Metrics',
    }),
    errorRate: i18n.translate('observability.apm.applicationMap.detailsPanel.errorRate', {
      defaultMessage: 'Error Rate',
    }),
    faultRate: i18n.translate('observability.apm.applicationMap.detailsPanel.faultRate', {
      defaultMessage: 'Fault Rate',
    }),
    requests: i18n.translate('observability.apm.applicationMap.detailsPanel.requests', {
      defaultMessage: 'Requests',
    }),
    latency: i18n.translate('observability.apm.applicationMap.detailsPanel.latency', {
      defaultMessage: 'Latency',
    }),
    faults5xx: i18n.translate('observability.apm.applicationMap.detailsPanel.faults5xx', {
      defaultMessage: 'Faults (5xx)',
    }),
    errors4xx: i18n.translate('observability.apm.applicationMap.detailsPanel.errors4xx', {
      defaultMessage: 'Errors (4xx)',
    }),
    totalRequests: i18n.translate('observability.apm.applicationMap.detailsPanel.totalRequests', {
      defaultMessage: 'Total Requests',
    }),
    totalErrors: i18n.translate('observability.apm.applicationMap.detailsPanel.totalErrors', {
      defaultMessage: 'Total Errors (4xx)',
    }),
    totalFaults: i18n.translate('observability.apm.applicationMap.detailsPanel.totalFaults', {
      defaultMessage: 'Total Faults (5xx)',
    }),
    // Latency percentile labels
    p99: i18n.translate('observability.apm.applicationMap.detailsPanel.p99', {
      defaultMessage: 'P99',
    }),
    p90: i18n.translate('observability.apm.applicationMap.detailsPanel.p90', {
      defaultMessage: 'P90',
    }),
    p50: i18n.translate('observability.apm.applicationMap.detailsPanel.p50', {
      defaultMessage: 'P50',
    }),
  },

  // Health status labels
  healthStatus: {
    healthy: i18n.translate('observability.apm.applicationMap.healthStatus.healthy', {
      defaultMessage: 'Healthy',
    }),
    warning: i18n.translate('observability.apm.applicationMap.healthStatus.warning', {
      defaultMessage: 'Warning',
    }),
    critical: i18n.translate('observability.apm.applicationMap.healthStatus.critical', {
      defaultMessage: 'Critical',
    }),
    unknown: i18n.translate('observability.apm.applicationMap.healthStatus.unknown', {
      defaultMessage: 'Unknown',
    }),
  },

  // Graph controls
  graph: {
    zoomIn: i18n.translate('observability.apm.applicationMap.graph.zoomIn', {
      defaultMessage: 'Zoom in',
    }),
    zoomOut: i18n.translate('observability.apm.applicationMap.graph.zoomOut', {
      defaultMessage: 'Zoom out',
    }),
    fitToScreen: i18n.translate('observability.apm.applicationMap.graph.fitToScreen', {
      defaultMessage: 'Fit to screen',
    }),
    servicesCount: (count: number) =>
      i18n.translate('observability.apm.applicationMap.graph.servicesCount', {
        defaultMessage: '{count} {count, plural, one {service} other {services}}',
        values: { count },
      }),
  },

  // Edge metrics popup
  edgeMetrics: {
    title: i18n.translate('observability.apm.applicationMap.edgeMetrics.title', {
      defaultMessage: 'Connection Metrics',
    }),
    requests: i18n.translate('observability.apm.applicationMap.edgeMetrics.requests', {
      defaultMessage: 'Requests',
    }),
    latency: i18n.translate('observability.apm.applicationMap.edgeMetrics.latency', {
      defaultMessage: 'P99 Latency',
    }),
    faults: i18n.translate('observability.apm.applicationMap.edgeMetrics.faults', {
      defaultMessage: 'Faults (5xx)',
    }),
    errors: i18n.translate('observability.apm.applicationMap.edgeMetrics.errors', {
      defaultMessage: 'Errors (4xx)',
    }),
    closeAriaLabel: i18n.translate('observability.apm.applicationMap.edgeMetrics.closeAriaLabel', {
      defaultMessage: 'Close edge metrics popup',
    }),
  },

  // Empty states
  empty: {
    title: i18n.translate('observability.apm.applicationMap.empty.title', {
      defaultMessage: 'No services found',
    }),
    body: i18n.translate('observability.apm.applicationMap.empty.body', {
      defaultMessage:
        'No service data is available for the selected time range. Make sure your services are instrumented and sending data.',
    }),
  },

  // Error state
  loadFailed: {
    sliceTitle: (group: string) =>
      i18n.translate('observability.apm.applicationMap.loadFailed.sliceTitle', {
        defaultMessage: 'Could not load the services in {group}',
        values: { group },
      }),
    focusTitle: i18n.translate('observability.apm.applicationMap.loadFailed.focusTitle', {
      defaultMessage: "Could not load this service's connections",
    }),
    focusPartialTitle: i18n.translate(
      'observability.apm.applicationMap.loadFailed.focusPartialTitle',
      { defaultMessage: "Some of this service's connections could not be loaded" }
    ),
  },
  error: {
    title: i18n.translate('observability.apm.applicationMap.error.title', {
      defaultMessage:
        'Error loading services, verify your configuration setup and index schema under APM settings',
    }),
    retryButton: i18n.translate('observability.apm.applicationMap.error.retryButton', {
      defaultMessage: 'Retry',
    }),
  },

  // Actions
  actions: {
    viewSpans: i18n.translate('observability.apm.applicationMap.actions.viewSpans', {
      defaultMessage: 'View spans',
    }),
    viewLogs: i18n.translate('observability.apm.applicationMap.actions.viewLogs', {
      defaultMessage: 'View logs',
    }),
    viewDashboards: i18n.translate('observability.apm.applicationMap.actions.viewDashboards', {
      defaultMessage: 'View correlated dashboards',
    }),
    viewServiceDetails: i18n.translate(
      'observability.apm.applicationMap.actions.viewServiceDetails',
      {
        defaultMessage: 'View service details',
      }
    ),
  },
  focus: {
    label: (service: string, environment: string, neighbors: number) =>
      i18n.translate('observability.apm.applicationMap.focus.label', {
        defaultMessage:
          'Focused on {service} in {environment} and its {neighbors, plural, one {# connected node} other {# connected nodes}}',
        values: { service, environment, neighbors },
      }),
    labelCapped: (service: string, environment: string, shown: number, total: number) =>
      i18n.translate('observability.apm.applicationMap.focus.labelCapped', {
        defaultMessage:
          'Focused on {service} in {environment}: showing the nearest {shown, number} of {total, number} connected nodes',
        values: { service, environment, shown, total },
      }),
    labelCappedOpen: (service: string, environment: string, shown: number) =>
      i18n.translate('observability.apm.applicationMap.focus.labelCappedOpen', {
        defaultMessage:
          'Focused on {service} in {environment}: showing the nearest {shown, number} connected nodes (more are not shown)',
        values: { service, environment, shown },
      }),
    labelPathCut: (service: string, environment: string, shown: number, hops: number) =>
      i18n.translate('observability.apm.applicationMap.focus.labelPathCut', {
        defaultMessage:
          'Focused on {service} in {environment}: showing {shown, number} connected nodes within {hops, number} hops (the call path continues)',
        values: { service, environment, shown, hops },
      }),
    exit: i18n.translate('observability.apm.applicationMap.focus.exit', {
      defaultMessage: 'Back to full map',
    }),
    searchPrepend: i18n.translate('observability.apm.applicationMap.focus.searchPrepend', {
      defaultMessage: 'Focus on',
    }),
    searchPlaceholder: i18n.translate('observability.apm.applicationMap.focus.searchPlaceholder', {
      defaultMessage: 'Select a service',
    }),
    searchAriaLabel: i18n.translate('observability.apm.applicationMap.focus.searchAriaLabel', {
      defaultMessage: 'Focus on a service',
    }),
    modeLegend: i18n.translate('observability.apm.applicationMap.focus.modeLegend', {
      defaultMessage: 'Connections to show',
    }),
    direct: i18n.translate('observability.apm.applicationMap.focus.direct', {
      defaultMessage: 'Direct connections',
    }),
    path: i18n.translate('observability.apm.applicationMap.focus.path', {
      defaultMessage: 'Full call path',
    }),
  },
  partial: {
    title: i18n.translate('observability.apm.applicationMap.partial.title', {
      defaultMessage: 'Showing a partial topology',
    }),
    body: i18n.translate('observability.apm.applicationMap.partial.body', {
      defaultMessage:
        'Not every connection in this time range could be loaded, so some services or dependencies are not shown. Narrow the time range to see a complete view.',
    }),
  },
  metrics: {
    unavailable: i18n.translate('observability.apm.applicationMap.metrics.unavailable', {
      defaultMessage: 'Metrics unavailable',
    }),
    failedTitle: i18n.translate('observability.apm.applicationMap.metrics.failedTitle', {
      defaultMessage: 'Some metrics could not be loaded',
    }),
    failedBody: (nodes: number) =>
      i18n.translate('observability.apm.applicationMap.metrics.failedBody', {
        defaultMessage:
          '{nodes, plural, one {# node shows} other {# nodes show}} "Metrics unavailable" instead of counts. The metrics query failed or timed out.',
        values: { nodes },
      }),
    totalsFailedBody: i18n.translate('observability.apm.applicationMap.metrics.totalsFailedBody', {
      defaultMessage:
        'The request and error totals for this view could not be loaded, so they show as unavailable.',
    }),
    retry: i18n.translate('observability.apm.applicationMap.metrics.retry', {
      defaultMessage: 'Retry',
    }),
  },
  largeMap: {
    groupedTitle: i18n.translate('observability.apm.applicationMap.largeMap.groupedTitle', {
      defaultMessage: 'Grouped by environment',
    }),
    groupedBody: (services: number, limit: number) =>
      i18n.translate('observability.apm.applicationMap.largeMap.groupedBody', {
        defaultMessage:
          'This map has {services, number} nodes, too many to draw at once (the limit is {limit, number}), so it is grouped by environment. Open an environment to see its services, or pick another grouping.',
        values: { services, limit },
      }),
    tooManyTitle: i18n.translate('observability.apm.applicationMap.largeMap.tooManyTitle', {
      defaultMessage: 'Too many services to display',
    }),
    tooManyBody: (services: number, limit: number) =>
      i18n.translate('observability.apm.applicationMap.largeMap.tooManyBody', {
        defaultMessage:
          'This view has {services, number} nodes, too many to draw at once (the limit is {limit, number}). Use Focus on to open one service and its connections, hide dependencies, group the map, or reduce the time range.',
        values: { services, limit },
      }),
    tooManyBodyInGroup: (services: number, limit: number) =>
      i18n.translate('observability.apm.applicationMap.largeMap.tooManyBodyInGroup', {
        defaultMessage:
          'This group has {services, number} nodes, too many to draw at once (the limit is {limit, number}). Focus on one service to see its connections, hide dependencies, or reduce the time range.',
        values: { services, limit },
      }),
    focusService: i18n.translate('observability.apm.applicationMap.largeMap.focusService', {
      defaultMessage: 'Focus on a service',
    }),
    groupByEnvironment: i18n.translate(
      'observability.apm.applicationMap.largeMap.groupByEnvironment',
      { defaultMessage: 'Group by environment' }
    ),
    hideDependencies: i18n.translate('observability.apm.applicationMap.largeMap.hideDependencies', {
      defaultMessage: 'Hide dependencies',
    }),
  },
  dependencyStacks: {
    title: i18n.translate('observability.apm.applicationMap.dependencyStacks.title', {
      defaultMessage: 'Dependencies are grouped on this large map',
    }),
    body: (stackedNodes: number, stacks: number, threshold: number) =>
      i18n.translate('observability.apm.applicationMap.dependencyStacks.body', {
        defaultMessage:
          'To keep a map of more than {threshold} nodes responsive, {stackedNodes} dependencies that connect to the same services are shown as {stacks} stacks. Expand a stack with its + button.',
        values: { stackedNodes, stacks, threshold },
      }),
    showIndividually: i18n.translate(
      'observability.apm.applicationMap.dependencyStacks.showIndividually',
      { defaultMessage: 'Show individually' }
    ),
  },
};

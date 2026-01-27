/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';

/**
 * i18n texts for Application Map page
 */
export const applicationMapI18nTexts = {
  breadcrumb: i18n.translate('observability.apm.applicationMap.breadcrumb', {
    defaultMessage: 'Application Map',
  }),

  // Page header
  pageTitle: i18n.translate('observability.apm.applicationMap.pageTitle', {
    defaultMessage: 'Application Map',
  }),
  searchPlaceholder: i18n.translate('observability.apm.applicationMap.search.placeholder', {
    defaultMessage: 'Filter by service name',
  }),

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
    groupBy: i18n.translate('observability.apm.applicationMap.filters.groupBy', {
      defaultMessage: 'Group by',
    }),
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
    viewServiceDetails: i18n.translate(
      'observability.apm.applicationMap.actions.viewServiceDetails',
      {
        defaultMessage: 'View service details',
      }
    ),
  },
};

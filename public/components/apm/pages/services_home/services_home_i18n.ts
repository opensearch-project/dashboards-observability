/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';

/**
 * i18n translations for the Services page
 */
export const servicesI18nTexts = {
  breadcrumb: i18n.translate('observability.apm.services.breadcrumb', {
    defaultMessage: 'Services',
  }),
  table: {
    serviceName: i18n.translate('observability.apm.services.table.serviceName', {
      defaultMessage: 'Service Name',
    }),
    environment: i18n.translate('observability.apm.services.table.environment', {
      defaultMessage: 'Environment',
    }),
    latencyP95: i18n.translate('observability.apm.services.table.latencyP95', {
      defaultMessage: 'Latency (P95)',
    }),
    throughput: i18n.translate('observability.apm.services.table.throughput', {
      defaultMessage: 'Throughput',
    }),
    failureRatio: i18n.translate('observability.apm.services.table.failureRatio', {
      defaultMessage: 'Failure Ratio',
    }),
    actions: i18n.translate('observability.apm.services.table.actions', {
      defaultMessage: 'Actions',
    }),
  },
  actions: {
    viewServiceMap: i18n.translate('observability.apm.services.actions.viewServiceMap', {
      defaultMessage: 'View service map',
    }),
    viewLogs: i18n.translate('observability.apm.services.actions.viewLogs', {
      defaultMessage: 'View logs',
    }),
    viewSpans: i18n.translate('observability.apm.services.actions.viewSpans', {
      defaultMessage: 'View spans',
    }),
  },
  flyout: {
    title: i18n.translate('observability.apm.services.flyout.title', {
      defaultMessage: 'Service Details',
    }),
    tabSpans: i18n.translate('observability.apm.services.flyout.tabSpans', {
      defaultMessage: 'Correlated spans',
    }),
    tabLogs: i18n.translate('observability.apm.services.flyout.tabLogs', {
      defaultMessage: 'Associated logs',
    }),
    loading: i18n.translate('observability.apm.services.flyout.loading', {
      defaultMessage: 'Loading...',
    }),
    noSpans: i18n.translate('observability.apm.services.flyout.noSpans', {
      defaultMessage: 'No spans found for this service',
    }),
    noLogs: i18n.translate('observability.apm.services.flyout.noLogs', {
      defaultMessage: 'No logs found for this service',
    }),
    noCorrelatedLogs: i18n.translate('observability.apm.services.flyout.noCorrelatedLogs', {
      defaultMessage: 'No correlated log datasets configured',
    }),
    viewInDiscover: i18n.translate('observability.apm.services.flyout.viewInDiscover', {
      defaultMessage: 'View in Discover',
    }),
    dataset: i18n.translate('observability.apm.services.flyout.dataset', {
      defaultMessage: 'Dataset',
    }),
    results: i18n.translate('observability.apm.services.flyout.results', {
      defaultMessage: 'results',
    }),
  },
  error: {
    title: i18n.translate('observability.apm.services.error.title', {
      defaultMessage: 'Error loading services',
    }),
  },
  empty: {
    title: i18n.translate('observability.apm.services.empty.title', {
      defaultMessage: 'No services found',
    }),
    body: i18n.translate('observability.apm.services.empty.body', {
      defaultMessage: 'Services will appear here once they start sending telemetry data.',
    }),
  },
  filters: {
    title: i18n.translate('observability.apm.services.filters.title', {
      defaultMessage: 'Filters',
    }),
    toggleAriaLabel: i18n.translate('observability.apm.services.filters.toggleAriaLabel', {
      defaultMessage: 'Toggle filter sidebar',
    }),
    environment: i18n.translate('observability.apm.services.filters.environment', {
      defaultMessage: 'Environment',
    }),
    noEnvironments: i18n.translate('observability.apm.services.filters.noEnvironments', {
      defaultMessage: 'No environments available',
    }),
    latency: i18n.translate('observability.apm.services.filters.latency', {
      defaultMessage: 'Latency (P95)',
    }),
    throughput: i18n.translate('observability.apm.services.filters.throughput', {
      defaultMessage: 'Throughput',
    }),
    failureRatio: i18n.translate('observability.apm.services.filters.failureRatio', {
      defaultMessage: 'Failure Ratio',
    }),
    attributes: i18n.translate('observability.apm.services.filters.attributes', {
      defaultMessage: 'Attributes',
    }),
    selectAll: i18n.translate('observability.apm.services.filters.selectAll', {
      defaultMessage: 'Select all',
    }),
    clearAll: i18n.translate('observability.apm.services.filters.clearAll', {
      defaultMessage: 'Clear all',
    }),
    showLess: i18n.translate('observability.apm.services.filters.showLess', {
      defaultMessage: 'Show less',
    }),
    noMatchingValues: i18n.translate('observability.apm.services.filters.noMatchingValues', {
      defaultMessage: 'No matching values',
    }),
  },
  noMatching: {
    title: i18n.translate('observability.apm.services.noMatching.title', {
      defaultMessage: 'No matching services',
    }),
    body: i18n.translate('observability.apm.services.noMatching.body', {
      defaultMessage: 'Try adjusting your search query or filters.',
    }),
  },
};

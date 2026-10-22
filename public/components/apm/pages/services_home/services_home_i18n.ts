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
      defaultMessage: 'Service',
    }),
    environment: i18n.translate('observability.apm.services.table.environment', {
      defaultMessage: 'Environment',
    }),
    type: i18n.translate('observability.apm.services.table.type', {
      defaultMessage: 'Type',
    }),
    latencyP99: i18n.translate('observability.apm.services.table.latencyP99', {
      defaultMessage: 'Avg. latency',
    }),
    throughput: i18n.translate('observability.apm.services.table.throughput', {
      defaultMessage: 'Throughput',
    }),
    // Short header so the column header fits a single line at the
    // now-percentage column width without truncating mid-word; the
    // tooltip on the column header still describes "average failure
    // ratio over the time period" for users who need the long form.
    failureRatio: i18n.translate('observability.apm.services.table.failureRatio', {
      defaultMessage: 'Failure rate',
    }),
    actions: i18n.translate('observability.apm.services.table.actions', {
      defaultMessage: 'Correlations',
    }),
  },
  tableTooltips: {
    latency: i18n.translate('observability.apm.services.table.tooltip.latency', {
      defaultMessage: 'Response time percentile over the selected time range',
    }),
    throughput: i18n.translate('observability.apm.services.table.tooltip.throughput', {
      defaultMessage: 'Average requests per second over the selected time range',
    }),
    failureRatio: i18n.translate('observability.apm.services.table.tooltip.failureRatio', {
      defaultMessage:
        'Average percentage of requests that resulted in faults (5xx) and errors (4xx) over the selected time range',
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
  error: {
    title: i18n.translate('observability.apm.services.error.title', {
      defaultMessage: 'Error loading services, verify your configuration setup under APM settings',
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
      defaultMessage: 'Latency',
    }),
    throughput: i18n.translate('observability.apm.services.filters.throughput', {
      defaultMessage: 'Throughput',
    }),
    failureRatio: i18n.translate('observability.apm.services.filters.failureRatio', {
      defaultMessage: 'Failure ratio',
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
    showMore: (count: number) =>
      i18n.translate('observability.apm.services.filters.showMore', {
        defaultMessage: '+{count} more',
        values: { count },
      }),
    noMatchingValues: i18n.translate('observability.apm.services.filters.noMatchingValues', {
      defaultMessage: 'No matching values',
    }),
  },
  metricsNotice: {
    failedTitle: i18n.translate('observability.apm.services.metricsNotice.failedTitle', {
      defaultMessage: 'Some metrics could not be loaded',
    }),
    failedBody: i18n.translate('observability.apm.services.metricsNotice.failedBody', {
      defaultMessage:
        'Metrics that failed to load (for example, a query that timed out on a wide time range) show as "-". Narrow the time range or filter services, then refresh.',
    }),
    broadFilterTitle: i18n.translate('observability.apm.services.metricsNotice.broadFilterTitle', {
      defaultMessage: 'Metrics are queried for all services',
    }),
    broadFilterBody: i18n.translate('observability.apm.services.metricsNotice.broadFilterBody', {
      defaultMessage:
        'Your filters match too many services to narrow the metrics query, so it scans every service and can be slow on wide time ranges. Narrow the search or select an environment to speed it up.',
    }),
  },
  unavailable: i18n.translate('observability.apm.services.table.unavailable', {
    defaultMessage: '-',
  }),
  noMatching: {
    title: i18n.translate('observability.apm.services.noMatching.title', {
      defaultMessage: 'No matching services',
    }),
    body: i18n.translate('observability.apm.services.noMatching.body', {
      defaultMessage: 'Try adjusting your search query or filters.',
    }),
  },
};

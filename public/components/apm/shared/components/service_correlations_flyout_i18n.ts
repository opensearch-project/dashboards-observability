/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';

/**
 * i18n translations for the Service Correlations Flyout
 */
export const correlationsFlyoutI18nTexts = {
  // Tab names
  tabSpans: i18n.translate('observability.apm.correlationsFlyout.tabSpans', {
    defaultMessage: 'Correlated spans',
  }),
  tabLogs: i18n.translate('observability.apm.correlationsFlyout.tabLogs', {
    defaultMessage: 'Correlated logs',
  }),
  tabAttributes: i18n.translate('observability.apm.correlationsFlyout.tabAttributes', {
    defaultMessage: 'Service attributes',
  }),
  tabDashboards: i18n.translate('observability.apm.correlationsFlyout.tabDashboards', {
    defaultMessage: 'Correlated dashboards',
  }),

  // Empty states
  noSpans: i18n.translate('observability.apm.correlationsFlyout.noSpans', {
    defaultMessage: 'No spans found for this service',
  }),
  noAttributes: i18n.translate('observability.apm.correlationsFlyout.noAttributes', {
    defaultMessage: 'No attributes found for this service',
  }),
  noLogs: i18n.translate('observability.apm.correlationsFlyout.noLogs', {
    defaultMessage: 'No logs found for this service',
  }),
  noCorrelatedLogs: i18n.translate('observability.apm.correlationsFlyout.noCorrelatedLogs', {
    defaultMessage: 'No correlated log datasets configured',
  }),
  noCorrelatedLogsBody: i18n.translate(
    'observability.apm.correlationsFlyout.noCorrelatedLogsBody',
    {
      defaultMessage: 'Configure correlated log datasets to view related logs for this service.',
    }
  ),

  // Labels
  dataset: i18n.translate('observability.apm.correlationsFlyout.dataset', {
    defaultMessage: 'Dataset',
  }),
  traces: i18n.translate('observability.apm.correlationsFlyout.traces', {
    defaultMessage: 'Traces',
  }),

  // Filter
  filterAll: i18n.translate('observability.apm.correlationsFlyout.filterAll', {
    defaultMessage: 'All',
  }),

  // Buttons
  exploreTraces: i18n.translate('observability.apm.correlationsFlyout.exploreTraces', {
    defaultMessage: 'Explore Traces',
  }),
  exploreLogs: i18n.translate('observability.apm.correlationsFlyout.exploreLogs', {
    defaultMessage: 'Explore Logs',
  }),
  setupCorrelations: i18n.translate('observability.apm.correlationsFlyout.setupCorrelations', {
    defaultMessage: 'Setup Correlations',
  }),

  // Aria labels
  expand: i18n.translate('observability.apm.correlationsFlyout.expand', {
    defaultMessage: 'Expand',
  }),
  collapse: i18n.translate('observability.apm.correlationsFlyout.collapse', {
    defaultMessage: 'Collapse',
  }),

  // Column headers - Spans
  columnTime: i18n.translate('observability.apm.correlationsFlyout.columnTime', {
    defaultMessage: 'Time',
  }),
  columnStatus: i18n.translate('observability.apm.correlationsFlyout.columnStatus', {
    defaultMessage: 'Status',
  }),
  columnHttpStatus: i18n.translate('observability.apm.correlationsFlyout.columnHttpStatus', {
    defaultMessage: 'HTTP Status',
  }),
  columnKind: i18n.translate('observability.apm.correlationsFlyout.columnKind', {
    defaultMessage: 'Kind',
  }),
  columnOperation: i18n.translate('observability.apm.correlationsFlyout.columnOperation', {
    defaultMessage: 'Operation',
  }),
  columnSpanId: i18n.translate('observability.apm.correlationsFlyout.columnSpanId', {
    defaultMessage: 'Span ID',
  }),

  // Column headers - Logs
  columnLevel: i18n.translate('observability.apm.correlationsFlyout.columnLevel', {
    defaultMessage: 'Level',
  }),
  columnMessage: i18n.translate('observability.apm.correlationsFlyout.columnMessage', {
    defaultMessage: 'Message',
  }),

  // Description texts
  spansDescription: i18n.translate('observability.apm.correlationsFlyout.spansDescription', {
    defaultMessage:
      'Showing the most recent spans correlated with this service, sorted by start time. Filtering by status or HTTP code searches all matching spans in the selected time range and returns the most recent. Click "Explore Traces" to view all spans in detail.',
  }),
  logsDescription: i18n.translate('observability.apm.correlationsFlyout.logsDescription', {
    defaultMessage:
      'Showing the most recent logs from each correlated dataset. Filtering by log level searches all matching logs in the selected time range and returns the most recent.',
  }),
  attributesDescription: i18n.translate(
    'observability.apm.correlationsFlyout.attributesDescription',
    {
      defaultMessage: 'Service attributes extracted from trace data.',
    }
  ),

  // Filter fallback banner (shown on OpenSearch < 3.1, which can't push the filter server-side)
  filterFallbackTitle: i18n.translate('observability.apm.correlationsFlyout.filterFallbackTitle', {
    defaultMessage: 'Filtered results may be incomplete',
  }),
  filterFallbackSpansBody: i18n.translate(
    'observability.apm.correlationsFlyout.filterFallbackSpansBody',
    {
      defaultMessage:
        'This OpenSearch version cannot filter HTTP status across the full time range, so only the most recent spans were searched. Upgrade to OpenSearch 3.1 or later, or click "Explore Traces" to search all spans.',
    }
  ),
  filterFallbackLogsBody: i18n.translate(
    'observability.apm.correlationsFlyout.filterFallbackLogsBody',
    {
      defaultMessage:
        'This OpenSearch version cannot filter log level across the full time range, so only the most recent logs were searched. Upgrade to OpenSearch 3.1 or later, or click "Explore Logs" to search all logs.',
    }
  ),

  // Attributes tab labels
  environment: i18n.translate('observability.apm.correlationsFlyout.environment', {
    defaultMessage: 'Environment',
  }),
  attributes: i18n.translate('observability.apm.correlationsFlyout.attributes', {
    defaultMessage: 'Attributes',
  }),

  // Errors
  errorLoadingSpans: i18n.translate('observability.apm.correlationsFlyout.errorLoadingSpans', {
    defaultMessage: 'Error loading spans',
  }),
  errorPrefix: i18n.translate('observability.apm.correlationsFlyout.errorPrefix', {
    defaultMessage: 'Error',
  }),

  // Filter badge labels (for operation context)
  filterBadgeOperation: i18n.translate(
    'observability.apm.correlationsFlyout.filterBadgeOperation',
    {
      defaultMessage: 'Operation',
    }
  ),

  // Correlated dashboards (optional, experimental)
  dashboardsEmptyTitle: i18n.translate(
    'observability.apm.correlationsFlyout.dashboardsEmptyTitle',
    {
      defaultMessage: 'No correlated dashboards',
    }
  ),
  dashboardsEmptyBody: i18n.translate('observability.apm.correlationsFlyout.dashboardsEmptyBody', {
    defaultMessage:
      'Add dashboards (infrastructure or business) to open them from service/topology pages, scoped to the current time range.',
  }),
  dashboardsEmptyCta: i18n.translate('observability.apm.correlationsFlyout.dashboardsEmptyCta', {
    defaultMessage: 'Add correlated dashboards',
  }),
  dashboardsTableCaption: i18n.translate(
    'observability.apm.correlationsFlyout.dashboardsTableCaption',
    {
      defaultMessage: 'Open in a new tab, scoped to the current time range.',
    }
  ),
  dashboardsColName: i18n.translate('observability.apm.correlationsFlyout.dashboardsColName', {
    defaultMessage: 'Name',
  }),
  dashboardsColDescription: i18n.translate(
    'observability.apm.correlationsFlyout.dashboardsColDescription',
    {
      defaultMessage: 'Description',
    }
  ),
  dashboardsColLastModified: i18n.translate(
    'observability.apm.correlationsFlyout.dashboardsColLastModified',
    {
      defaultMessage: 'Last modified',
    }
  ),
  dashboardsSearchPlaceholder: i18n.translate(
    'observability.apm.correlationsFlyout.dashboardsSearchPlaceholder',
    {
      defaultMessage: 'Search dashboards',
    }
  ),
  dashboardUnavailable: (title: string) =>
    i18n.translate('observability.apm.correlationsFlyout.dashboardUnavailable', {
      defaultMessage: '{title} (unavailable)',
      values: { title },
    }),
};

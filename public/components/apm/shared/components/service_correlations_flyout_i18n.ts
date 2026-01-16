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

  // Empty states
  noSpans: i18n.translate('observability.apm.correlationsFlyout.noSpans', {
    defaultMessage: 'No spans found for this service',
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
      'Showing up to 50 most recent spans correlated with this service, sorted by start time. Use the filter to narrow down by status or HTTP code, or click "Explore Traces" to view all spans in detail.',
  }),
  logsDescription: i18n.translate('observability.apm.correlationsFlyout.logsDescription', {
    defaultMessage:
      'Showing up to 10 most recent logs from each correlated dataset. Use the filter to narrow by log level.',
  }),

  // Errors
  errorLoadingSpans: i18n.translate('observability.apm.correlationsFlyout.errorLoadingSpans', {
    defaultMessage: 'Error loading spans',
  }),
  errorPrefix: i18n.translate('observability.apm.correlationsFlyout.errorPrefix', {
    defaultMessage: 'Error',
  }),
};

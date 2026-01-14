/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';

/**
 * i18n translations for the APM Empty State component
 */
export const apmEmptyStateI18nTexts = {
  title: i18n.translate('observability.apm.emptyState.title', {
    defaultMessage: 'Start monitoring applications with OpenSearch',
  }),
  getStarted: i18n.translate('observability.apm.emptyState.getStarted', {
    defaultMessage: 'Get started',
  }),
  viewDocs: i18n.translate('observability.apm.emptyState.viewDocs', {
    defaultMessage: 'View documentation',
  }),
  tabs: {
    services: {
      name: i18n.translate('observability.apm.emptyState.tabs.services.name', {
        defaultMessage: 'Services',
      }),
      description: i18n.translate('observability.apm.emptyState.tabs.services.description', {
        defaultMessage:
          'Monitor service health, latency, and error rates. View detailed metrics for each service in your distributed system.',
      }),
    },
    applicationMap: {
      name: i18n.translate('observability.apm.emptyState.tabs.applicationMap.name', {
        defaultMessage: 'Application Map',
      }),
      description: i18n.translate('observability.apm.emptyState.tabs.applicationMap.description', {
        defaultMessage:
          'Visualize service dependencies and topology. Understand how your services communicate and identify bottlenecks.',
      }),
    },
    correlateTracesLogs: {
      name: i18n.translate('observability.apm.emptyState.tabs.correlateTracesLogs.name', {
        defaultMessage: 'Correlate traces and logs',
      }),
      description: i18n.translate(
        'observability.apm.emptyState.tabs.correlateTracesLogs.description',
        {
          defaultMessage:
            'Connect distributed traces with log data. Quickly navigate from trace spans to related logs for faster debugging.',
        }
      ),
    },
    sloAlerts: {
      name: i18n.translate('observability.apm.emptyState.tabs.sloAlerts.name', {
        defaultMessage: 'SLO alerts',
      }),
      description: i18n.translate('observability.apm.emptyState.tabs.sloAlerts.description', {
        defaultMessage:
          'Set and monitor Service Level Objectives. Get alerted when your services fall below target performance thresholds.',
      }),
    },
  },
};

/**
 * Get the preview image alt text with the tab name
 */
export const getPreviewImageAlt = (tabName: string): string =>
  i18n.translate('observability.apm.emptyState.previewImageAlt', {
    defaultMessage: '{tabName} preview',
    values: { tabName },
  });

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
  },
  legacyBanner: {
    title: i18n.translate('observability.apm.emptyState.legacyBanner.title', {
      defaultMessage: 'Try out new APM experience',
    }),
    message: i18n.translate('observability.apm.emptyState.legacyBanner.message', {
      defaultMessage:
        'If you prefer the classic Trace Analytics experience, you can disable APM in settings.',
    }),
    linkText: i18n.translate('observability.apm.emptyState.legacyBanner.linkText', {
      defaultMessage: 'Go to settings',
    }),
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

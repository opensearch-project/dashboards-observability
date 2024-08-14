/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';

// Plugin URLs
export const gettingStartedURL = 'observability-gettingStarted';
const discoverURL = 'data-explorer/discover';
const metricsURL = 'observability-metrics';
const tracesURL = 'observability-traces-nav#/traces';
const servicesURL = 'observability-services-nav#/services';
const alertsURL = 'alerting';
const anomalyDetectionURL = 'anomaly-detection-dashboards';

export interface GettingStartedConfig {
  id: string;
  order: number;
  title: string;
  description: string;
  footer: string;
  url: string;
}

export const GETTING_STARTED_CONFIG: GettingStartedConfig = {
  id: 'getting_started',
  order: 1,
  title: i18n.translate('observability.overview.card.gettingStarted.title', {
    defaultMessage: 'Add your data',
  }),
  description: 'Get started collecting and analyzing data.',
  footer: 'Getting Started Guide',
  url: gettingStartedURL,
};

const DISCOVER_CONFIG: GettingStartedConfig = {
  id: 'discover',
  order: 2,
  title: i18n.translate('observability.overview.card.discover.title', {
    defaultMessage: 'Discover insights',
  }),
  description: 'Uncover insights with raw data exploration.',
  footer: 'Discover',
  url: discoverURL,
};

const METRICS_CONFIG: GettingStartedConfig = {
  id: 'metrics',
  order: 3,
  title: i18n.translate('observability.overview.card.metrics.title', {
    defaultMessage: 'Metrics',
  }),
  description: 'Transform logs into actionable visualizations with metrics extraction.',
  footer: 'Metrics',
  url: metricsURL,
};

const TRACES_CONFIG: GettingStartedConfig = {
  id: 'traces',
  order: 4,
  title: i18n.translate('observability.overview.card.traces.title', {
    defaultMessage: 'Traces',
  }),
  description: 'Unveil performance bottlenecks with event flow visualization.',
  footer: 'Traces',
  url: tracesURL,
};

const SERVICES_CONFIG: GettingStartedConfig = {
  id: 'services',
  order: 5,
  title: i18n.translate('observability.overview.card.services.title', {
    defaultMessage: 'Services',
  }),
  description: 'Unveil performance bottlenecks with event flow visualization.',
  footer: 'Services',
  url: servicesURL,
};

const ALERTS_CONFIG: GettingStartedConfig = {
  id: 'alerts',
  order: 6,
  title: i18n.translate('observability.overview.card.alerts.title', {
    defaultMessage: 'Alerts',
  }),
  description: 'Unveil performance bottlenecks with event flow visualization.',
  footer: 'Alerts',
  url: alertsURL,
};

const ANOMALY_CONFIG: GettingStartedConfig = {
  id: 'anomaly',
  order: 7,
  title: i18n.translate('observability.overview.card.anomaly.title', {
    defaultMessage: 'Anomaly Detection',
  }),
  description: 'Unveil performance bottlenecks with event flow visualization.',
  footer: 'Anomaly Detection',
  url: anomalyDetectionURL,
};

export const cardConfigs = [
  GETTING_STARTED_CONFIG,
  DISCOVER_CONFIG,
  METRICS_CONFIG,
  TRACES_CONFIG,
  SERVICES_CONFIG,
  ALERTS_CONFIG,
  ANOMALY_CONFIG,
];

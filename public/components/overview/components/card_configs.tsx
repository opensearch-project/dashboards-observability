/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';
import {
  observabilityGettingStartedID,
  observabilityMetricsID,
  observabilityTracesNewNavID,
  observabilityServicesNewNavID,
  alertingPluginID,
  anomalyDetectionPluginID,
  tutorialSampleDataPluginId,
} from '../../../../common/constants/shared';

export interface GettingStartedConfig {
  id: string;
  order: number;
  title: string;
  description: string;
  footer: string;
  url: string;
  path: string;
}

const GETTING_STARTED_CONFIG: GettingStartedConfig = {
  id: 'getting_started',
  order: 1,
  title: i18n.translate('observability.overview.card.gettingStarted.title', {
    defaultMessage: 'Set up your Observability workspace',
  }),
  description: 'Get started by collecting and analyzing your metrics, logs, and traces.',
  footer: 'Getting started guide',
  url: observabilityGettingStartedID,
  path: '#/',
};

const SAMPLEDATA_CONFIG: GettingStartedConfig = {
  id: 'sample_data',
  order: 2,
  description: i18n.translate('home.sampleData.card.description', {
    defaultMessage: 'You can install sample data to experiment with OpenSearch Dashboards.',
  }),
  title: i18n.translate('home.sampleData.card.title', {
    defaultMessage: 'Try OpenSearch',
  }),
  url: tutorialSampleDataPluginId,
  footer: 'Sample datasets',
  path: '#/',
};

const DISCOVER_CONFIG: GettingStartedConfig = {
  id: 'discover',
  order: 3,
  title: i18n.translate('observability.overview.card.discover.title', {
    defaultMessage: 'Discover insights',
  }),
  description: 'Uncover logs with raw data exploration.',
  footer: 'Discover',
  url: 'data-explorer',
  path: '/discover',
};

const METRICS_CONFIG: GettingStartedConfig = {
  id: 'metrics',
  order: 4,
  title: i18n.translate('observability.overview.card.metrics.title', {
    defaultMessage: 'Monitor system performance',
  }),
  description: 'Transform logs into actionable visualizations by extracting metrics.',
  footer: 'Metrics',
  url: observabilityMetricsID,
  path: '#/',
};

const TRACES_CONFIG: GettingStartedConfig = {
  id: 'traces',
  order: 5,
  title: i18n.translate('observability.overview.card.traces.title', {
    defaultMessage: 'Identify performance issues',
  }),
  description: 'Analyze performance bottlenecks using event flow visualizations.',
  footer: 'Traces',
  url: observabilityTracesNewNavID,
  path: '#/',
};

const SERVICES_CONFIG: GettingStartedConfig = {
  id: 'services',
  order: 6,
  title: i18n.translate('observability.overview.card.services.title', {
    defaultMessage: 'Monitor service health',
  }),
  description: 'Identify service performance issues with comprehensive monitoring and analysis.',
  footer: 'Services',
  url: observabilityServicesNewNavID,
  path: '#/',
};

const ALERTS_CONFIG: GettingStartedConfig = {
  id: 'alerts',
  order: 7,
  title: i18n.translate('observability.overview.card.alerts.title', {
    defaultMessage: 'Get notified',
  }),
  description: 'Receive timely notifications by configuring alert triggers.',
  footer: 'Alerting',
  url: alertingPluginID,
  path: '#/',
};

const ANOMALY_CONFIG: GettingStartedConfig = {
  id: 'anomaly',
  order: 8,
  title: i18n.translate('observability.overview.card.anomaly.title', {
    defaultMessage: 'Detect anomalies in your data',
  }),
  description: 'Gain near real-time anomaly detection using the Random Cut Forest (RCF) algorithm.',
  footer: 'Anomaly Detection',
  url: anomalyDetectionPluginID,
  path: '#/',
};

export const cardConfigs = [
  GETTING_STARTED_CONFIG,
  SAMPLEDATA_CONFIG,
  DISCOVER_CONFIG,
  METRICS_CONFIG,
  TRACES_CONFIG,
  SERVICES_CONFIG,
  ALERTS_CONFIG,
  ANOMALY_CONFIG,
];

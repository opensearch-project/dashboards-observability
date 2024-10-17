/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';
import {
  observabilityGettingStartedID,
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

const SAMPLEDATA_CONFIG: GettingStartedConfig = {
  id: 'sample_data',
  order: 1,
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

const GETTING_STARTED_CONFIG: GettingStartedConfig = {
  id: 'getting_started',
  order: 2,
  title: i18n.translate('observability.overview.card.gettingStarted.title', {
    defaultMessage: 'Set up your Observability workspace',
  }),
  description: 'Get started by collecting and analyzing your metrics, logs, and traces.',
  footer: 'Getting started guide',
  url: observabilityGettingStartedID,
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

const DASHBOARD_CONFIG: GettingStartedConfig = {
  id: 'dashboard',
  order: 3,
  title: i18n.translate('observability.overview.card.dashboard.title', {
    defaultMessage: 'Dashboards',
  }),
  description: 'Monitor and explore your data using dynamic data visualization tools.',
  footer: 'Dashboards',
  url: 'dashboards',
  path: '#/',
};

export const cardConfigs = [
  SAMPLEDATA_CONFIG,
  GETTING_STARTED_CONFIG,
  DISCOVER_CONFIG,
  DASHBOARD_CONFIG,
];

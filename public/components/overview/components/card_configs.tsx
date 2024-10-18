/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';
import { EuiI18n, EuiIcon, EuiTextColor } from '@elastic/eui';
import React from 'react';
import {
  observabilityGettingStartedID,
  tutorialSampleDataPluginId,
} from '../../../../common/constants/shared';

export interface GettingStartedConfig {
  id: string;
  order: number;
  title: string;
  description: string;
  footer: React.ReactElement;
  url: string;
  path: string;
  icon: React.ReactElement<EuiIcon>;
}

const SAMPLEDATA_CONFIG: GettingStartedConfig = {
  id: 'sample_data',
  order: 10,
  icon: <EuiIcon type="functionAdd" size="l" color="primary" />,
  title: '',
  description: i18n.translate('home.sampleData.card.description', {
    defaultMessage: 'Install sample data to experiment with OpenSearch.',
  }),
  footer: (
    <EuiTextColor color="subdued">
      <EuiI18n
        token="workspace.observability_overview.sample_data.card.footer"
        default="Sample datasets"
      />
    </EuiTextColor>
  ),
  url: tutorialSampleDataPluginId,
  path: '#/',
};

const GETTING_STARTED_CONFIG: GettingStartedConfig = {
  id: 'getting_started',
  order: 20,
  icon: <EuiIcon type="rocket" size="l" color="primary" />,
  title: '',
  description: i18n.translate('workspace.observability_overview.getting_started.card.description', {
    defaultMessage: 'Get started collecting and analyzing data.',
  }),
  footer: (
    <EuiTextColor color="subdued">
      <EuiI18n
        token="workspace.observability_overview.getting_started.card.footer"
        default="Get started guide"
      />
    </EuiTextColor>
  ),
  url: observabilityGettingStartedID,
  path: '#/',
};

const DISCOVER_CONFIG: GettingStartedConfig = {
  id: 'discover',
  order: 30,
  icon: <EuiIcon type="compass" size="l" color="primary" />,
  title: '',
  description: i18n.translate('workspace.observability_overview.discover.card.description', {
    defaultMessage: 'Explore data to uncover and discover insights.',
  }),
  footer: (
    <EuiTextColor color="subdued">
      <EuiI18n token="workspace.observability_overview.discover.card.footer" default="Discover" />
    </EuiTextColor>
  ),
  url: 'data-explorer',
  path: '/discover',
};

const DASHBOARDS_CONFIG: GettingStartedConfig = {
  id: 'dashboards',
  order: 40,
  icon: <EuiIcon type="dashboard" size="l" color="primary" />,
  title: '',
  description: i18n.translate('workspace.observability_overview.dashboards.card.description', {
    defaultMessage: 'Monitor and explore your data using dynamic data visualization tools.',
  }),
  footer: (
    <EuiTextColor color="subdued">
      <EuiI18n
        token="workspace.observability_overview.dashboards.card.footer"
        default="Dashboards"
      />
    </EuiTextColor>
  ),
  url: 'dashboards',
  path: '/',
};

export const cardConfigs = [
  SAMPLEDATA_CONFIG,
  GETTING_STARTED_CONFIG,
  DISCOVER_CONFIG,
  DASHBOARDS_CONFIG,
];
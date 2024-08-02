/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { HashRouter, RouteComponentProps, Switch, Route } from 'react-router-dom';
import { EuiSpacer, EuiText, EuiFlexGroup, EuiFlexItem, EuiCard, EuiPanel, EuiLink, EuiDescriptionList, EuiTitle, EuiDescriptionListDescription, EuiDescriptionListTitle } from '@elastic/eui';
import { TraceAnalyticsCoreDeps } from '../trace_analytics/home';
import { ChromeBreadcrumb } from '../../../../../src/core/public';
import { coreRefs } from '../../../public/framework/core_refs';
import { ContentManagementPluginStart } from '../../../../../src/plugins/content_management/public';
import { HOME_CONTENT_AREAS, HOME_PAGE_ID } from '../../plugin_helpers/plugin_overview';
import { i18n } from '@osd/i18n';

const alertsPluginID = 'alerting';
const anomalyPluginID = 'anomalyDetection';

// Plugin URLs
const gettingStartedURL = 'observability-gettingStarted';
const discoverURL = 'data-explorer';
const metricsURL = 'observability-metrics';
const tracesURL = 'observability-traces-nav#/traces';
const alertsURL = 'alerting';
const anomalyDetectionURL = 'anomaly-detection-dashboards';

const checkIfPluginsAreInstalled = async (
  setAlertsPluginExists: React.Dispatch<React.SetStateAction<boolean>>,
  setAnomalyPluginExists: React.Dispatch<React.SetStateAction<boolean>>
) => {
  try {
    const response = await fetch('../api/status', {
      headers: {
        'Content-Type': 'application/json',
        'osd-xsrf': 'true',
        'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7,zh-TW;q=0.6',
        pragma: 'no-cache',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
      },
      method: 'GET',
      referrerPolicy: 'strict-origin-when-cross-origin',
      mode: 'cors',
      credentials: 'include',
    });
    const data = await response.json();

    let alertsExists = false;
    let anomalyExists = false;

    for (const status of data.status.statuses) {
      if (status.id.includes(alertsPluginID)) {
        alertsExists = true;
      }
      if (status.id.includes(anomalyPluginID)) {
        anomalyExists = true;
      }
    }

    setAlertsPluginExists(alertsExists);
    setAnomalyPluginExists(anomalyExists);
  } catch (error) {
    console.error('Error checking plugin installation status:', error);
  }
};

const navigateToApp = (appId: string, path: string) => {
  coreRefs?.application!.navigateToApp(appId, {
    path: `${path}`,
  });
};

export type AppAnalyticsCoreDeps = TraceAnalyticsCoreDeps;

interface HomeProps extends RouteComponentProps, AppAnalyticsCoreDeps {
  parentBreadcrumbs: ChromeBreadcrumb[];
  contentManagement: ContentManagementPluginStart;
}

const HomeContent = ({ alertsPluginExists, anomalyPluginExists }) => (
  <div>
    <EuiSpacer size="l" />
    <EuiText>
      <h2>Observability overview</h2>
    </EuiText>
    <EuiSpacer size="l" />
    <EuiFlexGroup gutterSize="l">
      {[
        {
          id: gettingStartedURL,
          title: 'Get started collecting and analyzing data.',
          description: 'getting started guide',
        },
        {
          id: discoverURL,
          title: 'Uncover insights with raw data exploration.',
          description: 'with Discover',
          path: 'discover',
        },
        {
          id: metricsURL,
          title: 'Transform logs into actionable visualizations with metrics extraction.',
          description: 'with Metrics',
        },
        {
          id: tracesURL,
          title: 'Unveil performance bottlenecks with event flow visualization.',
          description: 'with Traces',
        },
        {
          id: alertsURL,
          title: 'Proactively identify risks with customizable alert triggers.',
          description: 'with Alerts',
          exists: alertsPluginExists,
        },
        {
          id: anomalyDetectionURL,
          title: 'Unveil anomalies with real-time data monitoring.',
          description: 'with Anomaly Detectors',
          exists: anomalyPluginExists,
        },
      ]
        .filter((card) => card.exists !== false)
        .map((card) => (
          <EuiFlexItem key={card.id} style={{ maxWidth: '300px' }}>
            <EuiCard
              textAlign="left"
              layout="vertical"
              title={card.title}
              footer={card.description}
              onClick={() => navigateToApp(card.id, `${card.path ?? '#/'}`)}
            />
          </EuiFlexItem>
        ))}
    </EuiFlexGroup>
    <EuiSpacer size="l" />
  </div>
);

export const LEARN_OPENSEARCH_CONFIG = {
  title: i18n.translate('homepage.card.learnOpenSearch.title', {
    defaultMessage: 'Learn Opensearch',
  }),
  list: [
    {
      label: 'Quickstart guide',
      href: 'https://opensearch.org/docs/latest/dashboards/quickstart/',
      description: 'Get started in minutes with OpenSearch Dashboards',
    },
    {
      label: 'Building data visualizations',
      href: 'https://opensearch.org/docs/latest/dashboards/visualize/viz-index/',
      description: 'Design interactive charts and graphs to unlock insights form your data.',
    },
    {
      label: 'Creating dashboards',
      href: 'https://opensearch.org/docs/latest/dashboards/dashboard/index/',
      description: 'Build interactive dashboards to explore and analyze your data',
    },
  ],
  allLink: 'https://opensearch.org/docs/latest/',
};

export const WHATS_NEW_CONFIG = {
  title: i18n.translate('homepage.card.whatsNew.title', {
    defaultMessage: `What's New`,
  }),
  list: [
    {
      label: 'Quickstart guide',
      href: 'https://opensearch.org/docs/latest/dashboards/quickstart/',
      description: 'Get started in minutes with OpenSearch Dashboards',
    },
  ],
};

interface Config {
  title: string;
  list: Array<{
    label: string;
    href: string;
    description: string;
  }>;
  allLink?: string;
}

export const HomeListCard = ({ config }: { config: Config }) => {
  return (
    <>
      <EuiPanel paddingSize="s" hasBorder={false} hasShadow={false}>
        <EuiTitle>
          <h4>{config.title}</h4>
        </EuiTitle>
        <EuiSpacer />
        {config.list.length > 0 && (
          <EuiDescriptionList>
            {config.list.map((item) => (
              <>
                <EuiDescriptionListTitle>
                  <EuiLink href={item.href} target="_blank">
                    {item.label}
                  </EuiLink>
                </EuiDescriptionListTitle>
                <EuiDescriptionListDescription>{item.description}</EuiDescriptionListDescription>
              </>
            ))}
          </EuiDescriptionList>
        )}

        {config.allLink ? (
          <>
            <EuiSpacer />
            <EuiLink href={config.allLink} target="_blank">
              <EuiText size="s" style={{ display: 'inline' }}>
                View all
              </EuiText>
            </EuiLink>
          </>
        ) : null}
      </EuiPanel>
    </>
  );
};

coreRefs.contentManagement?.registerContentProvider({
  id: 'obsCards',
  getContent: () => ({
    id: 'whats_new',
    kind: 'custom',
    order: 3,
    render: () =>
      React.createElement(HomeListCard, {
        config: WHATS_NEW_CONFIG,
      }),
  }),
  getTargetArea: () => HOME_CONTENT_AREAS.DELETE_EXAMPLE,
});
coreRefs.contentManagement?.registerContentProvider({
  id: 'obsCards1',
  getContent: () => ({
    id: 'learn_opensearch',
    kind: 'custom',
    order: 4,
    render: () =>
      React.createElement(HomeListCard, {
        config: LEARN_OPENSEARCH_CONFIG,
      }),
  }),
  getTargetArea: () => HOME_CONTENT_AREAS.DELETE_EXAMPLE,
});

export const Home = ({ contentManagement, ..._props }: HomeProps) => {
  const [alertsPluginExists, setAlertsPluginExists] = useState(false);
  const [anomalyPluginExists, setAnomalyPluginExists] = useState(false);

  useEffect(() => {
    checkIfPluginsAreInstalled(setAlertsPluginExists, setAnomalyPluginExists);
  }, []);

  const homepage = coreRefs.contentManagement?.renderPage(HOME_PAGE_ID);

  return (
    <div>
      <HashRouter>
        <Switch>
          <Route exact path="/">
            {homepage}
          </Route>
        </Switch>
      </HashRouter>
    </div>
  );
};

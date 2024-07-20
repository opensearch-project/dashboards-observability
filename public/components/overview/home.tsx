/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { HashRouter, RouteComponentProps, Switch, Route } from 'react-router-dom';
import {
  EuiAccordion,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiCard,
} from '@elastic/eui';
import { TraceAnalyticsCoreDeps } from '../trace_analytics/home';
import { ChromeBreadcrumb } from '../../../../../src/core/public';
import { coreRefs } from '../../../public/framework/core_refs';

const alertsPluginID = 'alerting';
const anomalyPluginID = 'anomalyDetection';

// Plugin URLS
const gettingStartedURL = 'observability-gettingStarted';
const discoverURL = 'data-explorer';
const metricsURL = 'observability-metrics';
const tracesURL = 'observability-traces';
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
    path: `#${path}`,
  });
};

export type AppAnalyticsCoreDeps = TraceAnalyticsCoreDeps;

interface HomeProps extends RouteComponentProps, AppAnalyticsCoreDeps {
  parentBreadcrumbs: ChromeBreadcrumb[];
}

const HomeContent = ({
  alertsPluginExists,
  anomalyPluginExists,
}: {
  alertsPluginExists: boolean;
  anomalyPluginExists: boolean;
}) => (
  <div>
    <EuiAccordion id="home-accordion" buttonContent="Home" paddingSize="m" initialIsOpen={true}>
      <EuiText>
        <h2>Observability overview</h2>
        <p>Get Started</p>
      </EuiText>
      <EuiSpacer size="l" />
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem>
          <EuiCard
            layout="vertical"
            title="get started collecting and analyzing data"
            description={'getting started guide'}
            onClick={() => navigateToApp(gettingStartedURL, '/')}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiCard
            layout="vertical"
            title="uncover insights with raw data exploration"
            description={'with discover'}
            onClick={() => navigateToApp(discoverURL, '/')}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiCard
            layout="vertical"
            title="transform logs into actionable visualizations with metrics extraction"
            description={'with metrics'}
            onClick={() => navigateToApp(metricsURL, '/')}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiCard
            layout="vertical"
            title="unveil performance bottlenecks with event flow visualization"
            description={'with traces'}
            onClick={() => navigateToApp(tracesURL, '/')}
          />
        </EuiFlexItem>
        {alertsPluginExists && (
          <EuiFlexItem>
            <EuiCard
              layout="vertical"
              title="proactively identify risks with customizable alert triggers"
              description={'with alerts'}
              onClick={() => navigateToApp(alertsURL, '/')}
            />
          </EuiFlexItem>
        )}
        {anomalyPluginExists && (
          <EuiFlexItem>
            <EuiCard
              layout="vertical"
              title="...to be added...."
              description={'with anomaly detection'}
              onClick={() => navigateToApp(anomalyDetectionURL, '/')}
            />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </EuiAccordion>
    <EuiSpacer size="l" />
    <EuiPanel style={{ minHeight: '400px' }}>
      <EuiText>
        <h3>Embedded Dashboard</h3>
        <p>This section will hold the embedded dashboard.</p>
      </EuiText>
    </EuiPanel>
  </div>
);

export const Home = (_props: HomeProps) => {
  const [alertsPluginExists, setAlertsPluginExists] = useState(false);
  const [anomalyPluginExists, setAnomalyPluginExists] = useState(false);

  useEffect(() => {
    checkIfPluginsAreInstalled(setAlertsPluginExists, setAnomalyPluginExists);
  }, []);

  return (
    <div>
      <HashRouter>
        <Switch>
          <Route
            exact
            path="/"
            render={() => (
              <HomeContent
                alertsPluginExists={alertsPluginExists}
                anomalyPluginExists={anomalyPluginExists}
              />
            )}
          />
        </Switch>
      </HashRouter>
    </div>
  );
};

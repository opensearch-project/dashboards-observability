/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
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

const changeUrl = (destination) => {
  const baseUrl = window.location.href.split('app/')[0] + 'app/';
  const newUrl = `${baseUrl}${destination}`;
  window.location.href = newUrl;
};

export type AppAnalyticsCoreDeps = TraceAnalyticsCoreDeps;

interface HomeProps extends RouteComponentProps, AppAnalyticsCoreDeps {
  parentBreadcrumbs: ChromeBreadcrumb[];
}

const HomeContent = () => (
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
            onClick={() => changeUrl('observability-gettingStarted#/')}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiCard
            layout="vertical"
            title="uncover insights with raw data exploration"
            description={'with discover'}
            onClick={() => changeUrl('observability-logs#/')}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiCard
            layout="vertical"
            title="transform logs into actionable visualizations with metrics extraction"
            description={'with metrics'}
            onClick={() => changeUrl('observability-metrics#/')}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiCard
            layout="vertical"
            title="unveil performance bottlenecks with event flow visualization"
            description={'with traces'}
            onClick={() => changeUrl('observability-traces#/')}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiCard
            layout="vertical"
            title="proactively identify risks with customizable alert triggers"
            description={'with alerts'}
            onClick={() => changeUrl('alerts#/')}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiCard
            layout="vertical"
            title="See more ways to get started"
            description={''}
            onClick={() => changeUrl('learn-more#/')}
          />
        </EuiFlexItem>
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
  return (
    <div>
      <HashRouter>
        <Switch>
          <Route exact path="/" component={HomeContent} />
        </Switch>
      </HashRouter>
    </div>
  );
};

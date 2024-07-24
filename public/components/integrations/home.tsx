/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HashRouter, Route, RouteComponentProps, Switch } from 'react-router-dom';
import { TraceAnalyticsCoreDeps } from '../trace_analytics/home';
import { ChromeBreadcrumb } from '../../../../../src/core/public';
import { AvailableIntegrationOverviewPage } from './components/available_integration_overview_page';
import { AddedIntegrationOverviewPage } from './components/added_integration_overview_page';
import { AddedIntegration } from './components/added_integration';
import { SetupIntegrationPage } from './components/setup_integration';
import { Integration } from './components/integration';

export type AppAnalyticsCoreDeps = TraceAnalyticsCoreDeps;

interface HomeProps extends RouteComponentProps, AppAnalyticsCoreDeps {
  parentBreadcrumbs: ChromeBreadcrumb[];
}

export const Home = (props: HomeProps) => {
  const { http, chrome } = props;

  const commonProps = {
    http,
    chrome,
  };

  return (
    <div>
      <HashRouter>
        <Switch>
          <Route
            exact
            path={'/available'}
            render={() => <AvailableIntegrationOverviewPage {...commonProps} />}
          />
          <Route
            exact
            path={['/', '/installed']}
            render={() => <AddedIntegrationOverviewPage {...commonProps} />}
          />
          <Route
            exact
            path={'/installed/:id+'}
            render={(routerProps) => (
              <AddedIntegration
                integrationInstanceId={decodeURIComponent(routerProps.match.params.id)}
                {...commonProps}
              />
            )}
          />
          <Route
            exact
            path={'/available/:id'}
            render={(routerProps) => (
              <Integration
                integrationTemplateId={decodeURIComponent(routerProps.match.params.id)}
                {...commonProps}
              />
            )}
          />
          <Route
            exact
            path={'/available/:id/setup'}
            render={(routerProps) => (
              <SetupIntegrationPage integration={decodeURIComponent(routerProps.match.params.id)} />
            )}
          />
        </Switch>
      </HashRouter>
    </div>
  );
};

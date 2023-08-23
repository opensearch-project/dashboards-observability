/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { HashRouter, Route, RouteComponentProps, Switch } from 'react-router-dom';
import { EuiGlobalToastList } from '@elastic/eui';
import { Toast } from '@elastic/eui/src/components/toast/global_toast_list';
import PPLService from 'public/services/requests/ppl';
import { Integration } from './components/integration';
import { TraceAnalyticsCoreDeps } from '../trace_analytics/home';
import { ChromeBreadcrumb } from '../../../../../src/core/public';
import { AvailableIntegrationOverviewPage } from './components/available_integration_overview_page';
import { AddedIntegrationOverviewPage } from './components/added_integration_overview_page';
import { AddedIntegration } from './components/added_integration';
import { Accelerate } from '../flint/components/accelerate_page';
import { TestPage } from '../flint/components/test_page';
import { DataSource } from '../flint/components/datasource';
import { Table } from '../flint/components/table';
import { Configure } from '../flint/components/configure_datasource';
import { Datasources } from '../flint/components/datasources';

export type AppAnalyticsCoreDeps = TraceAnalyticsCoreDeps;

interface HomeProps extends RouteComponentProps, AppAnalyticsCoreDeps {
  parentBreadcrumbs: ChromeBreadcrumb[];
  pplService: any;
}

export const Home = (props: HomeProps) => {
  const { http, chrome, pplService } = props;

  const commonProps = {
    http,
    chrome,
    pplService,
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
            path={'/available/:id+'}
            render={(routerProps) => (
              <Integration
                integrationTemplateId={decodeURIComponent(routerProps.match.params.id)}
                {...commonProps}
              />
            )}
          />
        </Switch>
      </HashRouter>
    </div>
  );
};

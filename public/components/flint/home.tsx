/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HashRouter, Route, RouteComponentProps, Switch } from 'react-router-dom';
import { TraceAnalyticsCoreDeps } from '../trace_analytics/home';
import { ChromeBreadcrumb, ChromeStart, HttpStart } from '../../../../../src/core/public';
import { Accelerate } from '../flint/components/accelerate_page';
import { TestPage } from '../flint/components/test_page';
import { DataSource } from '../flint/components/datasource';
import { Table } from '../flint/components/table';
import { Configure } from '../flint/components/configure_datasource';
import { Datasources } from '../flint/components/datasources';
import {
  AddedIntegrationsTable,
  ManageDatasourcesTable,
} from './components/manage_datasource_table';

export type AppAnalyticsCoreDeps = TraceAnalyticsCoreDeps;

export interface HomeProps extends RouteComponentProps, AppAnalyticsCoreDeps {
  pplService: any;
  parentBreadcrumb: ChromeBreadcrumb;
  http: HttpStart;
  chrome: ChromeStart;
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
            path={'/accelerate'}
            render={(routerProps) => <Accelerate {...commonProps} />}
          />
          <Route
            exacts
            path={'/accelerateAsModal'}
            render={(routerProps) => <TestPage {...commonProps} />}
          />
          {/* needs to go before the Datasource*/}
          <Route
            exact
            path={'/accelerate/:id/:table'}
            render={(routerProps) => (
              <Table
                {...commonProps}
                dataSource={decodeURIComponent(routerProps.match.params.id)}
                table={decodeURIComponent(routerProps.match.params.table)}
              />
            )}
          />

          <Route
            exact
            path={'/manage/:id+'}
            render={(routerProps) => (
              <DataSource
                {...commonProps}
                dataSource={decodeURIComponent(routerProps.match.params.id)}
              />
            )}
          />

          <Route exact path={'/new'} render={(routerProps) => <Datasources {...commonProps} />} />

          <Route
            exact
            path={['/', '/manage']}
            render={(routerProps) => <ManageDatasourcesTable {...commonProps} />}
          />

          <Route
            exact
            path={'/configure'}
            render={(routerProps) => <Configure {...commonProps} />}
          />
        </Switch>
      </HashRouter>
    </div>
  );
};

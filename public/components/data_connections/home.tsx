/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HashRouter, Route, RouteComponentProps, Switch } from 'react-router-dom';
import { ChromeBreadcrumb, ChromeStart, HttpStart } from '../../../../../src/core/public';
import { DataSource } from './components/datasource';
import { ManageDatasourcesTable } from './components/manage_datasource_table';

export interface HomeProps extends RouteComponentProps {
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
            path={'/manage/:id+'}
            render={(routerProps) => (
              <DataSource
                {...commonProps}
                dataSource={decodeURIComponent(routerProps.match.params.id)}
              />
            )}
          />

          <Route
            exact
            path={['/', '/manage']}
            render={(routerProps) => <ManageDatasourcesTable {...commonProps} />}
          />
        </Switch>
      </HashRouter>
    </div>
  );
};

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HashRouter, Route, RouteComponentProps, Switch } from 'react-router-dom';
import { ChromeBreadcrumb, ChromeStart, HttpStart } from '../../../../../src/core/public';
import { DataConnection } from './components/data_connection';
import { ManageDataConnectionsTable } from './components/manage_data_connections_table';
import { AccelerationIndices } from './components/acceleration_ui/acceleration_indices';

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
    <HashRouter>
      <Switch>
        <Route
          exact
          path={'/manage/:id+'}
          render={(routerProps) => (
            <DataConnection
              {...commonProps}
              dataSource={decodeURIComponent(routerProps.match.params.id)}
            />
          )}
        />

        <Route
          exact
          path={['/', '/manage']}
          render={(routerProps) => <ManageDataConnectionsTable {...commonProps} />}
        />

        <Route
          path={'/acceleration/:id+'}
          render={(routerProps) => (
            <AccelerationIndices dataConnection={decodeURIComponent(routerProps.match.params.id)} />
          )}
        />
      </Switch>
    </HashRouter>
  );
};

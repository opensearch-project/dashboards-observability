/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HashRouter, Route, RouteComponentProps, Switch } from 'react-router-dom';
import {
  ChromeBreadcrumb,
  ChromeStart,
  HttpStart,
  NotificationsStart,
} from '../../../../../src/core/public';
import { DataConnection } from './components/manage/data_connection';
import { ManageDataConnectionsTable } from './components/manage/manage_data_connections_table';
import { NewDatasource } from './components/new/new_datasource';
import { Configure } from './components/new/configure_datasource';

export interface HomeProps extends RouteComponentProps {
  pplService: any;
  parentBreadcrumb: ChromeBreadcrumb;
  http: HttpStart;
  chrome: ChromeStart;
  notifications: NotificationsStart;
}

export const Home = (props: HomeProps) => {
  const { http, chrome, pplService, notifications } = props;

  const commonProps = {
    http,
    chrome,
    pplService,
    notifications,
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
        <Route exact path={['/new']} render={(routerProps) => <NewDatasource {...commonProps} />} />

        <Route
          exact
          path={['/configure/:id+']}
          render={(routerProps) => (
            <Configure {...commonProps} urlType={decodeURIComponent(routerProps.match.params.id)} />
          )}
        />
      </Switch>
    </HashRouter>
  );
};

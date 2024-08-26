/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HashRouter, Route, RouteComponentProps, Switch } from 'react-router-dom';
import {
  ChromeBreadcrumb,
  MountPoint,
  NotificationsStart,
  SavedObjectsStart,
} from '../../../../../src/core/public';
import { DataSourceManagementPluginSetup } from '../../../../../src/plugins/data_source_management/public';
import { TraceAnalyticsCoreDeps } from '../trace_analytics/home';
import { AddedIntegration } from './components/added_integration';
import { AddedIntegrationOverviewPage } from './components/added_integration_overview_page';
import { AvailableIntegrationOverviewPage } from './components/available_integration_overview_page';
import { Integration } from './components/integration';
import { SetupIntegrationPage } from './components/setup_integration';

export type AppAnalyticsCoreDeps = TraceAnalyticsCoreDeps;

interface HomeProps extends RouteComponentProps, AppAnalyticsCoreDeps {
  parentBreadcrumbs: ChromeBreadcrumb[];
  notifications: NotificationsStart;
  dataSourceEnabled: boolean;
  dataSourceManagement: DataSourceManagementPluginSetup;
  savedObjectsMDSClient: SavedObjectsStart;
  setActionMenu: (menuMount: MountPoint | undefined) => void;
}

export const Home = (props: HomeProps) => {
  const {
    http,
    chrome,
    dataSourceEnabled,
    dataSourceManagement,
    savedObjectsMDSClient,
    notifications,
    setActionMenu,
  } = props;

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
            render={() => (
              <AddedIntegrationOverviewPage
                {...commonProps}
                dataSourceEnabled={dataSourceEnabled}
              />
            )}
          />
          <Route
            exact
            path={'/installed/:id+'}
            render={(routerProps) => (
              <AddedIntegration
                integrationInstanceId={decodeURIComponent(routerProps.match.params.id)}
                {...commonProps}
                dataSourceManagement={dataSourceManagement}
                notifications={notifications}
                dataSourceEnabled={dataSourceEnabled}
                savedObjectsMDSClient={savedObjectsMDSClient}
                setActionMenu={setActionMenu}
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
                dataSourceManagement={dataSourceManagement}
                notifications={notifications}
                dataSourceEnabled={dataSourceEnabled}
                savedObjectsMDSClient={savedObjectsMDSClient}
              />
            )}
          />
          <Route
            exact
            path={'/available/:id/setup'}
            render={(routerProps) => (
              <SetupIntegrationPage
                integration={decodeURIComponent(routerProps.match.params.id)}
                dataSourceManagement={dataSourceManagement}
                notifications={notifications}
                dataSourceEnabled={dataSourceEnabled}
                savedObjectsMDSClient={savedObjectsMDSClient}
              />
            )}
          />
        </Switch>
      </HashRouter>
    </div>
  );
};

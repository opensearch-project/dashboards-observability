/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { I18nProvider } from '@osd/i18n/react';
import { QueryManager } from 'common/query_manager';
import React from 'react';
import { Provider } from 'react-redux';
import { CoreStart, MountPoint } from '../../../../src/core/public';
import { DataSourceManagementPluginSetup } from '../../../../src/plugins/data_source_management/public';
import { observabilityID, observabilityTitle } from '../../common/constants/shared';
import { store } from '../framework/redux/store';
import { AppPluginStartDependencies } from '../types';
import { Home as ApplicationAnalyticsHome } from './application_analytics/home';
import { MetricsListener } from './common/metrics_listener';
import { Home as CustomPanelsHome } from './custom_panels/home';
import { Home as DataConnectionsHome } from './datasources/home';
import { EventAnalytics } from './event_analytics';
import { Home as IntegrationsHome } from './integrations/home';
import { Home as MetricsHome } from './metrics/index';
import { Main as NotebooksHome } from './notebooks/components/main';
import { Home as TraceAnalyticsHome } from './trace_analytics/home';

interface ObservabilityAppDeps {
  CoreStartProp: CoreStart;
  DepsStart: AppPluginStartDependencies;
  pplService: any;
  dslService: any;
  savedObjects: any;
  config: PublicConfig;
  timestampUtils: any;
  queryManager: QueryManager;
  startPage: string;
  dataSourceEnabled: boolean;
  dataSourceManagement: DataSourceManagementPluginSetup;
  setActionMenu: (menuMount: MountPoint | undefined) => void;
  savedObjectsMDSClient: CoreStart['savedObjects'];
}

// for cypress to test redux store
if (window.Cypress) {
  window.store = store;
}

const pages = {
  applications: ApplicationAnalyticsHome,
  logs: EventAnalytics,
  metrics: MetricsHome,
  traces: TraceAnalyticsHome,
  notebooks: NotebooksHome,
  dashboards: CustomPanelsHome,
  integrations: IntegrationsHome,
  dataconnections: DataConnectionsHome,
};

export const App = ({
  CoreStartProp,
  DepsStart,
  pplService,
  dslService,
  savedObjects,
  config,
  timestampUtils,
  queryManager,
  startPage,
  dataSourcePluggables,
  dataSourceManagement,
  setActionMenu,
  dataSourceEnabled,
  savedObjectsMDSClient,
}: ObservabilityAppDeps) => {
  const { chrome, http, notifications } = CoreStartProp;
  const parentBreadcrumb = {
    text: observabilityTitle,
    href: `${observabilityID}#/`,
  };

  const ModuleComponent = pages[startPage];

  return (
    <Provider store={store}>
      <I18nProvider>
        <MetricsListener http={http}>
          <ModuleComponent
            http={http}
            chrome={chrome}
            notifications={notifications}
            CoreStartProp={CoreStartProp}
            DepsStart={DepsStart}
            DashboardContainerByValueRenderer={
              DepsStart.dashboard.DashboardContainerByValueRenderer
            }
            pplService={pplService}
            dslService={dslService}
            savedObjects={savedObjects}
            config={config}
            timestampUtils={timestampUtils}
            queryManager={queryManager}
            parentBreadcrumb={parentBreadcrumb}
            parentBreadcrumbs={[parentBreadcrumb]}
            setBreadcrumbs={chrome.setBreadcrumbs}
            dataSourcePluggables={dataSourcePluggables}
            dataSourceManagement={dataSourceManagement}
            dataSourceEnabled={dataSourceEnabled}
            setActionMenu={setActionMenu}
            savedObjectsMDSClient={savedObjectsMDSClient}
          />
        </MetricsListener>
      </I18nProvider>
    </Provider>
  );
};

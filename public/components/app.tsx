/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { I18nProvider } from '@osd/i18n/react';
import { QueryManager } from 'common/query_manager';
import React from 'react';
import { Provider } from 'react-redux';
import { CoreStart } from '../../../../src/core/public';
import { observabilityID, observabilityTitle } from '../../common/constants/shared';
import { store } from '../framework/redux/store';
import { AppPluginStartDependencies } from '../types';
import { Home as ApplicationAnalyticsHome } from './application_analytics/home';
import { MetricsListener } from './common/metrics_listener';
import { Home as CustomPanelsHome } from './custom_panels/home';
import { EventAnalytics } from './event_analytics';
import { Home as MetricsHome } from './metrics/index';
import { Main as NotebooksHome } from './notebooks/components/main';
import { Home as TraceAnalyticsHome } from './trace_analytics/home';

interface ObservabilityAppDeps {
  CoreStartProp: CoreStart;
  DepsStart: AppPluginStartDependencies;
  pplService: any;
  dslService: any;
  savedObjects: any;
  timestampUtils: any;
  queryManager: QueryManager;
  startPage: string;
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
};

export const App = ({
  CoreStartProp,
  DepsStart,
  pplService,
  dslService,
  savedObjects,
  timestampUtils,
  queryManager,
  startPage,
}: ObservabilityAppDeps) => {
  const { chrome, http, notifications, savedObjects: coreSavedObjects } = CoreStartProp;
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
            timestampUtils={timestampUtils}
            queryManager={queryManager}
            parentBreadcrumb={parentBreadcrumb}
            parentBreadcrumbs={[parentBreadcrumb]}
            setBreadcrumbs={chrome.setBreadcrumbs}
          />
        </MetricsListener>
      </I18nProvider>
    </Provider>
  );
};

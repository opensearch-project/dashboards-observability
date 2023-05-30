/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { HashRouter, Route, RouteComponentProps, Switch } from 'react-router-dom';
import { EuiGlobalToastList } from '@elastic/eui';
import { Toast } from '@elastic/eui/src/components/toast/global_toast_list';
import { Integration } from './components/integration';
import { TraceAnalyticsCoreDeps } from '../trace_analytics/home';
import { ChromeBreadcrumb } from '../../../../../src/core/public';
import { AvailableIntegrationOverviewPage } from './components/available_integration_overview_page';
import { Sidebar } from './components/integration_side_nav';
import { AddedIntegrationOverviewPage } from './components/added_integration_overview_page';
import { AddedIntegration } from './components/added_integration';

export type AppAnalyticsCoreDeps = TraceAnalyticsCoreDeps;

interface HomeProps extends RouteComponentProps, AppAnalyticsCoreDeps {
  parentBreadcrumbs: ChromeBreadcrumb[];
}

export const Home = (props: HomeProps) => {
  const { parentBreadcrumbs, http, chrome } = props;
  const [toasts, setToasts] = useState<Toast[]>([]);

  const commonProps = {
    parentBreadcrumbs,
    http,
    chrome,
  };

  return (
    <div>
      <EuiGlobalToastList
        toasts={toasts}
        dismissToast={(removedToast) => {
          setToasts(toasts.filter((toast) => toast.id !== removedToast.id));
        }}
        toastLifeTimeMs={6000}
      />
      <HashRouter>
        <Switch>
          <Route
            exact
            path={['/', '/available']}
            render={() => (
              <Sidebar>
                <AvailableIntegrationOverviewPage {...commonProps} />
              </Sidebar>
            )}
          />
          <Route
            exact
            path={'/added'}
            render={() => (
              <Sidebar>
                <AddedIntegrationOverviewPage {...commonProps} />
              </Sidebar>
            )}
          />
          <Route
            exact
            path={'/added/:id+'}
            render={(routerProps) => (
              <Sidebar>
                <AddedIntegration
                  integrationInstanceId={decodeURIComponent(routerProps.match.params.id)}
                  {...commonProps}
                />
              </Sidebar>
            )}
          />
          <Route
            exact
            path={'/available/:id+'}
            render={(routerProps) => (
              <Sidebar>
                <Integration
                  integrationTemplateId={decodeURIComponent(routerProps.match.params.id)}
                  {...commonProps}
                />
              </Sidebar>
            )}
          />
        </Switch>
      </HashRouter>
    </div>
  );
};

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HashRouter, Route, RouteComponentProps, Switch } from 'react-router-dom';
import { TraceAnalyticsCoreDeps } from '../trace_analytics/home';
import {
  ChromeBreadcrumb,
  ChromeStart,
  HttpStart,
  NotificationsStart,
} from '../../../../../src/core/public';
import { NewGettingStarted } from './components/getting_started';
import { AccordionFilterPage } from './components/accordionFilterPage';

export type AppAnalyticsCoreDeps = TraceAnalyticsCoreDeps;

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
    <div>
      <HashRouter>
        <Switch>
          <Route
            exact
            path={['/']}
            render={(_routerProps) => <NewGettingStarted {...commonProps} />}
          />
          <Route path="/accordion-filter" render={(_routerProps) => <AccordionFilterPage />} />
        </Switch>
      </HashRouter>
    </div>
  );
};

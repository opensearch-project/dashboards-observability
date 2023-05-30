/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import React, { ReactChild, useEffect, useState } from 'react';
import { HashRouter, Route, RouteComponentProps, Switch } from 'react-router-dom';
import DSLService from 'public/services/requests/dsl';
import PPLService from 'public/services/requests/ppl';
import SavedObjects from 'public/services/saved_objects/event_analytics/saved_objects';
import TimestampUtils from 'public/services/timestamp/timestamp';
import { EuiGlobalToastList } from '@elastic/eui';
import { Toast } from '@elastic/eui/src/components/toast/global_toast_list';
import { Integration } from './components/integration';
import { TraceAnalyticsComponentDeps, TraceAnalyticsCoreDeps } from '../trace_analytics/home';
import { FilterType } from '../trace_analytics/components/common/filters/filters';
import { handleDataPrepperIndicesExistRequest } from '../trace_analytics/requests/request_handler';
import { ChromeBreadcrumb, NotificationsStart } from '../../../../../src/core/public';
import { QueryManager } from '../../../common/query_manager/ppl_query_manager';
import { AvailableIntegrationOverviewPage } from './components/available_integration_overview_page';
import { Sidebar } from './components/integration_side_nav';
import { AddedIntegrationOverviewPage } from './components/added_integration_overview_page';
import { AddedIntegration } from './components/added_integration';

export type AppAnalyticsCoreDeps = TraceAnalyticsCoreDeps;

interface HomeProps extends RouteComponentProps, AppAnalyticsCoreDeps {
  pplService: PPLService;
  dslService: DSLService;
  savedObjects: SavedObjects;
  timestampUtils: TimestampUtils;
  notifications: NotificationsStart;
  queryManager: QueryManager;
  parentBreadcrumbs: ChromeBreadcrumb[];
}

export interface AppAnalyticsComponentDeps extends TraceAnalyticsComponentDeps {
  name: string;
  description: string;
  setNameWithStorage: (newName: string) => void;
  setDescriptionWithStorage: (newDescription: string) => void;
  setQueryWithStorage: (newQuery: string) => void;
  setFiltersWithStorage: (newFilters: FilterType[]) => void;
  setAppConfigs: (newAppConfigs: FilterType[]) => void;
  parentBreadcrumbs: ChromeBreadcrumb[];
}

export const Home = (props: HomeProps) => {
  const {
    pplService,
    dslService,
    timestampUtils,
    savedObjects,
    parentBreadcrumbs,
    http,
    chrome,
    notifications,
    queryManager,
  } = props;
  const [triggerSwitchToEvent, setTriggerSwitchToEvent] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [indicesExist, setIndicesExist] = useState(true);
  const [appConfigs, setAppConfigs] = useState<FilterType[]>([]);
  const storedFilters = sessionStorage.getItem('AppAnalyticsFilters');
  const [filters, setFilters] = useState<FilterType[]>(
    storedFilters ? JSON.parse(storedFilters) : []
  );
  const [name, setName] = useState(sessionStorage.getItem('AppAnalyticsName') || '');
  const [description, setDescription] = useState(
    sessionStorage.getItem('AppAnalyticsDescription') || ''
  );
  const [query, setQuery] = useState<string>(sessionStorage.getItem('AppAnalyticsQuery') || '');
  const [startTime, setStartTime] = useState<string>(
    sessionStorage.getItem('AppAnalyticsStartTime') || 'now-24h'
  );
  const [endTime, setEndTime] = useState<string>(
    sessionStorage.getItem('AppAnalyticsEndTime') || 'now'
  );

  // Setting state with storage to save input when user refreshes page
  const setFiltersWithStorage = (newFilters: FilterType[]) => {
    setFilters(newFilters);
    sessionStorage.setItem('AppAnalyticsFilters', JSON.stringify(newFilters));
  };
  const setNameWithStorage = (newName: string) => {
    setName(newName);
    sessionStorage.setItem('AppAnalyticsName', newName);
  };
  const setDescriptionWithStorage = (newDescription: string) => {
    setDescription(newDescription);
    sessionStorage.setItem('AppAnalyticsDescription', newDescription);
  };
  const setQueryWithStorage = (newQuery: string) => {
    setQuery(newQuery);
    sessionStorage.setItem('AppAnalyticsQuery', newQuery);
  };

  useEffect(() => {
    handleDataPrepperIndicesExistRequest(http, setIndicesExist);
  }, []);

  const commonProps: AppAnalyticsComponentDeps = {
    parentBreadcrumbs,
    http,
    chrome,
    name,
    setNameWithStorage,
    description,
    setDescriptionWithStorage,
    query,
    setQuery,
    setQueryWithStorage,
    appConfigs,
    setAppConfigs,
    filters,
    setFilters,
    setFiltersWithStorage,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    mode: 'data_prepper',
    dataPrepperIndicesExist: indicesExist,
  };

  const setToast = (title: string, color = 'success', text?: ReactChild) => {
    if (!text) text = '';
    setToasts([...toasts, { id: new Date().toISOString(), title, text, color } as Toast]);
  };

  const callback = (childFunc: () => void) => {
    if (childFunc && triggerSwitchToEvent > 0) {
      childFunc();
      setTriggerSwitchToEvent(triggerSwitchToEvent - 1);
    }
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
                  disabled={false}
                  appId={decodeURIComponent(routerProps.match.params.id)}
                  pplService={pplService}
                  dslService={dslService}
                  savedObjects={savedObjects}
                  timestampUtils={timestampUtils}
                  notifications={notifications}
                  setToasts={setToast}
                  updateApp={updateApp}
                  callback={callback}
                  queryManager={queryManager}
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
                  disabled={false}
                  appId={decodeURIComponent(routerProps.match.params.id)}
                  pplService={pplService}
                  dslService={dslService}
                  savedObjects={savedObjects}
                  timestampUtils={timestampUtils}
                  notifications={notifications}
                  setToasts={setToast}
                  updateApp={updateApp}
                  callback={callback}
                  queryManager={queryManager}
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

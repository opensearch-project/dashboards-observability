/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import '../../variables.scss';

import { EuiGlobalToastList } from '@elastic/eui';
import { Toast } from '@elastic/eui/src/components/toast/global_toast_list';
import { EmptyTabParams, EventAnalyticsProps } from 'common/types/explorer';
import { isEmpty } from 'lodash';
import React, { createContext, ReactChild, useState } from 'react';
import { HashRouter, Route, RouteComponentProps, Switch, useHistory } from 'react-router-dom';
import { useEffect } from 'react';
import { RAW_QUERY } from '../../../common/constants/explorer';
import { ObservabilitySideBar } from '../common/side_nav';
import { LogExplorer } from './explorer/log_explorer';
import { Home as EventExplorerHome } from './home/home';
import { observabilityID, observabilityTitle } from '../../../common/constants/shared';

export const LogExplorerRouterContext = createContext<{
  routerProps: RouteComponentProps;
  searchParams: URLSearchParams;
} | null>(null);

export const EventAnalytics = ({
  chrome,
  parentBreadcrumbs,
  pplService,
  dslService,
  savedObjects,
  timestampUtils,
  http,
  notifications,
  queryManager,
  setBreadcrumbs,
  ...props
}: EventAnalyticsProps) => {
  const history = useHistory();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const eventAnalyticsBreadcrumb = {
    text: 'Event analytics',
    href: '#/',
  };

  const setToast = (title: string, color = 'success', text?: ReactChild, side?: string) => {
    if (!text) text = '';
    setToasts([...toasts, { id: new Date().toISOString(), title, text, color } as Toast]);
  };

  const getExistingEmptyTab = ({ tabIds, queries, explorerData }: EmptyTabParams) => {
    let emptyTabId = '';
    for (let i = 0; i < tabIds!.length; i++) {
      const tid = tabIds![i];
      if (isEmpty(queries[tid][RAW_QUERY]) && isEmpty(explorerData[tid])) {
        emptyTabId = tid;
        break;
      }
    }
    return emptyTabId;
  };

  // useEffect(() => {
  //   chrome.setBreadcrumbs([
  //     ...parentBreadcrumbs,
  //     {
  //       text: 'Explorer',
  //       href: `#/`,
  //     },
  //   ]);
  // }, []);
  useEffect(() => {
    setBreadcrumbs([
      {
        text: observabilityTitle,
        href: `${observabilityID}#/`,
      },
      {
        text: 'Logs',
        href: `#/`,
      },
    ]);
  }, []);

  return (
    <>
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
            path={[`/:id`]}
            render={(routerProps) => {
              // setBreadcrumbs([
              //   parentBreadcrumbs,
              //   {
              //     text: 'Notebooks',
              //     href: '#/',
              //   },
              // ]);
              // setBreadcrumbs([
              //   parentBreadcrumbs,
              //   {
              //     text: 'Explorer',
              //     href: '#/',
              //   },
              // ]);
              return (
                <LogExplorerRouterContext.Provider
                  value={{
                    routerProps,
                    searchParams: new URLSearchParams(routerProps.location.search),
                  }}
                >
                  <LogExplorer
                    savedObjectId={routerProps.match.params.id}
                    pplService={pplService}
                    dslService={dslService}
                    savedObjects={savedObjects}
                    timestampUtils={timestampUtils}
                    http={http}
                    setToast={setToast}
                    getExistingEmptyTab={getExistingEmptyTab}
                    history={history}
                    notifications={notifications}
                    queryManager={queryManager}
                  />
                </LogExplorerRouterContext.Provider>
              );
            }}
          />
          <Route
            exact
            path={[`/`]}
            render={() => {
              // chrome.setBreadcrumbs([
              //   ...parentBreadcrumbs,
              //   eventAnalyticsBreadcrumb,
              //   {
              //     text: 'Home',
              //     href: '#/',
              //   },
              // ]);
              // setBreadcrumbs([
              //   parentBreadcrumbs,
              //   {
              //     text: 'Home',
              //     href: '#/',
              //   },
              // ]);
              return (
                <EventExplorerHome
                  http={http}
                  savedObjects={savedObjects}
                  dslService={dslService}
                  pplService={pplService}
                  setToast={setToast}
                  getExistingEmptyTab={getExistingEmptyTab}
                />
              );
            }}
          />
        </Switch>
      </HashRouter>
    </>
  );
};

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiGlobalToastList } from '@elastic/eui';
import { Toast } from '@elastic/eui/src/components/toast/global_toast_list';
import React, { ReactChild, useEffect, useState } from 'react';
import { HashRouter, Route, RouteComponentProps } from 'react-router-dom';
import { ChromeBreadcrumb, ChromeStart, HttpStart } from '../../../../../src/core/public';
import { FilterType } from './components/common/filters/filters';
import { SearchBarProps } from './components/common/search_bar';
import { Dashboard } from './components/dashboard';
import { Services, ServiceView } from './components/services';
import { Traces, TraceView } from './components/traces';
import {
  handleDataPrepperIndicesExistRequest,
  handleJaegerIndicesExistRequest,
} from './requests/request_handler';
import { TraceSideBar } from './trace_side_nav';

export interface TraceAnalyticsCoreDeps {
  parentBreadcrumb: ChromeBreadcrumb;
  http: HttpStart;
  chrome: ChromeStart;
}

interface HomeProps extends RouteComponentProps, TraceAnalyticsCoreDeps {}

export type TraceAnalyticsMode = 'jaeger' | 'data_prepper';

export interface TraceAnalyticsComponentDeps extends TraceAnalyticsCoreDeps, SearchBarProps {
  mode: TraceAnalyticsMode;
  modes: Array<{
    id: string;
    title: string;
  }>;
  setMode: (mode: TraceAnalyticsMode) => void;
  jaegerIndicesExist: boolean;
  dataPrepperIndicesExist: boolean;
}

export const Home = (props: HomeProps) => {
  const [dataPrepperIndicesExist, setDataPrepperIndicesExist] = useState(false);
  const [jaegerIndicesExist, setJaegerIndicesExist] = useState(false);
  const [mode, setMode] = useState<TraceAnalyticsMode>(
    (sessionStorage.getItem('TraceAnalyticsMode') as TraceAnalyticsMode) || 'jaeger'
  );
  const storedFilters = sessionStorage.getItem('TraceAnalyticsFilters');
  const [query, setQuery] = useState<string>(sessionStorage.getItem('TraceAnalyticsQuery') || '');
  const [filters, setFilters] = useState<FilterType[]>(
    storedFilters ? JSON.parse(storedFilters) : []
  );
  const [startTime, setStartTime] = useState<string>(
    sessionStorage.getItem('TraceAnalyticsStartTime') || 'now-5m'
  );
  const [endTime, setEndTime] = useState<string>(
    sessionStorage.getItem('TraceAnalyticsEndTime') || 'now'
  );

  const setFiltersWithStorage = (newFilters: FilterType[]) => {
    setFilters(newFilters);
    sessionStorage.setItem('TraceAnalyticsFilters', JSON.stringify(newFilters));
  };
  const setQueryWithStorage = (newQuery: string) => {
    setQuery(newQuery);
    sessionStorage.setItem('TraceAnalyticsQuery', newQuery);
  };
  const setStartTimeWithStorage = (newStartTime: string) => {
    setStartTime(newStartTime);
    sessionStorage.setItem('TraceAnalyticsStartTime', newStartTime);
  };
  const setEndTimeWithStorage = (newEndTime: string) => {
    setEndTime(newEndTime);
    sessionStorage.setItem('TraceAnalyticsEndTime', newEndTime);
  };
  const [toasts, setToasts] = useState<Toast[]>([]);

  const setToast = (title: string, color = 'success', text?: ReactChild, side?: string) => {
    if (!text) text = '';
    setToasts([...toasts, { id: new Date().toISOString(), title, text, color } as Toast]);
  };

  useEffect(() => {
    handleDataPrepperIndicesExistRequest(props.http, setDataPrepperIndicesExist);
    handleJaegerIndicesExistRequest(props.http, setJaegerIndicesExist);
  }, []);

  const modes = [
    { id: 'jaeger', title: 'Jaeger', 'data-test-subj': 'jaeger-mode' },
    { id: 'data_prepper', title: 'Data Prepper', 'data-test-subj': 'data-prepper-mode' },
  ];

  useEffect(() => {
    if (!sessionStorage.getItem('TraceAnalyticsMode')) {
      if (dataPrepperIndicesExist) {
        setMode('data_prepper');
      } else if (jaegerIndicesExist) {
        setMode('jaeger');
      }
    }
  }, [jaegerIndicesExist, dataPrepperIndicesExist]);

  const serviceBreadcrumbs = [
    {
      text: 'Trace analytics',
      href: '#/',
    },
    {
      text: 'Services',
      href: '#/services',
    },
  ];

  const traceBreadcrumbs = [
    {
      text: 'Trace analytics',
      href: '#/',
    },
    {
      text: 'Traces',
      href: '#/traces',
    },
  ];

  const nameColumnAction = (item: any) => location.assign(`#/services/${encodeURIComponent(item)}`);

  const traceColumnAction = () => location.assign('#/traces');

  const traceIdColumnAction = (item: any) =>
    location.assign(`#/traces/${encodeURIComponent(item)}`);

  const [appConfigs, _] = useState([]);

  const commonProps: TraceAnalyticsComponentDeps = {
    parentBreadcrumb: props.parentBreadcrumb,
    http: props.http,
    chrome: props.chrome,
    query,
    setQuery: setQueryWithStorage,
    filters,
    appConfigs,
    setFilters: setFiltersWithStorage,
    startTime,
    setStartTime: setStartTimeWithStorage,
    endTime,
    setEndTime: setEndTimeWithStorage,
    mode,
    modes,
    setMode: (traceMode: TraceAnalyticsMode) => {
      setMode(traceMode);
    },
    jaegerIndicesExist,
    dataPrepperIndicesExist,
  };

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
        <Route
          exact
          path="/traces"
          render={(routerProps) => (
            <TraceSideBar>
              <Traces
                page="traces"
                childBreadcrumbs={traceBreadcrumbs}
                traceIdColumnAction={traceIdColumnAction}
                {...commonProps}
              />
            </TraceSideBar>
          )}
        />
        <Route
          path="/traces/:id+"
          render={(routerProps) => (
            <TraceView
              parentBreadcrumb={props.parentBreadcrumb}
              chrome={props.chrome}
              http={props.http}
              traceId={decodeURIComponent(routerProps.match.params.id)}
              mode={mode}
            />
          )}
        />
        <Route
          exact
          path={['/services', '/']}
          render={(routerProps) => (
            <TraceSideBar>
              <Services
                page="services"
                childBreadcrumbs={serviceBreadcrumbs}
                nameColumnAction={nameColumnAction}
                traceColumnAction={traceColumnAction}
                toasts={toasts}
                {...commonProps}
              />
            </TraceSideBar>
          )}
        />
        <Route
          path="/services/:id+"
          render={(routerProps) => (
            <ServiceView
              serviceName={decodeURIComponent(routerProps.match.params.id)}
              {...commonProps}
              addFilter={(filter: FilterType) => {
                for (const addedFilter of filters) {
                  if (
                    addedFilter.field === filter.field &&
                    addedFilter.operator === filter.operator &&
                    addedFilter.value === filter.value
                  ) {
                    return;
                  }
                }
                const newFilters = [...filters, filter];
                setFiltersWithStorage(newFilters);
              }}
            />
          )}
        />
      </HashRouter>
    </>
  );
};

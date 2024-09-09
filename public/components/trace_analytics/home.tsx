/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiGlobalToastList } from '@elastic/eui';
import { Toast } from '@elastic/eui/src/components/toast/global_toast_list';
import React, { ReactChild, useEffect, useMemo, useState } from 'react';
import { HashRouter, Redirect, Route, RouteComponentProps } from 'react-router-dom';
import {
  ChromeBreadcrumb,
  ChromeStart,
  HttpStart,
  MountPoint,
  NotificationsStart,
  SavedObjectsStart,
} from '../../../../../src/core/public';
import {
  DataSourceManagementPluginSetup,
  DataSourceSelectableConfig,
} from '../../../../../src/plugins/data_source_management/public';
import { TraceAnalyticsMode } from '../../../common/types/trace_analytics';
import { dataSourceFilterFn } from '../../../common/utils/shared';
import { coreRefs } from '../../framework/core_refs';
import { FilterType } from './components/common/filters/filters';
import { getAttributes, getSpanIndices } from './components/common/helper_functions';
import { SearchBarProps } from './components/common/search_bar';
import { ServiceView, Services } from './components/services';
import { ServiceFlyout } from './components/services/service_flyout';
import { TraceView, Traces } from './components/traces';
import { SpanDetailFlyout } from './components/traces/span_detail_flyout';
import {
  handleDataPrepperIndicesExistRequest,
  handleJaegerIndicesExistRequest,
} from './requests/request_handler';
import { TraceSideBar } from './trace_side_nav';

export interface TraceAnalyticsCoreDeps {
  parentBreadcrumb: ChromeBreadcrumb;
  http: HttpStart;
  chrome: ChromeStart;
  notifications: NotificationsStart;
  dataSourceEnabled: boolean;
  dataSourceManagement: DataSourceManagementPluginSetup;
  setActionMenu: (menuMount: MountPoint | undefined) => void;
  savedObjectsMDSClient: SavedObjectsStart;
  defaultRoute?: string;
}

interface HomeProps extends RouteComponentProps, TraceAnalyticsCoreDeps {}

export interface TraceAnalyticsComponentDeps extends TraceAnalyticsCoreDeps, SearchBarProps {
  mode: TraceAnalyticsMode;
  modes: Array<{
    id: string;
    title: string;
  }>;
  setMode: (mode: TraceAnalyticsMode) => void;
  jaegerIndicesExist: boolean;
  dataPrepperIndicesExist: boolean;
  attributesFilterFields: string[];
  setSpanFlyout: ({
    spanId,
    isFlyoutVisible,
    addSpanFilter,
    spanMode,
    spanDataSourceMDSId,
  }: {
    spanId: string;
    isFlyoutVisible: boolean;
    addSpanFilter: (field: string, value: any) => void;
    spanMode: TraceAnalyticsMode;
    spanDataSourceMDSId: string;
  }) => void;
}

export const Home = (props: HomeProps) => {
  const [dataPrepperIndicesExist, setDataPrepperIndicesExist] = useState(false);
  const [jaegerIndicesExist, setJaegerIndicesExist] = useState(false);
  const [attributesFilterFields, setAttributesFilterFields] = useState<string[]>([]);
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

  const _setToast = (title: string, color = 'success', text?: ReactChild, _side?: string) => {
    if (!text) text = '';
    setToasts([...toasts, { id: new Date().toISOString(), title, text, color } as Toast]);
  };

  const [dataSourceMDSId, setDataSourceMDSId] = useState([{ id: '', label: '' }]);
  const [currentSelectedService, setCurrentSelectedService] = useState('');

  // Navigate a valid routes when suffixed with '/traces' and '/services'
  // Route defaults to traces page
  let defaultRoute = props.defaultRoute ?? '/traces';
  const currentHash = window.location.hash.split('#')[1] || '';
  if (currentHash.startsWith('/traces') || currentHash.startsWith('/services')) {
    defaultRoute = currentHash;
  }

  const { chrome } = props;
  const isNavGroupEnabled = chrome.navGroup.getNavGroupEnabled();

  const DataSourceMenu = props.dataSourceManagement?.ui?.getDataSourceMenu<
    DataSourceSelectableConfig
  >();

  const onSelectedDataSource = (e) => {
    const dataConnectionId = e[0] ? e[0].id : undefined;
    const dataConnectionLabel = e[0] ? e[0].label : undefined;

    setDataSourceMDSId([{ id: dataConnectionId, label: dataConnectionLabel }]);
  };

  const dataSourceMenuComponent = useMemo(() => {
    return (
      <DataSourceMenu
        setMenuMountPoint={props.setActionMenu}
        componentType={'DataSourceSelectable'}
        componentConfig={{
          savedObjects: props.savedObjectsMDSClient.client,
          notifications: props.notifications,
          fullWidth: true,
          onSelectedDataSources: onSelectedDataSource,
          dataSourceFilter: dataSourceFilterFn,
        }}
      />
    );
  }, [props.setActionMenu, props.savedObjectsMDSClient.client, props.notifications]);

  useEffect(() => {
    handleDataPrepperIndicesExistRequest(
      props.http,
      setDataPrepperIndicesExist,
      dataSourceMDSId[0].id
    );
    handleJaegerIndicesExistRequest(props.http, setJaegerIndicesExist, dataSourceMDSId[0].id);
  }, [dataSourceMDSId]);

  const modes = [
    { id: 'jaeger', title: 'Jaeger', 'data-test-subj': 'jaeger-mode' },
    { id: 'data_prepper', title: 'Data Prepper', 'data-test-subj': 'data-prepper-mode' },
    {
      id: 'custom_data_prepper',
      title: 'Custom source',
      'data-test-subj': 'custom-data-prepper-mode',
    },
  ];

  const fetchAttributesFields = () => {
    coreRefs.dslService
      ?.fetchFields(getSpanIndices(mode))
      .then((res) => {
        const attributes = getAttributes(res);
        setAttributesFilterFields(attributes);
      })
      .catch((error) => console.error('fetching attributes field failed', error));
  };

  useEffect(() => {
    if (!sessionStorage.getItem('TraceAnalyticsMode')) {
      if (dataPrepperIndicesExist) {
        setMode('data_prepper');
      } else if (jaegerIndicesExist) {
        setMode('jaeger');
      }
    }
  }, [jaegerIndicesExist, dataPrepperIndicesExist]);

  useEffect(() => {
    if (mode === 'data_prepper' || mode === 'custom_data_prepper') fetchAttributesFields();
  }, [mode]);

  const serviceBreadcrumbs = [
    ...(!isNavGroupEnabled
      ? [
          {
            text: 'Trace analytics',
            href: '#/traces',
          },
        ]
      : []),
    {
      text: 'Services',
      href: '#/services',
    },
  ];

  const traceBreadcrumbs = [
    ...(!isNavGroupEnabled
      ? [
          {
            text: 'Trace analytics',
            href: '#/traces',
          },
        ]
      : []),
    {
      text: 'Traces',
      href: '#/traces',
    },
  ];

  const traceColumnAction = () => location.assign('#/traces');

  const getTraceViewUri = (traceId: string) => `#/traces/${encodeURIComponent(traceId)}`;

  const [spanFlyoutComponent, setSpanFlyoutComponent] = useState(<></>);

  const setSpanFlyout = ({
    spanId,
    isFlyoutVisible,
    addSpanFilter,
    spanMode,
    spanDataSourceMDSId,
  }: {
    spanId: string;
    isFlyoutVisible: boolean;
    addSpanFilter: (field: string, value: any) => void;
    spanMode: TraceAnalyticsMode;
    spanDataSourceMDSId: string;
  }) => {
    setSpanFlyoutComponent(
      <SpanDetailFlyout
        http={props.http}
        spanId={spanId}
        isFlyoutVisible={isFlyoutVisible}
        closeFlyout={() => setSpanFlyoutComponent(<></>)}
        addSpanFilter={addSpanFilter}
        mode={spanMode}
        dataSourceMDSId={spanDataSourceMDSId}
      />
    );
  };

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
    notifications: props.notifications,
    dataSourceEnabled: props.dataSourceEnabled,
    dataSourceManagement: props.dataSourceManagement,
    setActionMenu: props.setActionMenu,
    savedObjectsMDSClient: props.savedObjectsMDSClient,
    attributesFilterFields,
    setSpanFlyout,
  };

  let flyout;

  if (currentSelectedService !== '') {
    flyout = (
      <ServiceFlyout
        serviceName={currentSelectedService}
        setCurrentSelectedService={setCurrentSelectedService}
        dataSourceMDSId={dataSourceMDSId}
        commonProps={commonProps}
      />
    );
  }

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
          render={(_routerProps) =>
            !isNavGroupEnabled ? (
              <TraceSideBar>
                {props.dataSourceEnabled && dataSourceMenuComponent}
                <Traces
                  page="traces"
                  childBreadcrumbs={traceBreadcrumbs}
                  getTraceViewUri={getTraceViewUri}
                  setCurrentSelectedService={setCurrentSelectedService}
                  toasts={toasts}
                  dataSourceMDSId={dataSourceMDSId}
                  {...commonProps}
                />
              </TraceSideBar>
            ) : (
              <>
                {props.dataSourceEnabled && dataSourceMenuComponent}

                <Traces
                  page="traces"
                  childBreadcrumbs={traceBreadcrumbs}
                  getTraceViewUri={getTraceViewUri}
                  setCurrentSelectedService={setCurrentSelectedService}
                  toasts={toasts}
                  dataSourceMDSId={dataSourceMDSId}
                  {...commonProps}
                />
              </>
            )
          }
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
              dataSourceMDSId={dataSourceMDSId}
              dataSourceManagement={props.dataSourceManagement}
              setActionMenu={props.setActionMenu}
              notifications={props.notifications}
              dataSourceEnabled={props.dataSourceEnabled}
              savedObjectsMDSClient={props.savedObjectsMDSClient}
            />
          )}
        />
        <Route
          exact
          path={['/services']}
          render={(_routerProps) =>
            !isNavGroupEnabled ? (
              <TraceSideBar>
                {props.dataSourceEnabled && dataSourceMenuComponent}
                <Services
                  page="services"
                  childBreadcrumbs={serviceBreadcrumbs}
                  traceColumnAction={traceColumnAction}
                  setCurrentSelectedService={setCurrentSelectedService}
                  toasts={toasts}
                  dataSourceMDSId={dataSourceMDSId}
                  {...commonProps}
                />
              </TraceSideBar>
            ) : (
              <>
                {props.dataSourceEnabled && dataSourceMenuComponent}
                <Services
                  page="services"
                  childBreadcrumbs={serviceBreadcrumbs}
                  traceColumnAction={traceColumnAction}
                  setCurrentSelectedService={setCurrentSelectedService}
                  toasts={toasts}
                  dataSourceMDSId={dataSourceMDSId}
                  {...commonProps}
                />
              </>
            )
          }
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
              dataSourceMDSId={dataSourceMDSId}
            />
          )}
        />
        <Route path="/" render={() => <Redirect to={defaultRoute} />} />
      </HashRouter>
      {flyout}
      {spanFlyoutComponent}
    </>
  );
};

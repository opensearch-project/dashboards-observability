/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { QueryManager } from 'common/query_manager';
import React from 'react';
import ReactDOM from 'react-dom';
import { AppMountParameters, CoreStart } from '../../../../src/core/public';
import { DataSourceManagementPluginSetup } from '../../../../src/plugins/data_source_management/public';
import { AppPluginStartDependencies } from '../types';
import { App } from './app';

export const Observability = (
  CoreStartProp: CoreStart,
  DepsStart: AppPluginStartDependencies,
  AppMountParametersProp: AppMountParameters,
  pplService: any,
  dslService: any,
  savedObjects: any,
  timestampUtils: any,
  queryManager: QueryManager,
  startPage: string,
  dataSourcePluggables: any,
  dataSourceManagement: DataSourceManagementPluginSetup,
  savedObjectsMDSClient: CoreStart['savedObjects'],
  defaultRoute?: string
) => {
  const { setHeaderActionMenu } = AppMountParametersProp;
  const { dataSource } = DepsStart;
  ReactDOM.render(
    <App
      CoreStartProp={CoreStartProp}
      DepsStart={DepsStart}
      pplService={pplService}
      dslService={dslService}
      savedObjects={savedObjects}
      timestampUtils={timestampUtils}
      queryManager={queryManager}
      startPage={startPage}
      dataSourcePluggables={dataSourcePluggables}
      dataSourceManagement={dataSourceManagement}
      setActionMenu={setHeaderActionMenu}
      dataSourceEnabled={!!dataSource}
      savedObjectsMDSClient={savedObjectsMDSClient}
      defaultRoute={defaultRoute}
    />,
    AppMountParametersProp.element
  );

  return () => ReactDOM.unmountComponentAtNode(AppMountParametersProp.element);
};

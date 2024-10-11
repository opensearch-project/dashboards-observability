/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { HashRouter, Route, RouteComponentProps, Switch } from 'react-router-dom';
import { i18n } from '@osd/i18n';
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
import { NewGettingStarted } from './components/getting_started';
import { dataSourceFilterFn } from '../../../common/utils/shared';
import { HeaderControlledComponentsWrapper } from '../../plugin_helpers/plugin_headerControl';

export interface HomeProps extends RouteComponentProps {
  pplService: any;
  parentBreadcrumb: ChromeBreadcrumb;
  http: HttpStart;
  chrome: ChromeStart;
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
    pplService,
    notifications,
    dataSourceEnabled,
    dataSourceManagement,
    savedObjectsMDSClient,
    parentBreadcrumb,
    setActionMenu,
  } = props;

  const [selectedDataSourceId, setSelectedDataSourceId] = useState<string>('');
  const [selectedDataSourceLabel, setSelectedDataSourceLabel] = useState<string>('');

  const onSelectedDataSourceChange = (e: any) => {
    const dataSourceId = e[0] ? e[0].id : undefined;
    const dataSourceLabel = e[0] ? e[0].label : '';
    setSelectedDataSourceId(dataSourceId);
    setSelectedDataSourceLabel(dataSourceLabel);
  };

  const DataSourceMenu = useMemo(() => {
    if (dataSourceEnabled && dataSourceManagement?.ui) {
      return dataSourceManagement.ui.getDataSourceMenu<DataSourceSelectableConfig>();
    }
    return null;
  }, [dataSourceManagement, dataSourceEnabled]);

  const dataSourceMenuComponent = useMemo(() => {
    if (DataSourceMenu) {
      return (
        <DataSourceMenu
          setMenuMountPoint={setActionMenu}
          componentType={'DataSourceSelectable'}
          componentConfig={{
            savedObjects: savedObjectsMDSClient.client,
            notifications,
            fullWidth: true,
            onSelectedDataSources: onSelectedDataSourceChange,
            dataSourceFilter: dataSourceFilterFn,
          }}
        />
      );
    }
    return null;
  }, [savedObjectsMDSClient.client, notifications, DataSourceMenu, setActionMenu]);

  const commonProps = {
    http,
    chrome,
    pplService,
    notifications,
    dataSourceEnabled,
    dataSourceManagement,
    savedObjectsMDSClient,
    parentBreadcrumb,
    selectedDataSourceId,
    selectedDataSourceLabel,
    setActionMenu,
  };

  return (
    <div>
      {dataSourceMenuComponent}
      <HeaderControlledComponentsWrapper
        description={i18n.translate('observabilityGetStarted.description', {
          defaultMessage: 'Get started with collecting and monitoring your observability data.',
        })}
      />
      <HashRouter>
        <Switch>
          <Route
            exact
            path={['/']}
            render={(routerProps) => <NewGettingStarted {...routerProps} {...commonProps} />}
          />
        </Switch>
      </HashRouter>
    </div>
  );
};

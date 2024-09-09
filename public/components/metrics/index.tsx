/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiPage, EuiPageBody, EuiResizableContainer, EuiSpacer } from '@elastic/eui';
import debounce from 'lodash/debounce';
import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { HashRouter, Route, RouteComponentProps, StaticContext } from 'react-router-dom';
import {
  ChromeBreadcrumb,
  MountPoint,
  NotificationsStart,
  SavedObjectsStart,
} from '../../../../../src/core/public';
import {
  DataSourceManagementPluginSetup,
  DataSourceSelectableConfig,
} from '../../../../../src/plugins/data_source_management/public';
import { DataSourceOption } from '../../../../../src/plugins/data_source_management/public/components/data_source_menu/types';
import { OptionType } from '../../../common/types/metrics';
import { setNavBreadCrumbs } from '../../../common/utils/set_nav_bread_crumbs';
import { dataSourceFilterFn } from '../../../common/utils/shared';
import PPLService from '../../services/requests/ppl';
import SavedObjects from '../../services/saved_objects/event_analytics/saved_objects';
import './index.scss';
import { setSelectedDataSourceMDSId } from './redux/slices/metrics_slice';
import { Sidebar } from './sidebar/sidebar';
import { TopMenu } from './top_menu/top_menu';
import { MetricsGrid } from './view/metrics_grid';

interface MetricsProps {
  parentBreadcrumb: ChromeBreadcrumb;
  renderProps: RouteComponentProps<any, StaticContext, any>;
  pplService: PPLService;
  savedObjects: SavedObjects;
  setBreadcrumbs: (newBreadcrumbs: ChromeBreadcrumb[]) => void;
  dataSourceManagement: DataSourceManagementPluginSetup;
  dataSourceEnabled: boolean;
  setActionMenu: (menuMount: MountPoint | undefined) => void;
  savedObjectsMDSClient: SavedObjectsStart;
  notifications: NotificationsStart;
}

export const Home = ({
  chrome,
  parentBreadcrumb,
  dataSourceManagement,
  setActionMenu,
  savedObjectsMDSClient,
  notifications,
  dataSourceEnabled,
}: MetricsProps) => {
  // Side bar constants
  const [selectedDataSource, setSelectedDataSource] = useState<OptionType[]>([]);
  const [selectedOTIndex, setSelectedOTIndex] = useState([]);
  const [dataSourceMDSId, setDataSourceMDSId] = useState<string>('');
  const [reloadSidebar, setReloadSidebar] = useState<boolean>(false);

  useEffect(() => {
    setNavBreadCrumbs(
      [parentBreadcrumb],
      [
        {
          text: 'Metrics',
          href: `#/`,
        },
      ]
    );
  }, [chrome, parentBreadcrumb, dataSourceMDSId]);

  useEffect(() => {
    setReloadSidebar(true);
  }, [dataSourceMDSId]);

  const dispatch = useDispatch();

  const onSelectedDataSource = async (dataSources: DataSourceOption[]) => {
    const id = dataSources[0] ? dataSources[0].id : '';
    setDataSourceMDSId(id);
    debounce(() => {
      dispatch(setSelectedDataSourceMDSId(id));
    }, 300);
  };

  const DataSourceMenu = dataSourceManagement?.ui?.getDataSourceMenu<DataSourceSelectableConfig>();
  const dataSourceMenuComponent = useMemo(() => {
    return (
      <DataSourceMenu
        setMenuMountPoint={setActionMenu}
        componentType={'DataSourceSelectable'}
        componentConfig={{
          savedObjects: savedObjectsMDSClient.client,
          notifications,
          fullWidth: true,
          // activeOption: dataSourceMDSId,
          onSelectedDataSources: onSelectedDataSource,
          dataSourceFilter: dataSourceFilterFn,
        }}
      />
    );
  }, [setActionMenu, savedObjectsMDSClient.client, notifications]);

  return (
    <>
      {dataSourceEnabled && dataSourceMenuComponent}
      <HashRouter>
        <Route
          exact
          path={['/:id', '/']}
          render={(routerProps) => (
            <div>
              {reloadSidebar && (
                <EuiPage>
                  <EuiPageBody component="div">
                    <TopMenu />
                    <EuiSpacer size="m" />
                    <div className="metricsContainer">
                      <EuiResizableContainer>
                        {(EuiResizablePanel, EuiResizableButton) => (
                          <>
                            <EuiResizablePanel
                              mode="collapsible"
                              initialSize={20}
                              minSize="10%"
                              paddingSize="none"
                            >
                              <Sidebar
                                additionalSelectedMetricId={routerProps.match.params.id}
                                selectedDataSource={selectedDataSource}
                                setSelectedDataSource={setSelectedDataSource}
                                selectedOTIndex={selectedOTIndex}
                                setSelectedOTIndex={setSelectedOTIndex}
                                dataSourceMDSId={dataSourceMDSId}
                              />
                            </EuiResizablePanel>

                            <EuiResizableButton />

                            <EuiResizablePanel mode="main" initialSize={80} minSize="50px">
                              <MetricsGrid key="metricGrid" dataSourceMDSId={dataSourceMDSId} />
                            </EuiResizablePanel>
                          </>
                        )}
                      </EuiResizableContainer>
                    </div>
                  </EuiPageBody>
                </EuiPage>
              )}
            </div>
          )}
        />
      </HashRouter>
    </>
  );
};

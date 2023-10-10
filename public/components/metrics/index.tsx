/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './index.scss';
import {
  EuiGlobalToastList,
  EuiPage,
  EuiPageBody,
  EuiResizableContainer,
  htmlIdGenerator,
  OnTimeChangeProps,
  ShortDate,
} from '@elastic/eui';
import React, { ReactChild, useEffect, useState } from 'react';
import { HashRouter, Route, RouteComponentProps } from 'react-router-dom';
import { StaticContext } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ChromeBreadcrumb, Toast } from '../../../../../src/core/public';
import { Sidebar } from './sidebar/sidebar';
import { EmptyMetricsView } from './view/empty_view';
import PPLService from '../../services/requests/ppl';
import { TopMenu } from './top_menu/top_menu';
import { MetricType } from '../../../common/types/metrics';
import { MetricsGrid } from './view/metrics_grid';
import { metricsLayoutSelector, selectedMetricsSelector } from './redux/slices/metrics_slice';
import { resolutionOptions } from '../../../common/constants/metrics';
import SavedObjects from '../../services/saved_objects/event_analytics/saved_objects';
import { observabilityLogsID } from '../../../common/constants/shared';

interface MetricsProps {
  parentBreadcrumb: ChromeBreadcrumb;
  renderProps: RouteComponentProps<any, StaticContext, any>;
  pplService: PPLService;
  savedObjects: SavedObjects;
  setBreadcrumbs: (newBreadcrumbs: ChromeBreadcrumb[]) => void;
}

export const Home = ({ chrome, parentBreadcrumb }: MetricsProps) => {
  // Redux tools
  const selectedMetrics = useSelector(selectedMetricsSelector);
  const metricsLayout = useSelector(metricsLayoutSelector);

  // Top panel
  const [IsTopPanelDisabled, setIsTopPanelDisabled] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editActionType, setEditActionType] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [toastRightSide, setToastRightSide] = useState<boolean>(true);

  // Metrics constants
  const [panelVisualizations, setPanelVisualizations] = useState<MetricType[]>([]);

  const setToast = (title: string, color = 'success', text?: ReactChild, side?: string) => {
    if (!text) text = '';
    setToastRightSide(!side);
    setToasts([...toasts, { id: new Date().toISOString(), title, text, color } as Toast]);
  };

  const onEditClick = (savedVisualizationId: string) => {
    window.location.assign(`${observabilityLogsID}#/explorer/${savedVisualizationId}`);
  };

  useEffect(() => {
    chrome.setBreadcrumbs([
      parentBreadcrumb,
      {
        text: 'Metrics',
        href: `#/`,
      },
    ]);
  }, [chrome, parentBreadcrumb]);

  useEffect(() => {
    if (!editMode) {
      selectedMetrics.length > 0 ? setIsTopPanelDisabled(false) : setIsTopPanelDisabled(true); // eslint-disable-line
    } else {
      setIsTopPanelDisabled(true);
    }
  }, [selectedMetrics, editMode]);

  useEffect(() => {
    setPanelVisualizations(metricsLayout);
  }, [metricsLayout]);

  return (
    <>
      <EuiGlobalToastList
        toasts={toasts}
        dismissToast={(removedToast) => {
          setToasts(toasts.filter((toast) => toast.id !== removedToast.id));
        }}
        side={toastRightSide ? 'right' : 'left'}
        toastLifeTimeMs={6000}
      />
      <HashRouter>
        <Route
          exact
          path="/"
          render={() => (
            <div>
              <EuiPage>
                <EuiPageBody component="div">
                  <TopMenu
                    IsTopPanelDisabled={IsTopPanelDisabled}
                    editMode={editMode}
                    setEditMode={setEditMode}
                    setEditActionType={setEditActionType}
                    panelVisualizations={panelVisualizations}
                    setPanelVisualizations={setPanelVisualizations}
                    setToast={setToast}
                  />
                  <div className="dscAppContainer">
                    <EuiResizableContainer>
                      {(EuiResizablePanel, EuiResizableButton) => (
                        <>
                          <EuiResizablePanel mode="collapsible" initialSize={20} minSize="10%">
                            <Sidebar />
                          </EuiResizablePanel>

                          <EuiResizableButton />

                          <EuiResizablePanel mode="main" initialSize={80} minSize="50px">
                            {selectedMetrics.length > 0 ? (
                              <MetricsGrid
                                chrome={chrome}
                                panelVisualizations={panelVisualizations}
                                setPanelVisualizations={setPanelVisualizations}
                                editMode={editMode}
                                moveToEvents={onEditClick}
                                editActionType={editActionType}
                                setEditActionType={setEditActionType}
                              />
                            ) : (
                              <EmptyMetricsView />
                            )}
                          </EuiResizablePanel>
                        </>
                      )}
                    </EuiResizableContainer>
                  </div>
                </EuiPageBody>
              </EuiPage>
            </div>
          )}
        />
      </HashRouter>
    </>
  );
};

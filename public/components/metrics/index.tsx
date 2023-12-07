/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './index.scss';
import { EuiGlobalToastList, EuiPage, EuiPageBody, EuiResizableContainer } from '@elastic/eui';
import React, { ReactChild, useEffect, useState } from 'react';
import { HashRouter, Route, RouteComponentProps, StaticContext } from 'react-router-dom';
import { ChromeBreadcrumb, Toast } from '../../../../../src/core/public';
import { Sidebar } from './sidebar/sidebar';
import PPLService from '../../services/requests/ppl';
import { TopMenu } from './top_menu/top_menu';
import { MetricType } from '../../../common/types/metrics';
import { MetricsGrid } from './view/metrics_grid';
import SavedObjects from '../../services/saved_objects/event_analytics/saved_objects';

interface MetricsProps {
  parentBreadcrumb: ChromeBreadcrumb;
  renderProps: RouteComponentProps<any, StaticContext, any>;
  pplService: PPLService;
  savedObjects: SavedObjects;
  setBreadcrumbs: (newBreadcrumbs: ChromeBreadcrumb[]) => void;
}

export const Home = ({ chrome, parentBreadcrumb }: MetricsProps) => {
  // Date picker constants
  const [recentlyUsedRanges, setRecentlyUsedRanges] = useState<DurationRange[]>([]);
  const [onRefresh, setOnRefresh] = useState(false);

  // Top panel
  const [editMode, setEditMode] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [toastRightSide, setToastRightSide] = useState<boolean>(true);

  // Metrics constants
  const [panelVisualizations, setPanelVisualizations] = useState<MetricType[]>([]);

  const setToast = (title: string, color = 'success', text?: ReactChild, side?: string) => {
    if (!text) text = '';
    setToastRightSide(!side);
    setToasts([...toasts, { id: new Date().toISOString(), title, text, color } as Toast]);
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
          path={['/:id', '/']}
          render={(routerProps) => (
            <div>
              <EuiPage>
                <EuiPageBody component="div">
                  <TopMenu
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
                            <Sidebar additionalSelectedMetricId={routerProps.match.params.id} />
                          </EuiResizablePanel>

                          <EuiResizableButton />

                          <EuiResizablePanel mode="main" initialSize={80} minSize="50px">
                            <MetricsGrid key="metricGrid" />
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

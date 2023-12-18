/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './index.scss';
import { EuiPage, EuiPageBody, EuiResizableContainer } from '@elastic/eui';
import React, { useEffect } from 'react';
import { HashRouter, Route, RouteComponentProps, StaticContext } from 'react-router-dom';
import { ChromeBreadcrumb } from '../../../../../src/core/public';
import { Sidebar } from './sidebar/sidebar';
import PPLService from '../../services/requests/ppl';
import { TopMenu } from './top_menu/top_menu';
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
      <HashRouter>
        <Route
          exact
          path={['/:id', '/']}
          render={(routerProps) => (
            <div>
              <EuiPage>
                <EuiPageBody component="div">
                  <TopMenu />
                  <div className="metricsContainer">
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

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
import { MetricType, OptionType } from '../../../common/types/metrics';
import { MetricsGrid } from './view/metrics_grid';
import { metricsLayoutSelector, selectedMetricsSelector } from './redux/slices/metrics_slice';
import { resolutionOptions, DATASOURCE_OPTIONS } from '../../../common/constants/metrics';
import SavedObjects from '../../services/saved_objects/event_analytics/saved_objects';

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

  // Side bar constants
  const [selectedDataSource, setSelectedDataSource] = useState<OptionType[]>([]);
  const [selectedOTIndex, setSelectedOTIndex] = useState([]);

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
                            <Sidebar
                              additionalSelectedMetricId={routerProps.match.params.id}
                              selectedDataSource={selectedDataSource}
                              setSelectedDataSource={setSelectedDataSource}
                              selectedOTIndex={selectedOTIndex}
                              setSelectedOTIndex={setSelectedOTIndex}
                            />
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

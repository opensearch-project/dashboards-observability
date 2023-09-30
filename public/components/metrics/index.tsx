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
import { DurationRange } from '@elastic/eui/src/components/date_picker/types';
import React, { ReactChild, useEffect, useState } from 'react';
import { HashRouter, Route, RouteComponentProps } from 'react-router-dom';
import { StaticContext } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { createContext } from 'react';
import { VisualizationType } from 'common/types/custom_panels';
import { ChromeBreadcrumb, Toast } from '../../../../../src/core/public';
import { getNewVizDimensions, onTimeChange } from './helpers/utils';
import { Sidebar } from './sidebar/sidebar';
import { EmptyMetricsView } from './view/empty_view';
import PPLService from '../../services/requests/ppl';
import { TopMenu } from './top_menu/top_menu';
import { MetricType } from '../../../common/types/metrics';
import { MetricsGrid } from './view/metrics_grid';
import { metricsLayoutSelector, selectedMetricsSelector } from './redux/slices/metrics_slice';
import { OBSERVABILITY_CUSTOM_METRIC, resolutionOptions } from '../../../common/constants/metrics';
import SavedObjects from '../../services/saved_objects/event_analytics/saved_objects';
import { observabilityLogsID } from '../../../common/constants/shared';

interface MetricsProps {
  parentBreadcrumb: ChromeBreadcrumb;
  renderProps: RouteComponentProps<any, StaticContext, any>;
  pplService: PPLService;
  savedObjects: SavedObjects;
  setBreadcrumbs: (newBreadcrumbs: ChromeBreadcrumb[]) => void;
}

export const MetricsLayoutContext = createContext<{
  layout: VisualizationType[];
  addToLayout: (id: string) => void;
}>({
  layout: [],
  addToLayout: () => {},
});

const MetricsLayoutProvider = ({ children }) => {
  const [layout, setLayout] = useState<VisualizationType[]>([]);

  const addToLayout = (id) => {
    setLayout((prevLayout) => {
      const newVisLayout = getNewVizDimensions(prevLayout);

      const metricVisualization: MetricType = {
        id,
        savedVisualizationId: id,
        x: newVisLayout.x,
        y: newVisLayout.y,
        h: newVisLayout.h,
        w: newVisLayout.w,
        query: {
          type:
            newVisLayout.catalog === OBSERVABILITY_CUSTOM_METRIC
              ? 'savedCustomMetric'
              : 'prometheusMetric',
          catalog: newVisLayout.id,
          aggregation: 'avg',
          attributesGroupBy: [],
          availableAttributes: [],
        },
      };
      return [...prevLayout, metricVisualization];
    });
  };

  return (
    <MetricsLayoutContext.Provider value={{ layout, addToLayout }}>
      {children}
    </MetricsLayoutContext.Provider>
  );
};

export const Home = ({ chrome, parentBreadcrumb }: MetricsProps) => {
  // Redux tools
  const selectedMetrics = useSelector(selectedMetricsSelector);
  const [metricsLayout, setMetricsLayout] = useSelector(metricsLayoutSelector);

  // Date picker constants
  const [recentlyUsedRanges, setRecentlyUsedRanges] = useState<DurationRange[]>([]);
  const [startTime, setStartTime] = useState<ShortDate>('now-1d');
  const [endTime, setEndTime] = useState<ShortDate>('now');

  // Top panel
  const [IsTopPanelDisabled, setIsTopPanelDisabled] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [onRefresh, setOnRefresh] = useState(false);
  const [editActionType, setEditActionType] = useState('');
  const [resolutionValue, setResolutionValue] = useState(resolutionOptions[2].value);
  const [spanValue, setSpanValue] = useState(1);
  const resolutionSelectId = htmlIdGenerator('resolutionSelect')();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [toastRightSide, setToastRightSide] = useState<boolean>(true);

  // Metrics constants
  const [panelVisualizations, setPanelVisualizations] = useState<MetricType[]>([]);

  const setToast = (title: string, color = 'success', text?: ReactChild, side?: string) => {
    if (!text) text = '';
    setToastRightSide(!side);
    setToasts([...toasts, { id: new Date().toISOString(), title, text, color } as Toast]);
  };

  const onRefreshFilters = () => {
    if (spanValue < 1) {
      setToast('Please add a valid span interval', 'danger');
      return;
    }
    setOnRefresh(!onRefresh);
  };

  const onDatePickerChange = (props: OnTimeChangeProps) => {
    onTimeChange(
      props.start,
      props.end,
      recentlyUsedRanges,
      setRecentlyUsedRanges,
      setStartTime,
      setEndTime
    );
    onRefreshFilters();
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
                  <MetricsLayoutProvider>
                    <TopMenu
                      IsTopPanelDisabled={IsTopPanelDisabled}
                      startTime={startTime}
                      endTime={endTime}
                      onDatePickerChange={onDatePickerChange}
                      recentlyUsedRanges={recentlyUsedRanges}
                      resolutionValue={resolutionValue}
                      setResolutionValue={setResolutionValue}
                      spanValue={spanValue}
                      setSpanValue={setSpanValue}
                      resolutionSelectId={resolutionSelectId}
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
                                  startTime={startTime}
                                  endTime={endTime}
                                  moveToEvents={onEditClick}
                                  onRefresh={onRefresh}
                                  spanParam={spanValue + resolutionValue}
                                />
                              ) : (
                                <EmptyMetricsView />
                              )}
                            </EuiResizablePanel>
                          </>
                        )}
                      </EuiResizableContainer>
                    </div>
                  </MetricsLayoutProvider>
                </EuiPageBody>
              </EuiPage>
            </div>
          )}
        />
      </HashRouter>
    </>
  );
};

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Layout, Layouts, Responsive, WidthProvider } from 'react-grid-layout';
import { useObservable } from 'react-use';
import _ from 'lodash';
import { useDispatch, useSelector } from 'react-redux';
import { CoreStart } from '../../../../../../src/core/public';
import { VisualizationContainer } from '../../custom_panels/panel_modules/visualization_container';
import { MetricType } from '../../../../common/types/metrics';
import { mergeLayoutAndVisualizations } from '../../custom_panels/helpers/utils';
import {
  updateMetricsLayout,
  deSelectMetric,
  selectedMetricsSelector,
  getMetricVisDimensions,
  metricIconsSelector,
} from '../redux/slices/metrics_slice';
import { mergeLayoutAndMetrics } from '../helpers/utils';

import './metrics_grid.scss';
import { coreRefs } from '../../../framework/core_refs';
import { MetricsLayoutContext } from '../index';
import { OBSERVABILITY_CUSTOM_METRIC } from '../../../../common/constants/metrics';

// HOC container to provide dynamic width for Grid layout
const ResponsiveGridLayout = WidthProvider(Responsive);

interface MetricsGridProps {
  chrome: CoreStart['chrome'];
  startTime: string;
  endTime: string;
  moveToEvents: (savedVisualizationId: string) => any;
  onRefresh: boolean;
  spanParam: string;
}

export const MetricsGrid = ({
  chrome,
  startTime,
  endTime,
  moveToEvents,
  onRefresh,
  spanParam,
}: MetricsGridProps) => {
  const { http, pplService } = coreRefs;
  // Redux tools
  const dispatch = useDispatch();
  const updateLayout = (metric: any) => dispatch(updateMetricsLayout(metric));
  const handleRemoveMetric = (metric: any) => {
    dispatch(deSelectMetric(metric));
  };

  const selectedMetrics = useSelector(selectedMetricsSelector);

  // const { layout } = useContext(MetricsLayoutContext);

  const [previousEditLayout, setPreviousEditLayout] = useState<Layout[]>([]);

  const isLocked = useObservable(chrome.getIsNavDrawerLocked$());

  // Reset Size of Visualizations when layout is changed
  const layoutChanged = (currLayouts: Layout[], allLayouts: Layouts) => {
    window.dispatchEvent(new Event('resize'));
    // setPostEditLayout(currLayouts);
  };

  const removeVisualization = () => {};

  const visualizationComponents = useMemo(
    () =>
      selectedMetrics.map((metricPanel, index) => {
        return (
          <VisualizationContainer
            key={metricPanel.id}
            visualizationId={metricPanel.id}
            fromTime={startTime}
            toTime={endTime}
            onRefresh={onRefresh}
            onEditClick={moveToEvents}
            removeVisualization={removeVisualization}
            catalogVisualization={
              metricPanel.catalog === OBSERVABILITY_CUSTOM_METRIC ? undefined : true
            }
            spanParam={spanParam}
            contextMenuId="metrics"
          />
        );
      }),
    [selectedMetrics, onRefresh]
  );

  const layout = useMemo(
    () =>
      selectedMetrics.map((metric) => ({
        ...metric.layout,
        id: metric.id,
        minW: 12, // restricting width of the metric visualization
        maxW: 12,
        static: true,
      })),
    [selectedMetrics]
  );
  useEffect(() => {
    console.log('MetricsGrid useEffect layout', { layout });
  }, [layout]);

  // // Reload the Layout
  // const reloadLayout = () => {
  //   const tempLayout: Layout[] = panelVisualizations.map((panelVisualization) => {
  //     return {
  //       i: panelVisualization.id,
  //       x: panelVisualization.x,
  //       y: panelVisualization.y,
  //       w: panelVisualization.w,
  //       h: panelVisualization.h,
  //       minW: 12, // restricting width of the metric visualization
  //       maxW: 12,
  //       static: !editMode,
  //     } as Layout;
  //   });
  //   setCurrentLayout(tempLayout);
  // };

  // remove visualization from panel in edit mode
  // const removeVisualization = (visualizationId: string) => {
  //   const newVisualizationList = _.reject(panelVisualizations, {
  //     id: visualizationId,
  //   });
  //   setRemoveMetricsList([...removeMetricsList, { id: visualizationId }]);
  //   mergeLayoutAndVisualizations(postEditLayout, newVisualizationList, setPanelVisualizations);
  // };
  //
  // // Update layout whenever user edit gets completed
  // useEffect(() => {
  //   if (editMode) {
  //     reloadLayout();
  //     loadVizComponents();
  //   }
  // }, [editMode, reloadLayout, loadVizComponents]);
  //
  // useEffect(() => {
  //   if (editActionType === 'cancel') {
  //     setRemoveMetricsList([]);
  //   }
  //   if (editActionType === 'save') {
  //     removeMetricsList.map((value) => handleRemoveMetric(value));
  //     updateLayout(mergeLayoutAndMetrics(postEditLayout, panelVisualizations));
  //     setEditActionType('');
  //   }
  // }, [
  //   editActionType,
  //   handleRemoveMetric,
  //   postEditLayout,
  //   removeMetricsList,
  //   panelVisualizations,
  //   setEditActionType,
  // ]);
  //
  // // Update layout whenever visualizations are updated
  // useEffect(() => {
  //   reloadLayout();
  //   loadVizComponents();
  // }, [panelVisualizations, reloadLayout, loadVizComponents]);

  // Reset Size of Panel Grid when Nav Dock is Locked
  useEffect(() => {
    setTimeout(function () {
      window.dispatchEvent(new Event('resize'));
    }, 300);
  }, [isLocked]);

  // useEffect(() => {
  //   loadVizComponents();
  // }, [onRefresh]);

  // useEffect(() => {
  //   loadVizComponents();
  // }, []);

  return (
    <ResponsiveGridLayout
      layouts={{ lg: layout, md: layout, sm: layout }}
      className="layout full-width"
      breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
      cols={{ lg: 12, md: 12, sm: 12, xs: 1, xxs: 1 }}
      onLayoutChange={layoutChanged}
    >
      {visualizationComponents}
    </ResponsiveGridLayout>
  );
};

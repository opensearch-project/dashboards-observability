/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Layout, Layouts, Responsive, WidthProvider } from 'react-grid-layout';
import { useObservable } from 'react-use';
import _ from 'lodash';
import { useDispatch, useSelector } from 'react-redux';
import { CoreStart } from '../../../../../../src/core/public';
import { VisualizationContainer } from '../../custom_panels/panel_modules/visualization_container';
import { MetricType } from '../../../../common/types/metrics';
import {
  mergeLayoutAndVisualizations,
  updateCatalogVisualizationQuery,
} from '../../custom_panels/helpers/utils';
import {
  updateMetricsLayout,
  deSelectMetric,
  metricQueryFromMetaData,
  selectedMetricsSelector,
} from '../redux/slices/metrics_slice';
import { mergeLayoutAndMetrics } from '../helpers/utils';

import './metrics_grid.scss';
import { coreRefs } from '../../../framework/core_refs';
import { OBSERVABILITY_CUSTOM_METRIC } from '../../../../common/constants/metrics';
import { MetricsEditInline } from '../sidebar/metrics_edit_inline';
import { PROMQL_METRIC_SUBTYPE } from '../../../../common/constants/shared';

// HOC container to provide dynamic width for Grid layout
const ResponsiveGridLayout = WidthProvider(Responsive);

interface MetricsGridProps {
  chrome: CoreStart['chrome'];
  panelVisualizations: MetricType[];
  setPanelVisualizations: React.Dispatch<React.SetStateAction<MetricType[]>>;
  selectedMetrics: MetricType[];
  editMode: boolean;
  startTime: string;
  endTime: string;
  moveToEvents: (savedVisualizationId: string) => any;
  onRefresh: boolean;
  editActionType: string;
  setEditActionType: React.Dispatch<React.SetStateAction<string>>;
  spanParam: string;
}

export const MetricsGrid = ({
  chrome,
  panelVisualizations,
  setPanelVisualizations,
  editMode,
  startTime,
  endTime,
  moveToEvents,
  onRefresh,
  editActionType,
  setEditActionType,
  spanParam,
}: MetricsGridProps) => {
  const { http, pplService } = coreRefs;
  // Redux tools
  const dispatch = useDispatch();
  const updateLayout = (metric: any) => dispatch(updateMetricsLayout(metric));
  const handleRemoveMetric = (metric: any) => {
    dispatch(deSelectMetric(metric));
  };

  const [currentLayout, setCurrentLayout] = useState<Layout[]>([]);
  const [previousEditLayout, setPreviousEditLayout] = useState<Layout[]>([]);
  const selectedMetrics = useSelector(selectedMetricsSelector);
  const [gridData, setGridData] = useState(panelVisualizations.map(() => <></>));
  const [removeMetricsList, setRemoveMetricsList] = useState<Array<{ id: string }>>([]);
  const isLocked = useObservable(chrome.getIsNavDrawerLocked$());

  // Reset Size of Visualizations when layout is changed
  const layoutChanged = (currLayouts: Layout[], allLayouts: Layouts) => {
    window.dispatchEvent(new Event('resize'));
  };
  const visualizationFromMetric = (metric): SavedVisualizationType => ({
    ...metric,
    query: updateCatalogVisualizationQuery({ ...metric, startTime, endTime, spanParam }),
    query_meta_data: {
      catalogSourceName: metric.catalogSourceName,
      catalogTableName: metric.catalogTableName,
      aggregation: metric.aggregation,
      attributesGroupBy: metric.attributesGroupBy,
    },

    timeField: '@timestamp',
    selected_date_range: [startTime, endTime],
    sub_type: 'promqlmetric',
    userConfigs: {
      dataConfig: {
        type: 'line',
        fillOpacity: 0,
        lineWidth: 2,
      },
    },
  });

  const loadVizComponents = () => {
    const gridDataComps = panelVisualizations.map((panelVisualization: MetricType, index) => {
      const metric = selectedMetrics[index];
      console.log('loadVizComponents', { panelVisualization, metric });
      return (
        <VisualizationContainer
          key={panelVisualization.id}
          editMode={editMode}
          visualizationId={metric.id}
          savedVisualizationId={metric.savedVisualizationId}
          inputMetaData={metric.savedVisualizationId ? undefined : visualizationFromMetric(metric)}
          fromTime={startTime}
          toTime={endTime}
          onRefresh={onRefresh}
          onEditClick={moveToEvents}
          usedInNotebooks={true}
          pplFilterValue=""
          removeVisualization={removeVisualization}
          // catalogVisualization={panelVisualization.catalog !== OBSERVABILITY_CUSTOM_METRIC}
          spanParam={spanParam}
          contextMenuId="metrics"
          inlineEditor={
            metric.sub_type === PROMQL_METRIC_SUBTYPE && (
              <MetricsEditInline visualization={metric} />
            )
          }
        />
      );
    });
    setGridData(gridDataComps);
  };

  // Reload the Layout
  const reloadLayout = () => {
    const tempLayout: Layout[] = panelVisualizations.map((panelVisualization) => {
      return {
        i: panelVisualization.id,
        x: panelVisualization.x,
        y: panelVisualization.y,
        w: panelVisualization.w,
        h: panelVisualization.h,
        minW: 12, // restricting width of the metric visualization
        maxW: 12,
        static: !editMode,
      } as Layout;
    });
    setCurrentLayout(tempLayout);
  };

  // remove visualization from panel in edit mode
  const removeVisualization = (visualizationId: string) => {
    const newVisualizationList = _.reject(panelVisualizations, {
      id: visualizationId,
    });
    setRemoveMetricsList([...removeMetricsList, { id: visualizationId }]);
    mergeLayoutAndVisualizations(previousEditLayout, newVisualizationList, setPanelVisualizations);
  };

  // Update layout whenever user edit gets completed
  useEffect(() => {
    if (editMode) {
      reloadLayout();
      loadVizComponents();
    }
  }, [editMode]);

  useEffect(() => {
    if (editActionType === 'cancel') {
      setRemoveMetricsList([]);
    }
    if (editActionType === 'save') {
      removeMetricsList.map((value) => handleRemoveMetric(value));
      updateLayout(mergeLayoutAndMetrics(previousEditLayout, panelVisualizations));
      setEditActionType('');
    }
  }, [editActionType]);

  // Update layout whenever visualizations are updated
  useEffect(() => {
    reloadLayout();
    loadVizComponents();
  }, [panelVisualizations, selectedMetrics]);

  // Reset Size of Panel Grid when Nav Dock is Locked
  useEffect(() => {
    setTimeout(function () {
      window.dispatchEvent(new Event('resize'));
    }, 300);
  }, [isLocked]);

  useEffect(() => {
    loadVizComponents();
  }, [onRefresh]);

  useEffect(() => {
    loadVizComponents();
  }, []);

  return (
    <ResponsiveGridLayout
      layouts={{ lg: currentLayout, md: currentLayout, sm: currentLayout }}
      className="layout full-width"
      breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
      cols={{ lg: 12, md: 12, sm: 12, xs: 1, xxs: 1 }}
      onLayoutChange={layoutChanged}
    >
      {panelVisualizations.map((panelVisualization: MetricType, index) => (
        <div key={panelVisualization.id}>{gridData[index]}</div>
      ))}
    </ResponsiveGridLayout>
  );
};

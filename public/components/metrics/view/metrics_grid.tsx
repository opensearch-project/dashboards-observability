/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo } from 'react';
import { EuiDragDropContext, EuiDraggable, EuiDroppable } from '@elastic/eui';
import { useObservable } from 'react-use';
import _ from 'lodash';
import { useDispatch, useSelector } from 'react-redux';
import { CoreStart } from '../../../../../../src/core/public';
import { VisualizationContainer } from '../../custom_panels/panel_modules/visualization_container';
import { MetricType } from '../../../../common/types/metrics';
import { updateCatalogVisualizationQuery } from '../../custom_panels/helpers/utils';
import {
  selectedMetricsSelector,
  dateSpanFilterSelector,
  refreshSelector,
} from '../redux/slices/metrics_slice';

import './metrics_grid.scss';
import { coreRefs } from '../../../framework/core_refs';
import { PROMQL_METRIC_SUBTYPE } from '../../../../common/constants/shared';
import { MetricsEditInline } from '../sidebar/metrics_edit_inline';

// HOC container to provide dynamic width for Grid layout

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
  const dateSpanFilter = useSelector(dateSpanFilterSelector);
  const refresh = useSelector(refreshSelector);

  const selectedMetrics = useSelector(selectedMetricsSelector);

  const isLocked = useObservable(chrome.getIsNavDrawerLocked$());

  const onDragEnd = ({ source, destination }) => {
    console.log(source, destination);
    dispatch(moveMetric({ source, destination }));
  };
  const visualizationFromMetric = (metric): SavedVisualizationType => ({
    ...metric,
    query: updateCatalogVisualizationQuery({ ...metric, ...dateSpanFilter }),
    query_meta_data: {
      catalogSourceName: metric.catalogSourceName,
      catalogTableName: metric.catalogTableName,
      aggregation: metric.aggregation,
      attributesGroupBy: metric.attributesGroupBy,
    },

    timeField: '@timestamp',
    selected_date_range: dateSpanFilter,
    userConfigs: {
      dataConfig: {
        type: 'line',
        fillOpacity: 0,
        lineWidth: 2,
      },
    },
  });

  const visualizationComponents = useMemo(
    () =>
      selectedMetrics.map((metric, idx) => {
        const id = metric.id;
        // console.log('visualizationComponents metricPanel', { metricPanel, idx });
        return (
          <EuiDraggable key={id} index={idx} draggableId={id}>
            <VisualizationContainer
              key={id}
              visualizationId={id}
              savedVisualizationId={metric.savedVisualizationId}
              inputMetaData={
                metric.savedVisualizationId ? undefined : visualizationFromMetric(metric)
              }
              fromTime={dateSpanFilter.start}
              toTime={dateSpanFilter.end}
              onRefresh={refresh}
              onEditClick={moveToEvents}
              // usedInNotebooks={true}
              pplFilterValue=""
              spanParam={`${dateSpanFilter.span}${dateSpanFilter.resolution}`}
              contextMenuId="metrics"
              inlineEditor={
                metric.sub_type === PROMQL_METRIC_SUBTYPE && (
                  <MetricsEditInline visualization={metric} />
                )
              }
            />
          </EuiDraggable>
        );
      }),
    [selectedMetrics, refresh]
  );

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
    <EuiDragDropContext onDragEnd={onDragEnd}>
      <EuiDroppable droppableId="DROPPABLE_AREA_BARE">{visualizationComponents}</EuiDroppable>
    </EuiDragDropContext>
  );
};

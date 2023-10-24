/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo } from 'react';
import { EuiDragDropContext, EuiDraggable, EuiDroppable } from '@elastic/eui';
import { useObservable } from 'react-use';
import { useDispatch, useSelector } from 'react-redux';
import { CoreStart } from '../../../../../../src/core/public';
import { VisualizationContainer } from '../../custom_panels/panel_modules/visualization_container';
import {
  selectedMetricsSelector,
  moveMetric,
  dateSpanFilterSelector,
  refreshSelector,
  metricQueryFromMetaData,
} from '../redux/slices/metrics_slice';

import './metrics_grid.scss';
import { OBSERVABILITY_CUSTOM_METRIC } from '../../../../common/constants/metrics';
import { SavedVisualizationType } from '../../../../common/types/custom_panels';

interface MetricsGridProps {
  chrome: CoreStart['chrome'];
  moveToEvents: (savedVisualizationId: string) => any;
}

export const MetricsGrid = ({ chrome, moveToEvents }: MetricsGridProps) => {
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
    query: metricQueryFromMetaData(metric),
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
      selectedMetrics.map((metricPanel, idx) => {
        const id = metricPanel.id;
        // console.log('visualizationComponents metricPanel', { metricPanel, idx });
        return (
          <EuiDraggable key={id} index={idx} draggableId={id}>
            <VisualizationContainer
              key={id}
              visualizationId={id}
              savedVisualizationId={metricPanel.savedVisualizationId}
              inputMetaData={
                metricPanel.savedVisualizationId ? undefined : visualizationFromMetric(metricPanel)
              }
              fromTime={dateSpanFilter.start}
              toTime={dateSpanFilter.end}
              onRefresh={refresh}
              onEditClick={moveToEvents}
              // usedInNotebooks={true}
              pplFilterValue=""
              catalogVisualization={
                metricPanel.catalog === OBSERVABILITY_CUSTOM_METRIC ? undefined : true
              }
              spanParam={`${dateSpanFilter.span}${dateSpanFilter.resolution}`}
              contextMenuId="metrics"
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

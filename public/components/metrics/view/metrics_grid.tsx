/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo } from 'react';
import { EuiDragDropContext, EuiDraggable, EuiDroppable } from '@elastic/eui';
import { useObservable } from 'react-use';
import _ from 'lodash';
import { connect } from 'react-redux';
import { CoreStart } from '../../../../../../src/core/public';
import { VisualizationContainer } from '../../custom_panels/panel_modules/visualization_container';
import { updateCatalogVisualizationQuery } from '../../custom_panels/helpers/utils';
import {
  selectedMetricsSelector,
  dateSpanFilterSelector,
  refreshSelector,
  moveMetric,
  selectedMetricsIdsSelector,
  allMetricsSelector,
} from '../redux/slices/metrics_slice';

import './metrics_grid.scss';
import { coreRefs } from '../../../framework/core_refs';
import { PROMQL_METRIC_SUBTYPE } from '../../../../common/constants/shared';
import { MetricsEditInline } from '../sidebar/metrics_edit_inline';
import { EmptyMetricsView } from './empty_view';

// HOC container to provide dynamic width for Grid layout

interface MetricsGridProps {
  chrome: CoreStart['chrome'];
  moveToEvents: (savedVisualizationId: string) => any;
}

const visualizationFromMetric = (metric, dateSpanFilter): SavedVisualizationType => ({
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

export const InnerGridVisualization = ({
  id,
  idx,
  dateSpanFilter,
  refresh,
  moveToEvents,
  // metric,
  allMetrics,
}) => {
  const metric = allMetrics[id];
  if (!metric) return <></>;

  console.log('vis', { metric });
  return (
    <EuiDraggable key={id} index={idx} draggableId={id}>
      <VisualizationContainer
        key={id}
        visualizationId={id}
        savedVisualizationId={metric.savedVisualizationId}
        inputMetaData={
          metric.savedVisualizationId ? undefined : visualizationFromMetric(metric, dateSpanFilter)
        }
        fromTime={dateSpanFilter.start}
        toTime={dateSpanFilter.end}
        onRefresh={refresh}
        onEditClick={moveToEvents}
        // usedInNotebooks={true}
        pplFilterValue=""
        span={dateSpanFilter.span}
        resolution={dateSpanFilter.resolution}
        contextMenuId="metrics"
        inlineEditor={
          metric.sub_type === PROMQL_METRIC_SUBTYPE && <MetricsEditInline visualization={metric} />
        }
      />
    </EuiDraggable>
  );
};

// Memoize each Grid Visualization panel
const GridVisualization = React.memo(InnerGridVisualization);

export const InnerMetricsGrid = ({
  chrome,
  moveToEvents,
  dateSpanFilter,
  selectedMetrics,
  selectedMetricsIds,
  refresh,
  moveMetric,
  allMetrics,
}: MetricsGridProps) => {
  const isLocked = useObservable(chrome.getIsNavDrawerLocked$());

  const onDragEnd = ({ source, destination }) => {
    moveMetric({ source, destination });
  };

  const visualizationComponents = useMemo(() => {
    if (selectedMetrics.length < 1) return <EmptyMetricsView />;

    return selectedMetricsIds.map((id, idx) => {
      const metric = allMetrics[id];
      // console.log('visualizationComponents metricPanel', { metricPanel, idx });
      return (
        <GridVisualization
          id={id}
          idx={idx}
          dateSpanFilter={dateSpanFilter}
          refresh={refresh}
          moveToEvents={moveToEvents}
          metric={metric}
          allMetrics={allMetrics}
        />
      );
    });
  }, [selectedMetrics, refresh, dateSpanFilter]);

  // Reset Size of Panel Grid when Nav Dock is Locked
  useEffect(() => {
    setTimeout(function () {
      window.dispatchEvent(new Event('resize'));
    }, 300);
  }, [isLocked]);

  return (
    <EuiDragDropContext onDragEnd={onDragEnd}>
      <EuiDroppable droppableId="DROPPABLE_AREA_BARE">{visualizationComponents}</EuiDroppable>
    </EuiDragDropContext>
  );
};

const mapStateToProps = (state) => ({
  dateSpanFilter: dateSpanFilterSelector(state),
  selectedMetrics: selectedMetricsSelector(state),
  selectedMetricsIds: selectedMetricsIdsSelector(state),
  allMetrics: allMetricsSelector(state),
  refresh: refreshSelector(state),
});

const mapDispatchToProps = {
  moveMetric,
};

export const MetricsGrid = connect(mapStateToProps, mapDispatchToProps)(InnerMetricsGrid);

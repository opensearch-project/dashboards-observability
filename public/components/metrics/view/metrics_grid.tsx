/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiDragDropContext, EuiDraggable, EuiDroppable } from '@elastic/eui';
import React, { useEffect, useMemo } from 'react';
import { connect } from 'react-redux';
import { useObservable } from 'react-use';
import { CoreStart } from '../../../../../../src/core/public';
import { updateCatalogVisualizationQuery } from '../../common/query_utils';
import { VisualizationContainer } from '../../custom_panels/panel_modules/visualization_container';
import {
  allMetricsSelector,
  dateSpanFilterSelector,
  moveMetric as moveMetricAction,
  refreshSelector,
  selectedMetricsIdsSelector,
  selectedMetricsSelector,
} from '../redux/slices/metrics_slice';

import {
  OTEL_METRIC_SUBTYPE,
  PROMQL_METRIC_SUBTYPE,
  observabilityLogsID,
} from '../../../../common/constants/shared';
import { coreRefs } from '../../../framework/core_refs';
import { MetricsEditInline } from '../sidebar/metrics_edit_inline';
import { EmptyMetricsView } from './empty_view';
import './metrics_grid.scss';

// HOC container to provide dynamic width for Grid layout

interface MetricsGridProps {
  chrome: CoreStart['chrome'];
  moveToEvents: (savedVisualizationId: string) => any;
  dataSourceMDSId: string;
}

const visualizationFromPromethesMetric = (metric, dateSpanFilter): SavedVisualizationType => ({
  ...metric,
  query: updateCatalogVisualizationQuery({ ...metric, ...dateSpanFilter }),
  metricType: PROMQL_METRIC_SUBTYPE,
  queryMetaData: {
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

const visualizationFromOtelMetric = (metric, dateSpanFilter): SavedVisualizationType => ({
  ...metric,
  name: metric.name,
  description: '',
  query: '',
  type: 'bar',
  metricType: OTEL_METRIC_SUBTYPE,
  selected_date_range: {
    start: dateSpanFilter.start,
    end: dateSpanFilter.end,
    text: '',
  },
  userConfigs: {
    dataConfig: {
      type: 'bar',
    },
  },
});

const visualizationFromMetric = (metric: any, dateSpanFilter: any) => {
  if (metric.metricType === OTEL_METRIC_SUBTYPE)
    return visualizationFromOtelMetric(metric, dateSpanFilter);
  return visualizationFromPromethesMetric(metric, dateSpanFilter);
};

const navigateToEventExplorerVisualization = (savedVisualizationId: string) => {
  window.location.assign(`${observabilityLogsID}#/explorer/${savedVisualizationId}`);
};

export const InnerGridVisualization = ({
  id,
  idx,
  dateSpanFilter,
  metric,
  refresh,
  dataSourceMDSId,
}) => {
  if (!metric) return <></>;
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
        onEditClick={navigateToEventExplorerVisualization}
        pplFilterValue=""
        span={dateSpanFilter.span}
        resolution={dateSpanFilter.resolution}
        contextMenuId="metrics"
        inlineEditor={
          metric.metricType === PROMQL_METRIC_SUBTYPE && (
            <MetricsEditInline visualization={metric} />
          )
        }
        actionMenuType="metricsGrid"
        metricType={metric.subType}
        panelVisualization={metric}
        dataSourceMDSId={dataSourceMDSId}
      />
    </EuiDraggable>
  );
};

// Memoize each Grid Visualization panel
const GridVisualization = React.memo(InnerGridVisualization);

export const InnerMetricsGrid = ({
  dateSpanFilter,
  selectedMetrics,
  selectedMetricsIds,
  moveMetric,
  allMetrics,
  dataSourceMDSId,
}: MetricsGridProps) => {
  const { chrome } = coreRefs;
  const isLocked = useObservable(chrome!.getIsNavDrawerLocked$());

  const onDragEnd = ({ source, destination }) => {
    moveMetric({ source, destination });
  };

  const visualizationComponents = useMemo(() => {
    if (selectedMetrics.length < 1) return <EmptyMetricsView />;

    return selectedMetricsIds.map((id, idx) => {
      const metric = allMetrics[id];
      return (
        <GridVisualization
          id={id}
          idx={idx}
          key={id}
          dateSpanFilter={dateSpanFilter}
          metric={metric}
          dataSourceMDSId={dataSourceMDSId}
        />
      );
    });
  }, [selectedMetrics, dateSpanFilter]);

  // Reset Size of Panel Grid when Nav Dock is Locked
  useEffect(() => {
    setTimeout(function () {
      window.dispatchEvent(new Event('resize'));
    }, 300);
  }, [isLocked]);

  return (
    <section className="metricsGrid">
      <EuiDragDropContext onDragEnd={onDragEnd}>
        <EuiDroppable droppableId="DROPPABLE_AREA_BARE">{visualizationComponents}</EuiDroppable>
      </EuiDragDropContext>
    </section>
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
  moveMetric: moveMetricAction,
};

export const MetricsGrid = connect(mapStateToProps, mapDispatchToProps)(InnerMetricsGrid);

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable @typescript-eslint/no-unused-vars */

import isEmpty from 'lodash/isEmpty';
import isEqual from 'lodash/isEqual';
import differenceWith from 'lodash/differenceWith';
import React, { useEffect, useState } from 'react';
import { Filter, Query, TimeRange } from '../../../../../src/plugins/data/common';
import { QueryManager } from '../../../common/query_manager';
import { IVisualizationContainerProps, SavedVisualization } from '../../../common/types/explorer';
import { getUserConfigFrom } from '../../../common/utils/visualization_helpers';
import { getPPLService, preprocessQuery, removeBacktick } from '../../../common/utils';
import { getDefaultVisConfig } from '../event_analytics/utils';
import { getVizContainerProps } from './charts/helpers';
import { Visualization } from './visualization';
import { OTEL_METRIC_SUBTYPE, PROMQL_METRIC_SUBTYPE } from '../../../common/constants/shared';
import { fetchOtelMetric, getMetricVisConfig } from '../event_analytics/utils/utils';
import { preprocessMetricQuery } from '../common/query_utils';
import { constructOtelMetricsMetaData } from '../custom_panels/helpers/utils';
import { useToast } from '../common/toast';

interface SavedObjectVisualizationProps {
  savedVisualization: SavedVisualization;
  timeRange?: TimeRange;
  filters?: Filter[];
  query?: Query;
  whereClause?: string;
}

/**
 * Renders a visualization from a {@link SavedVisualization}.
 */
export const SavedObjectVisualization: React.FC<SavedObjectVisualizationProps> = (props) => {
  const [visContainerProps, setVisContainerProps] = useState<IVisualizationContainerProps>();
  const [isError, setIsError] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const { setToast } = useToast();

  useEffect(() => {
    const pplService = getPPLService();
    const isPromqlMetric = props.savedVisualization?.metricType === PROMQL_METRIC_SUBTYPE;
    const isOtelMetric = props.savedVisualization?.metricType === OTEL_METRIC_SUBTYPE;
    const metaData = {
      ...props.savedVisualization,
      query: props.savedVisualization.query,
      queryMetaData: props.savedVisualization.queryMetaData,
      isPromqlMetric,
    };
    const userConfigs = getUserConfigFrom(metaData);
    const dataConfig = { ...(userConfigs.dataConfig || {}) };
    const hasBreakdowns = !isEmpty(dataConfig.breakdowns);
    const realTimeParsedStats = isPromqlMetric
      ? getMetricVisConfig(metaData)
      : {
          ...getDefaultVisConfig(new QueryManager().queryParser().parse(metaData.query).getStats()),
        };

    let finalDimensions = [...(realTimeParsedStats.dimensions || [])];
    const breakdowns = [...(dataConfig.breakdowns || [])];

    // filter out breakdowns from dimnesions
    if (hasBreakdowns) {
      finalDimensions = differenceWith(finalDimensions, breakdowns, (dimn, brkdwn) =>
        isEqual(removeBacktick(dimn.name), removeBacktick(brkdwn.name))
      );
    }

    let finalDataConfig = {
      ...dataConfig,
      ...realTimeParsedStats,
      dimensions: finalDimensions,
      breakdowns,
    };

    if (isOtelMetric) {
      finalDataConfig = { ...finalDataConfig, ...constructOtelMetricsMetaData() };
    }

    const mixedUserConfigs = {
      availabilityConfig: {
        ...(userConfigs.availabilityConfig || {}),
      },
      dataConfig: {
        ...finalDataConfig,
      },
      layout: {
        ...userConfigs.layout,
      },
    };

    let query = metaData.query;

    if (props.timeRange) {
      if (isPromqlMetric) {
        query = preprocessMetricQuery({
          metaData,
          startTime: props.timeRange.from,
          endTime: props.timeRange.to,
        });
      } else if (isOtelMetric) {
        query = '';
      } else {
        query = preprocessQuery({
          rawQuery: metaData.query,
          startTime: props.timeRange.from,
          endTime: props.timeRange.to,
          timeField: props.savedVisualization.selected_timestamp.name,
          isLiveQuery: false,
          whereClause: props.whereClause,
        });
      }
    }

    if (isOtelMetric) {
      const visualizationName = props.savedVisualization?.name;
      const startTime = props.timeRange?.from;
      const endTime = props.timeRange?.to;
      const data = fetchOtelMetric({
        visualizationName,
        startTime,
        endTime,
        setIsError,
        setIsLoading,
        setToast,
      })
        .then((jsonData) => {
          const container = getVizContainerProps({
            vizId: props.savedVisualization.type,
            rawVizData: data,
            query: { rawQuery: metaData.query },
            indexFields: {},
            userConfigs: mixedUserConfigs,
            explorer: { explorerData: jsonData },
          });
          setVisContainerProps(container);
        })
        .catch((error: Error) => {
          console.error(error);
        });
    } else {
      pplService
        .fetch({ query, format: 'jdbc' })
        .then((data) => {
          const container = getVizContainerProps({
            vizId: props.savedVisualization.type,
            rawVizData: data,
            query: { rawQuery: metaData.query },
            indexFields: {},
            userConfigs: mixedUserConfigs,
            explorer: { explorerData: data, explorerFields: data.schema },
          });
          setVisContainerProps(container);
        })
        .catch((error: Error) => {
          console.error(error);
        });
    }
  }, [props]);

  return visContainerProps ? <Visualization visualizations={visContainerProps} /> : null;
};

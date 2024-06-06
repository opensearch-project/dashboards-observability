/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ShortDate } from '@elastic/eui';
import { DurationRange } from '@elastic/eui/src/components/date_picker/types';
import React from 'react';
import { Layout } from 'react-grid-layout';
import { VISUALIZATION } from '../../../../common/constants/metrics';
import {
  OTEL_METRIC_SUBTYPE,
  PPL_METRIC_SUBTYPE,
  PROMQL_METRIC_SUBTYPE,
} from '../../../../common/constants/shared';
import { VisualizationType } from '../../../../common/types/custom_panels';
import { MetricType } from '../../../../common/types/metrics';
import PPLService from '../../../services/requests/ppl';

export const onTimeChange = (
  start: ShortDate,
  end: ShortDate,
  recentlyUsedRanges: DurationRange[],
  setRecentlyUsedRanges: React.Dispatch<React.SetStateAction<DurationRange[]>>,
  setStart: React.Dispatch<React.SetStateAction<string>>,
  setEnd: React.Dispatch<React.SetStateAction<string>>
) => {
  const dedupedRanges = recentlyUsedRanges.filter((recentlyUsedRange) => {
    const isDuplicate = recentlyUsedRange.start === start && recentlyUsedRange.end === end;
    return !isDuplicate;
  });
  dedupedRanges.unshift({ start, end });
  setStart(start);
  setEnd(end);
  setRecentlyUsedRanges(dedupedRanges.slice(0, 9));
};

// PPL Service requestor
export const pplServiceRequestor = (
  pplService: PPLService,
  finalQuery: string,
  dataSourceMDSId?: string
) => {
  return pplService
    .fetch({ query: finalQuery, format: VISUALIZATION }, dataSourceMDSId)
    .then((res) => {
      return res;
    })
    .catch((error: Error) => {
      console.error(error);
    });
};

// Merges new layout into visualizations
export const mergeLayoutAndMetrics = (
  layout: Layout[],
  newVisualizationList: VisualizationType[]
) => {
  const newPanelVisualizations: VisualizationType[] = [];

  for (let i = 0; i < newVisualizationList.length; i++) {
    for (let j = 0; j < layout.length; j++) {
      if (newVisualizationList[i].id === layout[j].i) {
        newPanelVisualizations.push({
          ...newVisualizationList[i],
          x: layout[j].x,
          y: layout[j].y,
          w: layout[j].w,
          h: layout[j].h,
        });
      }
    }
  }
  return newPanelVisualizations;
};

export const sortMetricLayout = (metricsLayout: MetricType[]) => {
  return metricsLayout.sort((a: MetricType, b: MetricType) => {
    if (a.y > b.y) return 1;
    if (a.y < b.y) return -1;
    else return 0;
  });
};

export const visualizationFromPrometheusMetric = (
  metric,
  span,
  resolution
): SavedVisualizationType => {
  const userConfigs = JSON.stringify({
    dataConfig: {
      chartStyles: {
        lineWidth: '2',
        fillOpacity: '0',
      },
      series: ['@value'],
    },
  });

  return {
    ...metric,
    timeField: '@timestamp',
    selected_date_range: {
      start: 'now-1d',
      end: 'now',
      span,
      resolution,
    },
    type: 'line',
    subType: PPL_METRIC_SUBTYPE,
    metricType: PROMQL_METRIC_SUBTYPE,
    userConfigs: JSON.stringify(userConfigs),
  };
};

export const createOtelMetric = (metric: any) => {
  return {
    name: '[Otel Metric] ' + metric.index + '.' + metric.name,
    index: metric.index,
    documentName: metric.name,
    description: '',
    query: '',
    type: 'bar',
    selected_fields: {
      text: '',
      tokens: [],
    },
    sub_type: 'metric',
    metric_type: OTEL_METRIC_SUBTYPE,
    user_configs: {},
  };
};

export const visualizationFromOtelMetric = (metric: any) => {
  return {
    query: '',
    index: metric.index,
    documentName: metric.documentName,
    dateRange: ['now-1d', 'now'],
    name: '[Otel Metric] ' + metric.index + '.' + metric.name,
    description: metric.description,
    type: 'bar',
    subType: PPL_METRIC_SUBTYPE,
    metricType: OTEL_METRIC_SUBTYPE,
    userConfigs: JSON.stringify(metric.user_configs),
  };
};

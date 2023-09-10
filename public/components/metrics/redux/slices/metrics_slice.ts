/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createSlice } from '@reduxjs/toolkit';
import { sortBy } from 'lodash';
import { ouiPaletteColorBlindBehindText } from '@elastic/eui';
import {
  PPL_DATASOURCES_REQUEST,
  REDUX_SLICE_METRICS,
  SAVED_VISUALIZATION,
  OBSERVABILITY_CUSTOM_METRIC,
} from '../../../../../common/constants/metrics';
import { MetricType } from '../../../../../common/types/metrics';
import { SavedObjectsActions } from '../../../../services/saved_objects/saved_object_client/saved_objects_actions';
import { ObservabilitySavedVisualization } from '../../../../services/saved_objects/saved_object_client/types';
import { getNewVizDimensions, pplServiceRequestor, sortMetricLayout } from '../../helpers/utils';
import { coreRefs } from '../../../../framework/core_refs';

export interface IconAttributes {
  color: string;
}
const coloredIconsFrom = (dataSources: string[]): { [dataSource: string]: IconAttributes } => {
  const colorCycle = ouiPaletteColorBlindBehindText({ sortBy: 'natural' });
  const keyedIcons = dataSources.map((dataSource, index) => {
    return [
      dataSource,
      {
        color: colorCycle[index],
      },
    ];
  });

  return Object.fromEntries(keyedIcons);
};

const initialState = {
  metrics: [],
  selected: [],
  searched: [],
  search: '',
  metricsLayout: [],
  dataSources: [OBSERVABILITY_CUSTOM_METRIC],
  dataSourceTitles: ['Observability Custom Metrics'],
  dataSourceIcons: coloredIconsFrom([OBSERVABILITY_CUSTOM_METRIC]),
};

export const loadMetrics = () => async (dispatch) => {
  const { http, pplService } = coreRefs;
  const customDataRequest = fetchCustomMetrics(http);
  const remoteDataSourcesResponse = await pplServiceRequestor(pplService!, PPL_DATASOURCES_REQUEST);
  const remoteDataSources = remoteDataSourcesResponse.data.DATASOURCE_NAME;

  dispatch(setDataSources(remoteDataSources));
  dispatch(setDataSourceTitles(remoteDataSources));
  dispatch(
    setDataSourceIcons(coloredIconsFrom([OBSERVABILITY_CUSTOM_METRIC, ...remoteDataSources]))
  );

  const remoteDataRequests = await fetchRemoteMetrics(remoteDataSources);
  const dataResponses = await Promise.all([customDataRequest, ...remoteDataRequests]);
  dispatch(setMetrics(dataResponses.flat()));
};

const fetchCustomMetrics = async () => {
  const dataSet = await SavedObjectsActions.getBulk<ObservabilitySavedVisualization>({
    objectType: [SAVED_VISUALIZATION],
  });
  const savedMetrics = dataSet.observabilityObjectList.filter(
    (obj) => obj.savedVisualization.sub_type === 'metric'
  );
  return savedMetrics.map((obj: any) => ({
    id: obj.objectId,
    name: obj.savedVisualization.name,
    catalog: 'CUSTOM_METRICS',
    type: obj.savedVisualization.type,
    recentlyCreated: (Date.now() - obj.createdTimeMs) / 36e5 <= 12,
  }));
};

const fetchRemoteDataSource = async (dataSource) => {
  const { pplService } = coreRefs;

  const response = await pplServiceRequestor(
    pplService,
    `source = ${dataSource}.information_schema.tables`
  );
  return { jsonData: response.jsonData, dataSource };
};

const fetchRemoteMetrics = async (remoteDataSources: string[]): Promise<any> => {
  return remoteDataSources.map((dataSource) =>
    fetchRemoteDataSource(dataSource).then(({ jsonData }) =>
      jsonData.map((obj: any) => ({
        id: `${obj.TABLE_CATALOG}.${obj.TABLE_NAME}`,
        name: `${obj.TABLE_CATALOG}.${obj.TABLE_NAME}`,
        catalog: `${dataSource}`,
        type: obj.TABLE_TYPE,
        recentlyCreated: false,
      }))
    )
  );
};

const updateLayoutBySelection = (state: any, newMetric: any) => {
  const newDimensions = getNewVizDimensions(state.metricsLayout);

  const metricVisualization: MetricType = {
    id: newMetric.id,
    savedVisualizationId: newMetric.id,
    x: newDimensions.x,
    y: newDimensions.y,
    h: newDimensions.h,
    w: newDimensions.w,
    metricType:
      newMetric.catalog === OBSERVABILITY_CUSTOM_METRIC ? 'savedCustomMetric' : 'prometheusMetric',
  };
  state.metricsLayout = [...state.metricsLayout, metricVisualization];
};

const updateLayoutByDeSelection = (state: any, newMetric: any) => {
  const sortedMetricsLayout = sortMetricLayout(state.metricsLayout);

  const newMetricsLayout = [] as MetricType[];
  let heightSubtract = 0;

  sortedMetricsLayout.map((metricLayout: MetricType) => {
    if (metricLayout.id !== newMetric.id) {
      metricLayout.y = metricLayout.y - heightSubtract;
      newMetricsLayout.push(metricLayout);
    } else {
      heightSubtract = metricLayout.h;
    }
  });
  state.metricsLayout = newMetricsLayout;
};

export const metricSlice = createSlice({
  name: REDUX_SLICE_METRICS,
  initialState,
  reducers: {
    setMetrics: (state, { payload }) => {
      state.metrics = payload;
    },
    selectMetric: (state, { payload }) => {
      state.selected.push(payload.id);
      updateLayoutBySelection(state, payload);
    },
    deSelectMetric: (state, { payload }) => {
      updateLayoutByDeSelection(state, payload);
      state.selected = state.selected.filter((id) => id !== payload.id);
    },
    setSearch: (state, { payload }) => {
      state.search = payload;
    },

    updateMetricsLayout: (state, { payload }) => {
      state.metricsLayout = payload;
      state.selected = sortBy(payload, ['x', 'y']).map(({ id }) => id);
    },
    setDataSources: (state, { payload }) => {
      state.dataSources = [OBSERVABILITY_CUSTOM_METRIC, ...payload];
    },
    setDataSourceTitles: (state, { payload }) => {
      state.dataSourceTitles = ['Observability Custom Metrics', ...payload];
    },
    setDataSourceIcons: (state, { payload }) => {
      state.dataSourceIcons = payload;
    },
  },
});

export const {
  setMetrics,
  deSelectMetric,
  selectMetric,
  updateMetricsLayout,
  setSearch,
  setDataSources,
  setDataSourceTitles,
  setDataSourceIcons,
} = metricSlice.actions;

export const availableMetricsSelector = (state) =>
  state.metrics.metrics
    .filter((metric) => !state.metrics.selected.includes(metric.id))
    .filter(
      (metric) =>
        state.metrics.search === '' || metric.name.match(new RegExp(state.metrics.search, 'i'))
    );

export const selectedMetricsSelector = (state) =>
  state.metrics.selected.map((id) => state.metrics.metrics.find((metric) => metric.id === id));

export const searchSelector = (state) => state.metrics.search;

export const metricIconsSelector = (state) => state.metrics.dataSourceIcons;

export const metricsLayoutSelector = (state) => state.metrics.metricsLayout;

export const dataSourcesSelector = (state) => state.metrics.dataSources;

export const metricsReducers = metricSlice.reducer;

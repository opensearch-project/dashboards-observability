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
import { fetchVisualizationById } from '../../../custom_panels/helpers/utils';

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
  dateSpanFilter: {
    start: 'now-1d',
    end: 'now',
    span: 1,
    resolution: 'h',
    recentlyUsedRanges: [],
  },
  refresh: 0, // set to new Date() to trigger
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
    savedVisualizationId: obj.objectId,
    query: obj.savedVisualization.query,
    name: obj.savedVisualization.name,
    catalog: OBSERVABILITY_CUSTOM_METRIC,
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

const metricQueryFromId = (id: string) => {
  return `source = ${id} | stats avg(@value) by span(@timestamp, 1d)`;
};

const loadMetric = async (metric) =>
  metric.catalog === OBSERVABILITY_CUSTOM_METRIC
    ? await fetchVisualizationById(coreRefs.http!, metric.savedVisualizationId, (err) =>
        coreRefs.toasts?.addDanger({
          title: `There was an issue loading metric ${metric.name}`,
          text: err,
        })
      )
    : metric;

export const selectMetric = (metric) => async (dispatch, getState) => {
  dispatch(updateLayoutBySelection(metric));
};

export const deSelectMetric = (metric) => (dispatch, getState) => {
  dispatch(updateLayoutByDeSelection(metric));
};

const updateLayoutBySelection = (newMetric: any) => async (dispatch, getState) => {
  const metric = await loadMetric(newMetric);

  const metricsLayout = getState().metrics.metricsLayout;
  const newDimensions = getNewVizDimensions(metricsLayout);

  const metricVisualization: MetricType = {
    id: metric.id,
    savedVisualizationId: metric.savedVisualizationId,
    query: metric.query || metricQueryFromId(metric.id),
    x: newDimensions.x,
    y: newDimensions.y,
    h: newDimensions.h,
    w: newDimensions.w,
    type: 'line',
  };

  dispatch(updateMetricsLayout([...metricsLayout, metricVisualization]));
};

const updateLayoutByDeSelection = (metric) => (dispatch, getState) => {
  const metricsLayout = getState().metrics.metricsLayout;

  const sortedMetricsLayout = sortMetricLayout([...metricsLayout]);

  let heightSubtract = 0;

  const newMetricsLayout = sortedMetricsLayout
    .map((metricLayout: MetricType) => {
      if (metricLayout.id !== metric.id) {
        return {
          ...metricLayout,
          y: metricLayout.y - heightSubtract,
        };
      } else {
        heightSubtract = metricLayout.h;
      }
    })
    .filter((item) => item);

  dispatch(updateMetricsLayout(newMetricsLayout));
};

export const metricSlice = createSlice({
  name: REDUX_SLICE_METRICS,
  initialState,
  reducers: {
    setMetrics: (state, { payload }) => {
      state.metrics = payload;
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
    setDateSpan: (state, { payload }) => {
      state.dateSpanFilter = { ...state.dateSpanFilter, ...payload };
    },
    setRefresh: (state) => {
      state.refresh = Date.now();
    },
  },
});

export const {
  setDataSourceIcons,
  setDataSourceTitles,
  setDataSources,
  setMetrics,
  setRefresh,
  setSearch,
  updateMetricsLayout,
} = metricSlice.actions;

/** private actions */
const { setDateSpan } = metricSlice.actions;

export const availableMetricsSelector = (state) =>
  state.metrics.metrics
    .filter((metric) => !state.metrics.selected.includes(metric.id))
    .filter(
      (metric) =>
        state.metrics.search === '' || metric.name.match(new RegExp(state.metrics.search, 'i'))
    );

export const updateStartEndDate = ({ start, end }) => (dispatch, getState) => {
  const currentDateSpanFilter = getState().metrics.dateSpanFilter;
  const recentlyUsedRange = currentDateSpanFilter.recentlyUsedRanges.filter((r) => {
    const isDuplicate = r.start === start && r.end === end;
    return !isDuplicate;
  });
  recentlyUsedRange.unshift({ start, end });

  dispatch(setDateSpan({ start, end, recentlyUsedRanges: recentlyUsedRange.slice(0, 9) }));
  dispatch(setRefresh());
};

export const updateDateSpan = (props: { span?: string; resolution?: string }) => (dispatch) => {
  dispatch(setDateSpan(props)); // specifically use props variable to partial update
};

export const selectedMetricsSelector = (state) =>
  state.metrics.selected.map((id) => state.metrics.metrics.find((metric) => metric.id === id));

export const searchSelector = (state) => state.metrics.search;

export const metricIconsSelector = (state) => state.metrics.dataSourceIcons;

export const metricsLayoutSelector = (state) => state.metrics.metricsLayout;

export const dataSourcesSelector = (state) => state.metrics.dataSources;

export const dateSpanFilterSelector = (state) => state.metrics.dateSpanFilter;

export const refreshSelector = (state) => state.metrics.refresh;

export const metricsReducers = metricSlice.reducer;

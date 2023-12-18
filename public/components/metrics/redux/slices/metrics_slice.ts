/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { keyBy, mergeWith, pick, sortBy, merge } from 'lodash';
import { ouiPaletteColorBlindBehindText } from '@elastic/eui';
import {
  OBSERVABILITY_CUSTOM_METRIC,
  PPL_DATASOURCES_REQUEST,
  REDUX_SLICE_METRICS,
  SAVED_VISUALIZATION,
} from '../../../../../common/constants/metrics';
import { MetricType } from '../../../../../common/types/metrics';
import { SavedObjectsActions } from '../../../../services/saved_objects/saved_object_client/saved_objects_actions';
import { ObservabilitySavedVisualization } from '../../../../services/saved_objects/saved_object_client/types';
import { pplServiceRequestor } from '../../helpers/utils';
import { coreRefs } from '../../../../framework/core_refs';
import { PPL_METRIC_SUBTYPE, PROMQL_METRIC_SUBTYPE } from '../../../../../common/constants/shared';
import { getOSDHttp, getPPLService } from '../../../../../common/utils';

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
  metrics: {},
  selectedIds: [],
  sortedIds: [],
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

const mergeMetricCustomizer = function (objValue, srcValue) {
  return {
    ...srcValue,
    availableAttributes:
      objValue?.availableAttributes?.length > 0
        ? objValue.availableAttributes
        : srcValue.availableAttributes,
  };
};

const now = () => new Date().getMilliseconds();

export const loadMetrics = () => async (dispatch) => {
  const pplService = getPPLService();
  const customDataRequest = fetchCustomMetrics();
  const remoteDataSourcesResponse = await pplServiceRequestor(pplService!, PPL_DATASOURCES_REQUEST);
  const remoteDataSources = remoteDataSourcesResponse.data.DATASOURCE_NAME;

  dispatch(setDataSources(remoteDataSources));
  dispatch(setDataSourceTitles(remoteDataSources));
  dispatch(
    setDataSourceIcons(coloredIconsFrom([OBSERVABILITY_CUSTOM_METRIC, ...remoteDataSources]))
  );

  const remoteDataRequests = fetchRemoteMetrics(remoteDataSources);
  const metricsResultSet = await Promise.all([customDataRequest, ...remoteDataRequests]);
  const metricsResult = metricsResultSet.flat();

  const metricsMapById = keyBy(metricsResult.flat(), 'id');
  await dispatch(mergeMetrics(metricsMapById));

  const sortedIds = sortBy(metricsResult, 'catalog', 'id').map((m) => m.id);
  await dispatch(setSortedIds(sortedIds));
};

const fetchCustomMetrics = async () => {
  const dataSet = await SavedObjectsActions.getBulk<ObservabilitySavedVisualization>({
    objectType: [SAVED_VISUALIZATION],
  });
  const savedMetrics = dataSet.observabilityObjectList.filter((obj) =>
    [PROMQL_METRIC_SUBTYPE, PPL_METRIC_SUBTYPE].includes(obj.savedVisualization?.subType)
  );

  return savedMetrics.map((obj: any) => ({
    id: obj.objectId,
    savedVisualizationId: obj.objectId,
    query: obj.savedVisualization.query,
    name: obj.savedVisualization.name,
    catalog: OBSERVABILITY_CUSTOM_METRIC,
    type: obj.savedVisualization.type,
    subType: obj.savedVisualization.subType,
    aggregation: obj.savedVisualization.queryMetaData?.aggregation ?? 'avg',
    availableAttributes: [],
    attributesGroupBy: obj.savedVisualization.queryMetaData?.attributesGroupBy ?? [],
    index: `${obj.savedVisualization.queryMetaData?.catalogSourceName}.${obj.savedVisualization.queryMetaData?.catalogTableName}`,
    recentlyCreated: (Date.now() - obj.createdTimeMs) / 36e5 <= 12,
  }));
};

const fetchRemoteDataSource = async (dataSource) => {
  const pplService = getPPLService();
  const response = await pplServiceRequestor(
    pplService,
    `source = ${dataSource}.information_schema.tables`
  );
  return { jsonData: response.jsonData, dataSource };
};

const fetchRemoteMetrics = (remoteDataSources: string[]) =>
  remoteDataSources.map((dataSource) =>
    fetchRemoteDataSource(dataSource).then(({ jsonData }) =>
      jsonData.map((obj: any) => ({
        id: `${obj.TABLE_CATALOG}.${obj.TABLE_NAME}`,
        name: `${obj.TABLE_CATALOG}.${obj.TABLE_NAME}`,
        catalog: `${dataSource}`,
        catalogSourceName: dataSource,
        catalogTableName: obj.TABLE_NAME,
        index: `${dataSource}.${obj.TABLE_NAME}`,
        query: undefined,
        aggregation: 'avg',
        attributesGroupBy: [],
        availableAttributes: [],
        type: 'line',
        subType: PROMQL_METRIC_SUBTYPE,
        recentlyCreated: false,
      }))
    )
  );

export const metricSlice = createSlice({
  name: REDUX_SLICE_METRICS,
  initialState,
  reducers: {
    mergeMetrics: (state, { payload }) => {
      const { metrics } = state;
      const modifiableMetricsMap = { ...metrics };

      const mergedMetrics = mergeWith(modifiableMetricsMap, payload, mergeMetricCustomizer);
      state.metrics = mergedMetrics;
    },

    // setMetrics: (state, { payload }) => {
    //   state.metrics = payload;
    // },
    setMetric: (state, { payload }) => {
      state.metrics[payload.id] = payload;
    },
    setSortedIds: (state, { payload }) => {
      state.sortedIds = payload;
    },

    clearSelectedMetrics: (state) => {
      state.selectedIds = [];
    },

    selectMetric: (state, { payload }) => {
      state.selectedIds.push(payload.id);
    },

    deSelectMetric: (state, { payload }) => {
      state.selectedIds = state.selectedIds.filter((id) => id !== payload);
    },

    moveMetric: (state, { payload: { source, destination } }) => {
      const movingId = state.selectedIds.splice(source.index, 1);
      state.selectedIds.splice(destination.index, 0, movingId[0]);
    },

    setSearch: (state, { payload }) => {
      state.search = payload;
    },

    updateMetric: (state, { payload: { id, metric } }) => {
      state.metrics[id] = metric;
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
  clearSelectedMetrics,

  mergeMetrics,
  moveMetric,
  setSearch,
  setDateSpan,
  setDataSources,
  setDataSourceTitles,
  setDataSourceIcons,
  updateMetric,
} = metricSlice.actions;

/** private actions */

const { selectMetric, setMetric, setSortedIds } = metricSlice.actions;

const getAvailableAttributes = (id, metricIndex) => async (dispatch, getState) => {
  const { toasts } = coreRefs;
  const pplService = getPPLService();

  try {
    const columnSchema = await pplService.fetch({
      query: 'describe ' + metricIndex + ' | fields COLUMN_NAME',
      format: 'jdbc',
    });
    const availableAttributes = columnSchema.jsonData
      .map((sch) => sch.COLUMN_NAME)
      .filter((col) => col[0] !== '@');

    dispatch(updateMetricQuery(id, { availableAttributes }));
  } catch (e) {
    toasts?.addDanger(`An error occurred retrieving attributes for metric ${id} `);
    console.error(`An error occurred retrieving attributes for metric ${id} `, e);
  }
};

export const addSelectedMetric = (metric: MetricType) => async (dispatch, getState) => {
  const currentSelectedIds = getState().metrics.selectedIds;
  if (currentSelectedIds.includes(metric.id)) return;

  if (metric.subType === PROMQL_METRIC_SUBTYPE) {
    await dispatch(getAvailableAttributes(metric.id, metric.index));
  }
  await dispatch(selectMetric(metric));
};

export const removeSelectedMetric = ({ id }) => async (dispatch, getState) => {
  dispatch(deSelectMetric(id));
};

export const updateMetricQuery = (id, { availableAttributes, aggregation, attributesGroupBy }) => (
  dispatch,
  getState
) => {
  const state = getState();
  const staticMetric = getState().metrics.metrics[id];
  const metric = {
    ...staticMetric,
    aggregation: aggregation || staticMetric.aggregation || 'avg',
    attributesGroupBy: attributesGroupBy || staticMetric.attributesGroupBy || [],
    availableAttributes: availableAttributes || staticMetric.availableAttributes || [],
  };
  return dispatch(setMetric(metric));
};

export const searchOrTrue = (search, metric) => {
  if (search === '') return true;
  return metric.name.match(new RegExp(search, 'i'));
};

export const selectMetricByIdSelector = (id) => (state) => {
  return state.metrics.metrics[id];
};

export const allMetricsSelector = (state) => state.metrics.metrics;

export const availableMetricsSelector = (state) => {
  return (
    state.metrics.sortedIds
      ?.filter((id) => !state.metrics.selectedIds?.includes(id))
      .filter((id) => searchOrTrue(state.metrics.search, state.metrics.metrics[id]))
      .map((id) => state.metrics.metrics[id]) ?? []
  );
};
export const selectedMetricsSelector = (state) =>
  pick(state.metrics.metrics, state.metrics.selectedIds) ?? {};

export const selectedMetricByIdSelector = (id) => (state) => state.metrics.metrics[id];

export const selectedMetricsIdsSelector = (state) => state.metrics.selectedIds ?? [];

export const searchSelector = (state) => state.metrics.search;

export const metricIconsSelector = (state) => state.metrics.dataSourceIcons;

export const metricsLayoutSelector = (state) => state.metrics.metricsLayout;

export const dateSpanFilterSelector = (state) => state.metrics.dateSpanFilter;

export const refreshSelector = (state) => state.metrics.refresh;

export const metricQuerySelector = (id) => (state) =>
  state.metrics.metricsLayout.find((layout) => layout.id === id)?.query || {
    aggregation: '',
    attributesGroupBy: [],
    availableAttributes: [],
  };

export const metricsReducers = metricSlice.reducer;

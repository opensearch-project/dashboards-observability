/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ouiPaletteColorBlindBehindText } from '@elastic/eui';
import { createSlice } from '@reduxjs/toolkit';
import keyBy from 'lodash/keyBy';
import mergeWith from 'lodash/mergeWith';
import pick from 'lodash/pick';
import sortBy from 'lodash/sortBy';
import {
  OBSERVABILITY_CUSTOM_METRIC,
  PPL_DATASOURCES_REQUEST,
  REDUX_SLICE_METRICS,
  SAVED_VISUALIZATION,
} from '../../../../../common/constants/metrics';
import {
  OBSERVABILITY_BASE,
  PPL_METRIC_SUBTYPE,
  PROMQL_METRIC_SUBTYPE,
} from '../../../../../common/constants/shared';
import { MetricType } from '../../../../../common/types/metrics';
import { getOSDHttp, getPPLService } from '../../../../../common/utils';
import { coreRefs } from '../../../../framework/core_refs';
import { SavedObjectsActions } from '../../../../services/saved_objects/saved_object_client/saved_objects_actions';
import { ObservabilitySavedVisualization } from '../../../../services/saved_objects/saved_object_client/types';
import { pplServiceRequestor } from '../../helpers/utils';

export interface IconAttributes {
  color: string;
}

export const coloredIconsFrom = (
  dataSources: string[]
): { [dataSource: string]: IconAttributes } => {
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

export interface DateSpanFilter {
  start: string;
  end: string;
  span: number;
  resolution: string;
  recentlyUsedRanges: string[];
}

const initialState = {
  metrics: {},
  selectedIds: [], // selected IDs
  sortedIds: [], // all avaliable metrics
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
  selectedDataSource: '',
  otelIndices: [],
  otelDocumentNames: [],
  dataSourceMDSId: '',
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
export const mergeMetrics = (newMetricMap) => (dispatch, getState) => {
  const { metrics } = getState().metrics;
  const modifiableMetricsMap = { ...metrics };

  const mergedMetrics = mergeWith(modifiableMetricsMap, newMetricMap, mergeMetricCustomizer);
  dispatch(setMetrics(mergedMetrics));
};

export const loadMetrics = (dataSourceMDSId: string) => async (dispatch) => {
  const pplService = getPPLService();
  const customDataRequest = fetchCustomMetrics();
  const remoteDataSourcesResponse = await pplServiceRequestor(
    pplService!,
    PPL_DATASOURCES_REQUEST,
    dataSourceMDSId
  );
  const remoteDataSources = remoteDataSourcesResponse.data.DATASOURCE_NAME;
  dispatch(setDataSources(remoteDataSources));
  dispatch(setDataSourceTitles(remoteDataSources));
  dispatch(
    setDataSourceIcons(
      coloredIconsFrom([OBSERVABILITY_CUSTOM_METRIC, ...remoteDataSources, 'OpenTelemetry'])
    )
  );

  const remoteDataRequests = await fetchRemoteMetrics(remoteDataSources, dataSourceMDSId);
  const metricsResultSet = await Promise.all([customDataRequest, ...remoteDataRequests]);
  const metricsResult = metricsResultSet.flat();
  const metricsMapById = keyBy(metricsResult.flat(), 'id');
  dispatch(mergeMetrics(metricsMapById));

  const sortedIds = sortBy(metricsResult, 'catalog', 'id').map((m) => m.id);
  await dispatch(setSortedIds(sortedIds));
};

export const loadOTIndices = (dataSourceMDSId: string) => async (dispatch) => {
  const fetchOTindices = await fetchOpenTelemetryIndices(dataSourceMDSId);
  dispatch(setOtelIndices(fetchOTindices));
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
    metricType: 'customMetric',
    aggregation: obj.savedVisualization.queryMetaData?.aggregation ?? 'avg',
    availableAttributes: [],
    attributesGroupBy: obj.savedVisualization.queryMetaData?.attributesGroupBy ?? [],
    index: `${obj.savedVisualization.queryMetaData?.catalogSourceName}.${obj.savedVisualization.queryMetaData?.catalogTableName}`,
    recentlyCreated: (Date.now() - obj.createdTimeMs) / 36e5 <= 12,
  }));
};

const fetchRemoteDataSource = async (dataSource, dataSourceMDSId: string) => {
  const pplService = getPPLService();
  const response = await pplServiceRequestor(
    pplService,
    `source = ${dataSource}.information_schema.tables`,
    dataSourceMDSId
  );
  return { jsonData: response.jsonData, dataSource };
};

const fetchRemoteMetrics = (remoteDataSources: string[], dataSourceMDSId: string) =>
  remoteDataSources.map((dataSource) =>
    fetchRemoteDataSource(dataSource, dataSourceMDSId).then(({ jsonData }) =>
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
        subType: PPL_METRIC_SUBTYPE,
        metricType: PROMQL_METRIC_SUBTYPE,
        recentlyCreated: false,
      }))
    )
  );

export const fetchOpenTelemetryIndices = async (dataSourceMDSId: string) => {
  const http = getOSDHttp();
  return http
    .get(`${OBSERVABILITY_BASE}/search/indices/${dataSourceMDSId ?? ''}`, {
      query: {
        format: 'json',
      },
    })
    .catch((error) => console.error(error));
};

export const fetchOpenTelemetryDocumentNames = (
  selectedOtelIndex: string,
  dataSourceMDSId: string
) => async () => {
  const http = getOSDHttp();
  return http
    .get(
      `${OBSERVABILITY_BASE}/metrics/otel/${selectedOtelIndex}/documentNames/${
        dataSourceMDSId ?? ''
      }`
    )
    .catch((error) => console.error(error));
};

export const metricSlice = createSlice({
  name: REDUX_SLICE_METRICS,
  initialState,
  reducers: {
    setMetrics: (state, { payload }) => {
      state.metrics = payload;
    },
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
    setDateSpan: (state, { payload }) => {
      state.dateSpanFilter = { ...state.dateSpanFilter, ...payload };
    },
    setRefresh: (state) => {
      state.refresh = Date.now();
    },
    setSelectedDataSource: (state, { payload }) => {
      state.selectedDataSource = payload;
    },
    setOtelIndices: (state, { payload }) => {
      state.otelIndices = payload;
    },
    setOtelDocumentNames: (state, { payload }) => {
      state.otelDocumentNames = payload;
    },
    setSelectedDataSourceMDSId: (state, { payload }) => {
      state.dataSourceMDSId = payload;
    },
  },
});

export const {
  deSelectMetric,
  clearSelectedMetrics,
  selectMetric,
  moveMetric,
  setSearch,
  setDateSpan,
  setDataSources,
  setDataSourceTitles,
  setDataSourceIcons,
  updateMetric,
  setSelectedDataSource,
  setOtelIndices,
  setOtelDocumentNames,
  setSelectedDataSourceMDSId,
} = metricSlice.actions;

/** private actions */

export const { setMetrics, setMetric, setSortedIds } = metricSlice.actions;

const getAvailableAttributes = (id, metricIndex, dataSourceMDSId: string) => async (dispatch) => {
  const { toasts } = coreRefs;
  const pplService = getPPLService();
  try {
    const columnSchema = await pplService.fetch(
      {
        query: 'describe ' + metricIndex + ' | fields COLUMN_NAME',
        format: 'jdbc',
      },
      dataSourceMDSId
    );
    const availableAttributes = columnSchema.jsonData
      .map((sch) => sch.COLUMN_NAME)
      .filter((col) => col[0] !== '@');

    dispatch(updateMetricQuery(id, { availableAttributes }));
  } catch (e) {
    toasts?.addDanger(`An error occurred retrieving attributes for metric ${id} `);
    console.error(`An error occurred retrieving attributes for metric ${id} `, e);
  }
};

export const addSelectedMetric = (metric: MetricType, dataSourceMDSId: string) => async (
  dispatch,
  getState
) => {
  const currentSelectedIds = getState().metrics.selectedIds;
  if (currentSelectedIds.includes(metric.id)) return;

  if (metric.metricType === PROMQL_METRIC_SUBTYPE) {
    await dispatch(getAvailableAttributes(metric.id, metric.index, dataSourceMDSId));
  }
  await dispatch(selectMetric(metric));
};

export const removeSelectedMetric = ({ id }) => async (dispatch) => {
  dispatch(deSelectMetric(id));
};

export const updateMetricQuery = (id, { availableAttributes, aggregation, attributesGroupBy }) => (
  dispatch,
  getState
) => {
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

export const selectedMetricsIdsSelector = (state) => state.metrics.selectedIds ?? [];

export const searchSelector = (state) => state.metrics.search;

export const metricIconsSelector = (state) => state.metrics.dataSourceIcons;

export const dateSpanFilterSelector = (state) => state.metrics.dateSpanFilter;

export const refreshSelector = (state) => state.metrics.refresh;

export const metricQuerySelector = (id) => (state) =>
  state.metrics.metricsLayout.find((layout) => layout.id === id)?.query || {
    aggregation: '',
    attributesGroupBy: [],
    availableAttributes: [],
  };

export const selectedDataSourcesSelector = (state) => state.metrics.selectedDataSource;

export const otelIndexSelector = (state) => state.metrics.otelIndices;

export const otelDocumentNamesSelector = (state) => state.metrics.otelDocumentNames;

export const metricsReducers = metricSlice.reducer;

export const selectedDataSourceMDSId = (state) => state.metrics.dataSourceMDSId;

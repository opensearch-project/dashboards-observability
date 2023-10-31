/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createSlice } from '@reduxjs/toolkit';
import { keyBy, sortBy } from 'lodash';
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
import { PROMQL_METRIC_SUBTYPE } from '../../../../../common/constants/shared';
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

export interface DateSpanFilter {
  start: string;
  end: string;
  span: number;
  resolution: string;
  recentlyUsedRanges: string[];
}

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
  const metricsResultSet = await Promise.all([customDataRequest, ...remoteDataRequests]);
  const metricsResult = metricsResultSet.flat();

  const metricsMapByName = keyBy(metricsResult.flat(), 'id');
  dispatch(setMetrics(metricsMapByName));

  const sortedIds = sortBy(metricsResult, 'catalog', 'id').map((m) => m.id);
  console.log('loadMetrics', { metricsMapByName, sortedIds });
  dispatch(setSortedIds(sortedIds));
};

const fetchCustomMetrics = async () => {
  const dataSet = await SavedObjectsActions.getBulk<ObservabilitySavedVisualization>({
    objectType: [SAVED_VISUALIZATION],
  });
  console.log('fetchCustomMetrics', dataSet.observabilityObjectList);
  const savedMetrics = dataSet.observabilityObjectList.filter(
    (obj) => obj.savedVisualization.sub_type === PROMQL_METRIC_SUBTYPE
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
        catalogSourceName: dataSource,
        catalogTableName: obj.TABLE_NAME,
        index: `${dataSource}.${obj.TABLE_NAME}`,
        query: undefined,
        aggregation: 'avg',
        attributesGroupBy: [],
        availableAttributes: [],
        type: 'line',
        sub_type: PROMQL_METRIC_SUBTYPE,
        recentlyCreated: false,
      }))
    )
  );
};

const updateLayoutBySelection = (state: any, newMetric: any) => {
  const newDimensions = getNewVizDimensions(state.metricsLayout);

  const metricVisualization: MetricType = {
    id: newMetric.id,
    x: newDimensions.x,
    y: newDimensions.y,
    h: newDimensions.h,
    w: newDimensions.w,
  };
  state.metricsLayout = [...state.metricsLayout, metricVisualization];
};

const loadMetric = async (metric) =>
  metric.sub_type === PROMQL_METRIC_SUBTYPE
    ? await fetchVisualizationById(coreRefs.http!, metric.savedVisualizationId, (err) =>
        coreRefs.toasts?.addDanger({
          title: `There was an issue loading metric ${metric.name}`,
          text: err,
        })
      )
    : metric;

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
    setMetric: (state, { payload }) => {
      state.metrics[payload.id] = payload;
    },
    setSortedIds: (state, { payload }) => {
      state.sortedIds = payload;
    },

    selectMetric: (state, { payload }) => {
      state.selectedIds.push(payload.id);
      // updateLayoutBySelection(state, payload);
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
  },
});

export const {
  deSelectMetric,
  selectMetric,
  moveMetric,
  setSearch,
  setDataSources,
  setDataSourceTitles,
  setDataSourceIcons,
  updateMetric,
} = metricSlice.actions;

/** private actions */
const { setDateSpan, setRefresh } = metricSlice.actions;

const { setMetrics, setMetric, setSortedIds } = metricSlice.actions;

const getAvailableAttributes = (id, metricIndex) => async (dispatch, getState) => {
  const { pplService, toasts } = coreRefs;

  try {
    const columnSchema = await pplService.fetch({
      query: 'describe ' + metricIndex + ' | fields COLUMN_NAME',
      format: 'jdbc',
    });
    const availableAttributes = columnSchema.jsonData
      .map((sch) => sch.COLUMN_NAME)
      .filter((col) => col[0] !== '@');

    console.log('getAvailableAttributes', { id, metricIndex, columnSchema, availableAttributes });
    dispatch(updateMetricQuery(id, { availableAttributes }));
  } catch (e) {
    toasts?.addDanger(`An error occurred retrieving attributes for metric ${id} `);
    console.error(`An error occurred retrieving attributes for metric ${id} `, e);
  }
};

export const addSelectedMetric = (metric: MetricType) => async (dispatch, getState) => {
  const currentSelectedIds = getState().metrics.selectedIds;
  if (currentSelectedIds.includes(metric.id)) return;

  if (metric.sub_type === PROMQL_METRIC_SUBTYPE) {
    dispatch(getAvailableAttributes(metric.id, metric.index));
  }
  dispatch(selectMetric(metric));
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
  console.log('updateMetricQuery', {
    id,
    staticMetric,
    metric,
    availableAttributes,
    aggregation,
    attributesGroupBy,
  });
  dispatch(setMetric(metric));
};

export const searchOrTrue = (search, metric) => {
  if (search === '') return true;
  return metric.name.match(new RegExp(search, 'i'));
};

export const selectMetricByIdSelector = (id) => (state) => {
  return state.metrics.metrics[id];
};

export const availableMetricsSelector = (state) => {
  return (
    state.metrics.sortedIds
      ?.filter((id) => !state.metrics.selectedIds?.includes(id))
      .filter((id) => searchOrTrue(state.metrics.search, state.metrics.metrics[id]))
      .map((id) => state.metrics.metrics[id]) ?? []
  );
};
export const selectedMetricsSelector = (state) =>
  state.metrics.selectedIds?.map((id) => state.metrics.metrics[id]).filter((id) => id) ?? [];

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

export const dataSourcesSelector = (state) => state.metrics.dataSources;

export const metricsReducers = metricSlice.reducer;

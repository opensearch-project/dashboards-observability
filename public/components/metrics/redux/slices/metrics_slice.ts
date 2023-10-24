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
        index: `${dataSource}.${obj.TABLE_NAME}`,
        query: undefined,
        aggregation: 'avg',
        attributesGroupBy: [],
        availableAttributes: [],
        type: 'line',
        recentlyCreated: false,
      }))
    )
  );
};

export const metricQueryFromMetaData = ({
  index,
  aggregation,
  attributesGroupBy,
}: {
  index: string;
  aggregation: string;
  attributesGroupBy: string[];
}) => {
  return `source = ${index} | stats ${aggregation}(@value) by span(@timestamp, 1d)`;
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

export const metricSlice = createSlice({
  name: REDUX_SLICE_METRICS,
  initialState,
  reducers: {
    setMetrics: (state, { payload }) => {
      state.metrics = payload;
    },
    setSortedIds: (state, { payload }) => {
      state.sortedIds = payload;
    },

    selectMetric: (state, { payload: id }) => {
      if (state.selectedIds.includes(id)) return;

      state.selectedIds.push(id);
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

    updateMetricsLayout: (state, { payload }) => {
      console.log('updateMetricsLayout', payload);
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

const { setMetrics, setSortedIds } = metricSlice.actions;

const getAvailableAttributes = async (id) => {
  const { pplService, toasts } = coreRefs;

  try {
    const columnSchema = await pplService.fetch({
      query: 'describe ' + id + ' | fields COLUMN_NAME',
      format: 'jdbc',
    });
    const columns = columnSchema.jsonData
      .map((sch) => sch.COLUMN_NAME)
      .filter((col) => col[0] !== '@');

    return columns;
  } catch (e) {
    toasts?.addDanger(`An error occurred retrieving attributes for metric ${id} `);
    console.error(`An error occurred retrieving attributes for metric ${id} `, e);
  }
};
//
// const updateLayoutBySelection = (metric: any, gridLayoutLength: number) => {
//   metric.layout = getMetricVisDimensions(gridLayoutLength);
// };

const initializeMetricQuery = async (metric) => {
  if (metric.query) return;

  Object.assign(metric, {
    query: metricQueryFromMetaData(metric.id),
    aggregation: 'avg',
    attributesGroupBy: [],
    availableAttributes: [],
  });
};

export const addSelectedMetric = ({ id }) => async (dispatch, getState) => {
  console.log('addSelectedMetric state', getState());
  const metric = { ...getState().metrics.metrics[id] };

  console.log('addSelectedMetric', metric);

  await initializeMetricQuery(metric);
  // updateLayoutBySelection(metric, getState().metrics.selected.length);
  console.log('addSelectedMetric initializedQuery', metric);
  if (metric.catalog !== OBSERVABILITY_CUSTOM_METRIC) {
    const availableAttributes = await getAvailableAttributes(metric.id);
    metric.availableAttributes = availableAttributes;
    metric.attributesGroupBy = availableAttributes;
  }
  dispatch(updateMetric(id, metric));
  dispatch(selectMetric(id));
};
export const removeSelectedMetric = ({ id }) => async (dispatch, getState) => {
  dispatch(deSelectMetric(id));
};

export const searchOrTrue = (search, metric) => {
  if (search === '') return true;
  return metric.name.match(new RegExp(search, 'i'));
};

export const availableMetricsSelector = (state) => {
  return state.metrics.sortedIds
    .filter((id) => !state.metrics.selectedIds.includes(id))
    .filter((id) => searchOrTrue(state.metrics.search, state.metrics.metrics[id]))
    .map((id) => state.metrics.metrics[id]);
};

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
  state.metrics.selectedIds.map((id) => state.metrics.metrics[id]);

export const searchSelector = (state) => state.metrics.search;

export const metricIconsSelector = (state) => state.metrics.dataSourceIcons;

export const metricsLayoutSelector = (state) => state.metrics.metricsLayout;

export const dateSpanFilterSelector = (state) => state.metrics.dateSpanFilter;

export const refreshSelector = (state) => state.metrics.refresh;

export const metricsReducers = metricSlice.reducer;

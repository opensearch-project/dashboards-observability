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
  DEFAULT_METRIC_WIDTH,
  DEFAULT_METRIC_HEIGHT,
} from '../../../../../common/constants/metrics';
import { MetricType } from '../../../../../common/types/metrics';
import { SavedObjectsActions } from '../../../../services/saved_objects/saved_object_client/saved_objects_actions';
import { ObservabilitySavedVisualization } from '../../../../services/saved_objects/saved_object_client/types';
import { getNewVizDimensions, pplServiceRequestor, sortMetricLayout } from '../../helpers/utils';
import { coreRefs } from '../../../../framework/core_refs';
import { useToast } from '../../../common/toast';

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
  selected: [],
  sortedIds: [],
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
  const metricsResultSet = await Promise.all([customDataRequest, ...remoteDataRequests]);
  const metricsResult = metricsResultSet.flat();

  const metricsMapByName = keyBy(metricsResult.flat(), 'id');
  dispatch(setMetrics(metricsMapByName));

  const sortedIds = sortBy(metricsResult, 'catalog', 'id').map((m) => m.id);
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

export const getMetricVisDimensions = (index) => ({
  x: 0,
  y: DEFAULT_METRIC_HEIGHT * index,
  w: DEFAULT_METRIC_WIDTH,
  h: DEFAULT_METRIC_HEIGHT,
});

// const updateGridItemDimensions = (curLayout, index) => {
//   const newDimensions = getMetricVisDimensions(index);

//   return {
//     ...curLayout,
//     x: newDimensions.x,
//     y: newDimensions.y,
//     h: newDimensions.h,
//     w: newDimensions.w,
//   };
// };

const defaultMetricQuery = {
  aggregation: 'avg',
  attributesGroupBy: [],
  availableAttributes: [],
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
    setSortedIds: (state, { payload }) => {
      state.sortedIds = payload;
    },

    selectMetric: (state, { payload: id }) => {
      state.selected.push(id);
    },

    deSelectMetric: (state, { payload }) => {
      state.selected = state.selected.filter((id) => id !== payload.id);
    },

    setSearch: (state, { payload }) => {
      state.search = payload;
    },

    updateMetric: (state, { payload }) => {
      const newMetricValue = payload;
      state.metrics = state.metrics.map((metric) => {
        if (metric.id === newMetricValue.id) {
          return newMetricValue;
        } else {
          return metric;
        }
      });
    },

    updateMetric: (state, { payload: metric }) => {
      state.metrics[metric.id] = metric;
    },

    setMetricSelectedAttributes: (state, { payload }) => {
      const { visualizationId, attributesGroupBy } = payload;
      const metric: MetricType = state.metricsLayout.find(
        (layout) => layout.id === visualizationId
      );
      metric.query.attributesGroupBy = attributesGroupBy;
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
  deSelectMetric,
  selectMetric,
  setSearch,
  setDataSources,
  setDataSourceTitles,
  setDataSourceIcons,
  setMetricSelectedAttributes,
} = metricSlice.actions;

// private redux actions
const { updateMetric, setMetrics, setSortedIds } = metricSlice.actions;

const getAvailableAttributes = async (metric) => {
  const { pplService } = coreRefs;
  // const { setToast } = useToast();

  if (metric.catalog === OBSERVABILITY_CUSTOM_METRIC) return;
  if (metric.query.availableAttributes.length > 0) return;

  try {
    const columnSchema = await pplService.fetch({
      query: 'describe ' + metric.id + ' | fields COLUMN_NAME',
      format: 'jdbc',
    });
    console.log('columnSchema', columnSchema);
    const columns = columnSchema.datarows.flat().filter((col) => col[0] !== '@');

    console.log('getAvailableAttributes', columns);
    return columns;
  } catch (e) {
    // setToast(`An error occurred retrieving attributes for metric ${metric.id} `, 'danger');
    console.error(`An error occurred retrieving attributes for metric ${metric.id} `, e);
  }
};

const updateLayoutBySelection = (metric: any, gridLayoutLength: number) => {
  metric.layout = getMetricVisDimensions(gridLayoutLength);
};

const initializeMetricQuery = async (metric) => {
  if (metric.query) return;
  metric.query = { ...defaultMetricQuery };
  metric.query.availableAttributes = await getAvailableAttributes(metric);
};

export const addSelectedMetric = (id) => async (dispatch, getState) => {
  const metric = { ...getState().metrics.metrics[id] };

  await initializeMetricQuery(metric);
  updateLayoutBySelection(metric, getState().metrics.selected.length);
  console.log('addSelectedMetric', metric);
  dispatch(updateMetric(metric));
  dispatch(selectMetric(id));
};

export const updateMetricQuery = (visualizationId, { aggregation, attributesGroupBy }) => (
  dispatch,
  getState
) => {
  const state = getState();
  const updatedLayout = state.metrics.metricsLayout.map((metricLayout) =>
    metricLayout.id === visualizationId
      ? {
          ...metricLayout,
          query: {
            ...metricLayout.query,
            aggregation: aggregation || metricLayout.query.aggregation,
            attributesGroupBy: attributesGroupBy || metricLayout.query.attributesGroupBy,
          },
        }
      : metricLayout
  );
  dispatch(updateMetricsLayout(updatedLayout));
};

export const searchOrTrue = (search, metric) => {
  if (search === '') return true;
  return metric.name.match(new RegExp(search, 'i'));
};

export const availableMetricsSelector = (state) => {
  console.log('availableMetricsSelector', state.metrics.search);
  return state.metrics.sortedIds
    .filter((id) => !state.metrics.selected.includes(id))
    .filter((id) => searchOrTrue(state.metrics.search, state.metrics.metrics[id]))
    .map((id) => state.metrics.metrics[id]);
};

export const selectedMetricsSelector = (state) =>
  state.metrics.selected.map((id) => state.metrics.metrics[id]);

export const searchSelector = (state) => state.metrics.search;

export const metricIconsSelector = (state) => state.metrics.dataSourceIcons;

export const metricsLayoutSelector = (state) => state.metrics.metricsLayout;

export const metricQuerySelector = (id) => (state) =>
  state.metrics.metricsLayout.find((layout) => layout.id === id)?.query || {
    aggregation: '',
    attributesGroupBy: [],
    availableAttributes: [],
  };

export const dataSourcesSelector = (state) => state.metrics.dataSources;

export const metricsReducers = metricSlice.reducer;

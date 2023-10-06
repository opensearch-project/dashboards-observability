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

export const loadMetrics = () => async (dispatch, getState) => {
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
    setSortedIds: (state, { payload }) => {
      state.sortedIds = payload;
    },

    selectMetric: (state, { payload: id }) => {
      if (state.selected.includes(id)) return;

      state.selected.push(id);
    },

    deSelectMetric: (state, { payload }) => {
      state.selected = state.selected.filter((id) => id !== payload);
    },

    moveMetric: (state, { payload: { source, destination } }) => {
      const movingId = state.selected.splice(source.index, 1);
      state.selected.splice(destination.index, 0, movingId[0]);
    },

    setSearch: (state, { payload }) => {
      state.search = payload;
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
  setMetricSelectedAttributes,
  updateMetric,
} = metricSlice.actions;

const { setMetrics, setSortedIds } = metricSlice.actions;

const getAvailableAttributes = async (id) => {
  const { pplService } = coreRefs;
  const { setToast } = useToast();

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
    // setToast(`An error occurred retrieving attributes for metric ${metric.id} `, 'danger');
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
    query: metric.id,
    aggregation: 'avg',
    attributesGroupBy: [],
    availableAttributes: [],
  });
};

export const addSelectedMetric = (id) => async (dispatch, getState) => {
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
  dispatch(updateMetric(metric));
  dispatch(selectMetric(id));
};
export const removeSelectedMetric = (id) => async (dispatch, getState) => {
  dispatch(deSelectMetric(id));
};
//
// export const updateMetric = (visualizationId, { aggregation, attributesGroupBy }) => (
//   dispatch,
//   getState
// ) => {
//   const state = getState();
//   const updatedLayout = state.metrics.metricsLayout.map((metricLayout) =>
//     metricLayout.id === visualizationId
//       ? {
//           ...metricLayout,
//           query: {
//             ...metricLayout.query,
//             aggregation: aggregation || metricLayout.query.aggregation,
//             attributesGroupBy: attributesGroupBy || metricLayout.query.attributesGroupBy,
//           },
//         }
//       : metricLayout
//   );
//   // dispatch(updateMetricsLayout(updatedLayout));
// };

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

export const metricSelector = (id) => (state) => state.metrics.metrics[id];

export const dataSourcesSelector = (state) => state.metrics.dataSources;

export const metricsReducers = metricSlice.reducer;

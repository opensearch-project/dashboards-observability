/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { sortBy } from 'lodash';
import { ouiPaletteColorBlindBehindText } from '@elastic/eui';
import {
  PPL_DATASOURCES_REQUEST,
  REDUX_SLICE_METRICS,
  SAVED_VISUALIZATION,
  OBSERVABILITY_CUSTOM_METRIC,
} from '../../../common/constants/metrics';
import { MetricType } from '../../../common/types/metrics';
import { SavedObjectsActions } from '../../services/saved_objects/saved_object_client/saved_objects_actions';
import { ObservabilitySavedVisualization } from '../../services/saved_objects/saved_object_client/types';
import { getNewVizDimensions, pplServiceRequestor, sortMetricLayout } from './helpers/utils';
import { coreRefs } from '../../framework/core_refs';

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

interface MetricState {
  metrics: MetricType[];

  selected: MetricType[];

  searched: MetricType[];

  search: string;

  metricsLayout: MetricType[];

  dataSources: string[];

  dataSourceTitles: string[];

  dataSourceIcons: { [dataSource: string]: IconAttributes };
}

const initialState: MetricState = {
  metrics: [],
  selected: [],
  searched: [],
  search: '',
  metricsLayout: [],
  dataSources: [OBSERVABILITY_CUSTOM_METRIC],
  dataSourceTitles: ['Observability Custom Metrics'],
  dataSourceIcons: coloredIconsFrom([OBSERVABILITY_CUSTOM_METRIC]),
};

// TODO: NEXT STEPS : Change all usages of metricSlice into metricStore.

// TODO : Convert this into a zustand complex-setter inside metricStore

const fetchCustomMetrics = async () => {
  const dataSet = await SavedObjectsActions.getBulk<ObservabilitySavedVisualization>({
    objectType: [SAVED_VISUALIZATION],
  });
  console.log('fetchCustomMetrics', JSON.stringify({ dataSet }, '', 2));
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

const updatedLayoutBySelection = (state: any, newMetric: any) => {
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
  return [...state.metricsLayout, metricVisualization];
};

const updatedLayoutByDeSelection = (state: any, newMetric: any) => {
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
  return newMetricsLayout;
};

const fetchDataSources = async () => {
  const { pplService } = coreRefs;
  const remoteDataSourcesResponse = await pplServiceRequestor(pplService!, PPL_DATASOURCES_REQUEST);
  console.log(
    'loadMetrics remoteDataSourcesResponse',
    JSON.stringify({ remoteDataSourcesResponse })
  );
  return remoteDataSourcesResponse.data.DATASOURCE_NAME;
};

export const useMetricStore = create<MetricState>((get, set) => ({
  ...initialState,

  selectMetric: (metric: MetricType) => {
    set((state: MetricState) => ({ selected: [...state.selected, metric.id] }));
    set((state: MetricState) => ({ metricsLayout: updatedLayoutBySelection(state, metric) }));
  },

  deSelectMetric: (metric: MetricType) => {
    set((state: MetricState) => ({
      metricsLayout: updatedLayoutByDeSelection(state, metric),
    }));
    set((state: MetricState) => ({ selected: state.selected.filter((id) => id !== metric.id) }));
  },

  setSearch: (search) => set({ search }),

  updateMetricsLayout: (metricsLayout) => {
    set((state: MetricState) => ({
      metricsLayout,
      selected: sortBy(metricsLayout, ['x', 'y']).map(({ id }) => id),
    }));
  },
}));

const setDataSources = (dataSources) =>
  useMetricStore.setState({ dataSources: [OBSERVABILITY_CUSTOM_METRIC, ...dataSources] });

const setDataSourceTitles = (dataSourceTitles) =>
  useMetricStore.setState({
    dataSourceTitles: ['Observability Custom Metrics', ...dataSourceTitles],
  });

const setDataSourceIcons = (dataSourceIcons) => useMetricStore.setState({ dataSourceIcons });

export const loadMetrics = async () => {
  console.log('loadMetrics');
  const customDataRequest = fetchCustomMetrics();

  const remoteDataSources = await fetchDataSources();
  console.log('loadMetrics remoteDataSources', JSON.stringify({ remoteDataSources }));

  setDataSources(remoteDataSources);
  setDataSourceTitles(remoteDataSources);
  setDataSourceIcons(coloredIconsFrom([OBSERVABILITY_CUSTOM_METRIC, ...remoteDataSources]));

  const remoteDataRequests = fetchRemoteMetrics(remoteDataSources);

  const dataResponses = await Promise.all([customDataRequest]);
  console.log(
    'loadMetrics',
    JSON.stringify(
      {
        customDataRequest,
        // remoteDataSources,
        // remoteDataRequests,
        dataResponses,
      },
      '',
      2
    )
  );
  setMetrics(dataResponses.flat());
};

const setMetrics = (metrics) => {
  console.log('setMetrics', { metrics });
  useMetricStore.setState((state) => {
    console.log('setMetrics', { metrics });
    return { metrics };
  });
};

export const availableMetricsSelector = (state) =>
  state.metrics
    .filter((metric) => !state.selected.includes(metric.id))
    .filter((metric) => state.search === '' || metric.name.match(new RegExp(state.search, 'i')));

export const selectedMetricsSelector = (state) =>
  state.selected.map((id) => state.metrics.find((metric) => metric.id === id));

export const searchSelector = (state) => {
  console.log('searchSelector', state);
  return state.search;
};

export const metricIconsSelector = (state) => state.dataSourceIcons;

export const metricsLayoutSelector = (state) => state.metricsLayout;

export const dataSourcesSelector = (state) => state.dataSources;

// export const metricsReducers = metricSlice.reducer;

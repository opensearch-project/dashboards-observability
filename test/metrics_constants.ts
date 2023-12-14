/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OBSERVABILITY_CUSTOM_METRIC } from '../common/constants/metrics';

export const sampleMetricsVisualizations = [
  {
    h: 2,
    id: 'Y4muP4QBiaYaSxpXk7r8',
    query: { type: 'savedCustomMetric', aggregation: 'avg', attributesGroupBy: [] },
    savedVisualizationId: 'Y4muP4QBiaYaSxpXk7r8',
    w: 12,
    x: 0,
    y: 0,
  },
  {
    h: 2,
    id: 'tomAP4QBiaYaSxpXALls',
    metricType: 'savedCustomMetric',
    savedVisualizationId: 'tomAP4QBiaYaSxpXALls',
    w: 12,
    x: 0,
    y: 2,
  },
  {
    h: 2,
    id: 'prometheus.process_resident_memory_bytes',
    query: { type: 'prometheusMetric', aggregation: 'avg', attributesGroupBy: [] },
    savedVisualizationId: 'prometheus.process_resident_memory_bytes',
    w: 12,
    x: 0,
    y: 4,
  },
];

export const sampleMetric = {
  name: 'new metric',
  description: '',
  query: 'source = opensearch_dashboards_sample_data_logs | stats count() by span(timestamp,1h)',
  type: 'line',
  selected_date_range: {
    start: 'now-1d',
    end: 'now',
    text: '',
  },
  selected_timestamp: {
    name: 'timestamp',
    type: 'timestamp',
  },
  selected_fields: {
    text: '',
    tokens: [],
  },
  userConfigs: '{}',
  subType: 'metric',
};

export const sampleAvailableDashboards = [
  {
    attributes: {
      title: '[Flights] Global Flight Dashboard',
    },
    id: '7adfa750-4c81-11e8-b3d7-01146121b73d',
    type: 'dashboard',

    title: '[Flights] Global Flight Dashboard',
  },
  {
    id: 'fdf2bb60-7a5b-11ee-929a-5f1a2dc08039',
    type: 'observability-panel',
    objectId: 'observability-panel:fdf2bb60-7a5b-11ee-929a-5f1a2dc08039',
    name: '[Logs] Web traffic Panel',
    title: '[Logs] Web traffic Panel',
    savedObject: true,
  },
];

export const sampleMetricsToExport: MetricType[] = [
  {
    id: 'my_prometheus.go_memstats_alloc_bytes',
    name: 'my_prometheus.go_memstats_alloc_bytes',
    catalog: 'my_prometheus',
    catalogSourceName: 'my_prometheus',
    catalogTableName: 'go_memstats_alloc_bytes',
    index: 'my_prometheus.go_memstats_alloc_bytes',
    aggregation: 'avg',
    attributesGroupBy: [],
    availableAttributes: [],
    type: 'line',
    sub_type: 'promqlmetric',
    recentlyCreated: false,
  },
  {
    id: 'observability-visualization:84c73aa0-84aa-11ee-96e0-7bfa0b41d0fc',
    savedVisualizationId: 'observability-visualization:84c73aa0-84aa-11ee-96e0-7bfa0b41d0fc',
    query:
      "source = my_prometheus.query_range('sum by(instance,job) (go_memstats_alloc_bytes_total)', 1700071440, 1700157840, '1h')",
    name: 'my_prometheus.go_memstats_alloc_bytes_total',
    catalog: 'CUSTOM_METRICS',
    type: 'line',
    recentlyCreated: false,
  },
];

export const sampleSortedMetricsLayout = [
  {
    h: 2,
    id: 'Y4muP4QBiaYaSxpXk7r8',
    query: { type: 'savedCustomMetric', aggregation: 'avg', attributesGroupBy: [] },
    savedVisualizationId: 'Y4muP4QBiaYaSxpXk7r8',
    w: 12,
    x: 0,
    y: 0,
  },
  {
    h: 2,
    id: 'prometheus.process_resident_memory_bytes',
    query: { type: 'prometheusMetric', aggregation: 'avg', attributesGroupBy: [] },
    savedVisualizationId: 'prometheus.process_resident_memory_bytes',
    w: 12,
    x: 0,
    y: 2,
  },
];

export const samplePanelOptions = [
  {
    dateCreated: 1667512665139,
    dateModified: 1667513726084,
    id: 'xImAP4QBiaYaSxpXBLkz',
    name: '[Logs] Web traffic Panel',
  },
  {
    dateCreated: 1667512677437,
    dateModified: 1667525552909,
    id: 'zYmAP4QBiaYaSxpXNLk9',
    name: 'panel1',
  },
];

export const sampleVisualizationById = {
  id: 'Y4muP4QBiaYaSxpXk7r8',
  name: 'new metric',
  query: 'source = opensearch_dashboards_sample_data_logs | stats count() by span(timestamp,1h)',
  type: 'line',
  timeField: 'timestamp',
  selected_date_range: {},
  selected_fields: {},
  userConfigs: {},
  subType: 'metric',
};

export const sampleAllAvailableMetrics = [
  {
    id: 'HIlAQYQBiaYaSxpXJ73K',
    name: '[Prometheus Metric] prometheus.process_resident_memory_bytes',
    catalog: 'CUSTOM_METRICS',
    type: 'line',
    recentlyCreated: true,
  },
  {
    id: 'Y4muP4QBiaYaSxpXk7r8',
    name: 'new metric',
    catalog: 'CUSTOM_METRICS',
    type: 'line',
    recentlyCreated: false,
  },
  {
    id: 'HolAQYQBiaYaSxpXKL0T',
    name: '[Prometheus Metric] prometheus.go_memstats_heap_sys_bytes',
    catalog: 'CUSTOM_METRICS',
    type: 'line',
    recentlyCreated: true,
  },
  {
    id: 'tomAP4QBiaYaSxpXALls',
    name: '[Logs] Average ram usage per day by windows os ',
    catalog: 'CUSTOM_METRICS',
    type: 'line',
    recentlyCreated: false,
  },
  {
    id: 'prometheus.process_resident_memory_bytes',
    name: 'prometheus.process_resident_memory_bytes',
    catalog: 'prometheus',
    type: 'gauge',
    recentlyCreated: false,
  },
];

export const samplePanelVisualizations1 = [
  {
    id: 'Y4muP4QBiaYaSxpXk7r8',
    savedVisualizationId: 'Y4muP4QBiaYaSxpXk7r8',
    x: 0,
    y: 0,
    h: 2,
    w: 12,
    metricType: 'savedCustomMetric',
  },
];

export const samplenewDimensions1 = {
  x: 0,
  y: 2,
  w: 12,
  h: 3,
};

export const samplePanelVisualizations2 = [
  {
    id: 'Y4muP4QBiaYaSxpXk7r8',
    savedVisualizationId: 'Y4muP4QBiaYaSxpXk7r8',
    x: 0,
    y: 0,
    h: 2,
    w: 12,
    query: { type: 'savedCustomMetric', aggregation: 'avg', attributesGroupBy: [] },
  },
  {
    id: 'tomAP4QBiaYaSxpXALls',
    savedVisualizationId: 'tomAP4QBiaYaSxpXALls',
    x: 0,
    y: 2,
    h: 2,
    w: 12,
    query: { type: 'savedCustomMetric', aggregation: 'avg', attributesGroupBy: [] },
  },
];

export const samplenewDimensions2 = {
  x: 0,
  y: 4,
  w: 12,
  h: 3,
};

export const samplePrometheusVisualizationId = 'prometheus.process_resident_memory_bytes';

export const samplePrometheusVisualizationComponent = {
  name: '[Prometheus Metric] prometheus.process_resident_memory_bytes',
  description: '',
  query:
    'source = prometheus.process_resident_memory_bytes | stats avg(@value) by span(@timestamp,1h)',
  type: 'line',
  timeField: '@timestamp',
  selected_fields: {
    text: '',
    tokens: [],
  },
  subType: 'metric',
  userConfigs: {},
};

export const sampleVisualizationsList = [
  {
    id: 'panel_viz_ed409e13-4759-4e0f-9bc1-6ae32999318e',
    savedVisualizationId: 'savedCustomMetric',
    x: 0,
    y: 0,
    w: 6,
    h: 4,
  },
  {
    id: 'panel_viz_f59ad102-943e-48d9-9c0a-3df7055070a3',
    savedVisualizationId: 'prometheusMetric',
    x: 0,
    y: 4,
    w: 6,
    h: 4,
  },
];

export const sampleLayout = [
  { i: 'panel_viz_ed409e13-4759-4e0f-9bc1-6ae32999318e', x: 0, y: 0, w: 3, h: 2 },
  { i: 'panel_viz_f59ad102-943e-48d9-9c0a-3df7055070a3', x: 3, y: 0, w: 6, h: 4 },
];

export const sampleMergedVisualizations = [
  {
    id: 'panel_viz_ed409e13-4759-4e0f-9bc1-6ae32999318e',
    savedVisualizationId: 'savedCustomMetric',
    x: 0,
    y: 0,
    w: 3,
    h: 2,
  },
  {
    id: 'panel_viz_f59ad102-943e-48d9-9c0a-3df7055070a3',
    savedVisualizationId: 'prometheusMetric',
    x: 3,
    y: 0,
    w: 6,
    h: 4,
  },
];

export const samplePrometheusSampleUpdateWithSelections = {
  dateRange: ['now-1d', 'now'],
  description: '',
  fields: [],
  name: '[Prometheus Metric] prometheus.process_resident_memory_bytes',
  query:
    'source = prometheus.process_resident_memory_bytes | stats avg(@value) by span(@timestamp,1h)',
  subType: 'metric',
  timestamp: '@timestamp',
  type: 'line',
  userConfigs: {},
};

export const sampleSavedMetric = {
  id: 'tomAP4QBiaYaSxpXALls',
  name: '[Logs] Average ram usage per day by windows os ',
  query:
    "source = opensearch_dashboards_sample_data_logs | where match(machine.os,'win')  |  stats avg(machine.ram) by span(timestamp,1h)",
  aggregation: 'avg',
  attributesGroupBy: [],
  catalog: OBSERVABILITY_CUSTOM_METRIC,
  index: 'opensearch_dashboards_sample_data_logs',
  type: 'line',
  timeField: 'timestamp',
  selected_date_range: {
    start: 'now-1d',
    end: 'now',
    text: '',
  },
  selected_fields: {
    text: '',
    tokens: [],
  },
  userConfigs: {
    dataConfig: {
      series: [
        {
          label: 'machine.ram',
          name: 'machine.ram',
          aggregation: 'avg',
          customLabel: '',
        },
      ],
      dimensions: [],
      span: {
        time_field: [
          {
            name: 'timestamp',
            type: 'timestamp',
            label: 'timestamp',
          },
        ],
        unit: [
          {
            text: 'Day',
            value: 'd',
            label: 'Day',
          },
        ],
        interval: '1',
      },
    },
  },
  subType: 'metric',
};

export const sampleSavedMetricUpdate = {
  dateRange: ['now-30m', 'now'],
  description: undefined,
  fields: [],
  name: '[Logs] Average ram usage per day by windows os ',
  query:
    "source = opensearch_dashboards_sample_data_logs | where match(machine.os,'win')  |  stats avg(machine.ram) by span(timestamp,1m)",
  subType: 'metric',
  timestamp: 'timestamp',
  type: 'line',
  userConfigs: {
    dataConfig: {
      series: [
        {
          label: 'machine.ram',
          name: 'machine.ram',
          aggregation: 'avg',
          customLabel: '',
        },
      ],
      dimensions: [],
      span: {
        time_field: [{ name: 'timestamp', type: 'timestamp', label: 'timestamp' }],
        unit: [{ text: 'Day', value: 'd', label: 'Day' }],
        interval: '1',
      },
    },
  },
};

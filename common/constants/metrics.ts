/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const METRIC_EXPLORER_BASE_PATH = 'observability-metrics#/';

// requests constants
export const VISUALIZATION = 'viz';
export const SAVED_VISUALIZATION = 'savedVisualization';
export const PPL_DATASOURCES_REQUEST =
  'show datasources | where CONNECTOR_TYPE="PROMETHEUS" | fields DATASOURCE_NAME';

// redux

export const OBSERVABILITY_CUSTOM_METRIC = 'CUSTOM_METRICS';
export const REDUX_SLICE_METRICS = 'metrics';

export const resolutionOptions = [
  { value: 's', text: 'seconds' },
  { value: 'm', text: 'minutes' },
  { value: 'h', text: 'hours' },
  { value: 'd', text: 'days' },
  // { value: 'M', text: 'Months' }, // commenting it here as prometheus doesn't have support
  // { value: 'q', text: 'quarters' },
  { value: 'y', text: 'years' },
];

export const AGGREGATION_OPTIONS = [
  { value: 'avg', text: 'avg()' },
  { value: 'sum', text: 'sum()' },
  { value: 'count', text: 'count()' },
  { value: 'min', text: 'min()' },
  { value: 'max', text: 'max()' },
];

export const DATASOURCE_OPTIONS = [
  {
    label: 'Prometheus',
    'data-test-subj': 'prometheusOption',
  },
  {
    label: 'OpenTelemetry',
    'data-test-subj': 'openTelemetryOption',
  },
];
export const DATA_PREPPER_INDEX_NAME = 'ss4o-metrics-*-*';
export const METRICS_ANALYTICS_DATA_PREPPER_INDICES_ROUTE =
  '/api/observability/metrics_analytics/data_prepper_indices';

export const DOCUMENT_NAMES_QUERY = {
  size: 0,
  aggs: {
    distinct_names: {
      terms: {
        field: 'name.keyword',
        size: 500,
      },
    },
  },
};

export const FETCH_SAMPLE_DOCUMENT_QUERY = {
  size: 1,
  query: {
    bool: {
      must: [
        {
          term: {
            'name.keyword': {
              value: 'histogram',
            },
          },
        },
      ],
    },
  },
};

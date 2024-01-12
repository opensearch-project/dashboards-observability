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

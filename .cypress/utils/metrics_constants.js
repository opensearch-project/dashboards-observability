/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const delay = 100;

export const PPL_METRICS_NAMES = [
  'Average value by metric handler request in flight',
  'Average value by virtual memory bytes',
  'Average value by cpu seconds total',
  'Average value by memstats stat bytes',
  'Average value by memstats heap allocation bytes',
];

export const PPL_METRICS = [
  "source = opensearch_dashboards_sample_data_logs | where match(machine.os,'win')  |  stats avg(machine.ram) by span(timestamp,1d)",
  "source = opensearch_dashboards_sample_data_logs | where response='503' or response='404' | stats count() by span(timestamp,1d)",
  "source = opensearch_dashboards_sample_data_logs | where machine.os='osx' or  machine.os='ios' |  stats avg(machine.ram) by span(timestamp,1d)",
];

export const VIS_TYPE_LINE = 'Time Series';
/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const delay = 1000;
export const YEAR_TO_DATE_DOM_ID = '[data-test-subj="superDatePickerCommonlyUsed_Year_to date"]';

export const TEST_QUERIES = [
  {
    query: 'source = opensearch_dashboards_sample_data_flights',
    dateRangeDOM: YEAR_TO_DATE_DOM_ID,
  },
  {
    query:
      'source = opensearch_dashboards_sample_data_flights | stats avg(FlightDelayMin) by Carrier',
    dateRangeDOM: YEAR_TO_DATE_DOM_ID,
  },
  {
    query: 'source = opensearch_dashboards_sample_data_logs',
    dateRangeDOM: YEAR_TO_DATE_DOM_ID,
  },
  {
    query:
      'source=opensearch_dashboards_sample_data_flights | stats max(AvgTicketPrice) by DestCountry, DestCityName, Carrier',
    dateRangeDOM: YEAR_TO_DATE_DOM_ID,
  },
  {
    query:
      'source = opensearch_dashboards_sample_data_logs | stats count(), avg(bytes) by host, tags',
    dateRangeDOM: YEAR_TO_DATE_DOM_ID,
  },
  {
    query:
      'source=opensearch_dashboards_sample_data_flights | stats avg(FlightDelayMin) by DestCountry, DestCityName',
    dateRangeDOM: YEAR_TO_DATE_DOM_ID,
  },
  {
    query:
      "source = opensearch_dashboards_sample_data_logs | where response='503' or response='404' | stats count() by span(timestamp,1d)",
    dateRangeDOM: YEAR_TO_DATE_DOM_ID,
  },
  {
    query:
      'source=opensearch_dashboards_sample_data_flights |where FlightDelayMin > 0 | stats sum(FlightDelayMin) as total_delay_min, count() as total_delayed by Carrier |eval avg_delay=total_delay_min / total_delayed | sort - avg_delay',
    dateRangeDOM: YEAR_TO_DATE_DOM_ID,
  },
  {
    query:
      'source = opensearch_dashboards_sample_data_logs | stats count(), max(bytes) by span(timestamp,1d), clientip, host',
    dateRangeDOM: YEAR_TO_DATE_DOM_ID,
  },
];

export const aggregationValues = [
  'count',
  'sum',
  'avg',
  'max',
  'min',
  'var_samp',
  'var_pop',
  'stddev_samp',
  'stddev_pop',
];

export const TESTING_PANEL = 'Mock Testing Panels';
export const SAVE_QUERY1 = 'Mock Flight Events Overview';
export const SAVE_QUERY2 = 'Mock Flight count by destination';
export const SAVE_QUERY3 = 'Mock Flight count by destination save to panel';
export const SAVE_QUERY4 = 'Mock Flight peek';
export const HOST_TEXT_1 = "artifacts.opensearch.org";
export const HOST_TEXT_2 = "www.opensearch.org";
export const HOST_TEXT_3 = "cdn.opensearch-opensearch-opensearch.org";
export const HOST_TEXT_4 = "opensearch-opensearch-opensearch.org";
export const AGENT_TEXT_1 = "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; SV1; .NET CLR 1.1.4322)";
export const AGENT_TEXT_2 = "Mozilla/5.0 (X11; Linux i686) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.696.50 Safari/534.24";
export const AGENT_TEXT_3 = "Mozilla/5.0 (X11; Linux x86_64; rv:6.0a1) Gecko/20110421 Firefox/6.0a1";
export const BAR_LEG_TEXT_1 = `${AGENT_TEXT_1},count()`;
export const BAR_LEG_TEXT_2 = `${AGENT_TEXT_2},count()`;
export const BAR_LEG_TEXT_3 = `${AGENT_TEXT_3},count()`;
export const VIS_TYPE_PIE = 'Pie';
export const VIS_TYPE_VBAR = 'Vertical bar';
export const VIS_TYPE_HBAR = 'Horizontal bar';
export const VIS_TYPE_HEATMAP = 'Heatmap';
export const FIELD_HOST = 'host';
export const FIELD_AGENT = 'agent';

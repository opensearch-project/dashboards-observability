/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const delay = 100;

export const TEST_PANEL = 'Test Panel';
export const SAMPLE_PANEL = '[Logs] Web traffic Panel';

export const SAMPLE_VISUALIZATIONS_NAMES = [
  '[Logs] Average ram usage by operating systems',
  '[Logs] Average ram usage per day by apple os',
  '[Logs] Average ram usage per day by windows os',
  '[Logs] Daily count for error response codes',
  '[Logs] Count requests from US to CN, IN and JP',
  '[Logs] Max and average bytes by host',
  '[Logs] Count total requests by tags',
  '[Logs] Daily average bytes',
];

export const PPL_VISUALIZATIONS = [
  'source = opensearch_dashboards_sample_data_flights | stats count(Dest) by Dest',
  'source = opensearch_dashboards_sample_data_flights | stats avg(FlightDelayMin) by Carrier',
  'source = opensearch_dashboards_sample_data_flights | stats max( DistanceKilometers ) by Dest',
];

export const PPL_VISUALIZATIONS_NAMES = [
  'Flight count by destination',
  'Average flight delay minutes',
  'Max distance by destination city',
];

export const PPL_VISUALIZATION_CONFIGS = [
  '{"dataConfig":{"series":[{"customLabel":"","label":"Dest","name":"Dest","aggregation":"count"}],"dimensions":[{"label":"Dest","name":"Dest"}],"breakdowns":[]}}',
  '{"dataConfig":{"series":[{"customLabel":"","label":"FlightDelayMin","name":"FlightDelayMin","aggregation":"avg"}],"dimensions":[{"label":"Dest","name":"Dest"}],"breakdowns":[]}}',
  '{"dataConfig":{"series":[{"label":"DistanceKilometers","name":"DistanceKilometers","aggregation":"max","customLabel":""}],"dimensions":[{"label":"Dest","name":"Dest"}]}}',
];

export const NEW_VISUALIZATION_NAME = 'Flight count by destination airport';

export const PPL_FILTER = "where Carrier = 'OpenSearch-Air' | where Dest = 'Munich Airport'";

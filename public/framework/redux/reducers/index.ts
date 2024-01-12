/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { combineReducers } from 'redux';

import { queriesReducer } from '../../../components/event_analytics/redux/slices/query_slice';
import { queryResultsReducer } from '../../../components/event_analytics/redux/slices/query_result_slice';
import { queryTabReducer } from '../../../components/event_analytics/redux/slices/query_tab_slice';
import { fieldsReducer } from '../../../components/event_analytics/redux/slices/field_slice';
import { countDistributionReducer } from '../../../components/event_analytics/redux/slices/count_distribution_slice';
import { explorerVisualizationReducer } from '../../../components/event_analytics/redux/slices/visualization_slice';
import { explorerVisualizationConfigReducer } from '../../../components/event_analytics/redux/slices/viualization_config_slice';
import { patternsReducer } from '../../../components/event_analytics/redux/slices/patterns_slice';
import { metricsReducers } from '../../../components/metrics/redux/slices/metrics_slice';
import { panelReducer } from '../../../components/custom_panels/redux/panel_slice';
import { searchMetaDataSliceReducer } from '../../../components/event_analytics/redux/slices/search_meta_data_slice';

const combinedReducer = combineReducers({
  // explorer reducers
  queries: queriesReducer,
  queryResults: queryResultsReducer,
  explorerTabs: queryTabReducer,
  fields: fieldsReducer,
  countDistribution: countDistributionReducer,
  explorerVisualization: explorerVisualizationReducer,
  explorerVisualizationConfig: explorerVisualizationConfigReducer,
  patterns: patternsReducer,
  metrics: metricsReducers,
  customPanel: panelReducer,
  searchMetadata: searchMetaDataSliceReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

export const rootReducer = combinedReducer;

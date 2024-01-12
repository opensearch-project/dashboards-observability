/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createSelector, createSlice } from '@reduxjs/toolkit';
import {
  APP_ANALYTICS_TAB_ID_REGEX,
  FILTERED_PATTERN,
  FINAL_QUERY,
  INDEX,
  OLLY_QUERY_ASSISTANT,
  PATTERN_REGEX,
  PPL_DEFAULT_PATTERN_REGEX_FILETER,
  RAW_QUERY,
  REDUX_EXPL_SLICE_QUERIES,
  SELECTED_DATE_RANGE,
  SELECTED_PATTERN_FIELD,
  SELECTED_TIMESTAMP,
} from '../../../../../common/constants/explorer';
import { initialTabId } from '../../../../framework/redux/store/shared_state';
import { coreRefs } from '../../../../framework/core_refs';
import { NON_QUERY_ASSISTANT_START_TIME, QUERY_ASSISTANT_FIXED_START_TIME } from '../../../../../common/constants/shared';

const initialQueryState = {
  [RAW_QUERY]: '',
  [FINAL_QUERY]: '',
  [INDEX]: '',
  [SELECTED_PATTERN_FIELD]: '',
  [PATTERN_REGEX]: PPL_DEFAULT_PATTERN_REGEX_FILETER,
  [FILTERED_PATTERN]: '',
  [SELECTED_TIMESTAMP]: '',
  [SELECTED_DATE_RANGE]: [coreRefs.queryAssistEnabled ? QUERY_ASSISTANT_FIXED_START_TIME : NON_QUERY_ASSISTANT_START_TIME, 'now'],
  [OLLY_QUERY_ASSISTANT]: '',
};

const appBaseQueryState = {
  [RAW_QUERY]: '',
  [FINAL_QUERY]: '',
  [INDEX]: '',
  [SELECTED_PATTERN_FIELD]: '',
  [PATTERN_REGEX]: PPL_DEFAULT_PATTERN_REGEX_FILETER,
  [FILTERED_PATTERN]: '',
  [SELECTED_TIMESTAMP]: '',
  [SELECTED_DATE_RANGE]: ['now-24h', 'now'],
};

const initialState = {
  [initialTabId]: {
    ...initialQueryState,
  },
};

export const queriesSlice = createSlice({
  name: REDUX_EXPL_SLICE_QUERIES,
  initialState,
  reducers: {
    changeQuery: (state, { payload }) => {
      state[payload.tabId] = {
        ...state[payload.tabId],
        ...payload.query,
      };
    },
    changeData: (state, { payload }) => {
      state[payload.tabId] = {
        ...state[payload.tabId],
        ...payload.data,
      };
    },
    init: (state, { payload }) => {
      state[payload.tabId] = payload.tabId.match(APP_ANALYTICS_TAB_ID_REGEX)
        ? appBaseQueryState
        : initialQueryState;
    },
    remove: (state, { payload }) => {
      delete state[payload.tabId];
    },
    reset: (state, { payload }) => {
      state[payload.tabId] = {
        ...initialQueryState,
      };
    },
  },
  extraReducers: (builder) => {},
});

export const { changeQuery, changeData, remove, init, reset } = queriesSlice.actions;

export const selectQueries = createSelector(
  (state) => state.queries,
  (queryState) => queryState
);

export const queriesReducer = queriesSlice.reducer;

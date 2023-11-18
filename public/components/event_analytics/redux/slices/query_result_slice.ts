/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createSelector, createSlice } from '@reduxjs/toolkit';
import { REDUX_EXPL_SLICE_QUERY_RESULT } from '../../../../../common/constants/explorer';
import { initialTabId } from '../../../../framework/redux/store/shared_state';
import {
  fetchFailure as fetchFailureReducer,
  fetchSuccess as fetchSuccessReducer,
} from '../reducers';

const initialState = {
  [initialTabId]: {},
};

export const queryResultSlice = createSlice({
  name: REDUX_EXPL_SLICE_QUERY_RESULT,
  initialState,
  reducers: {
    fetchSuccess: fetchSuccessReducer,
    fetchFailure: fetchFailureReducer,
    reset: (state, { payload }) => {
      state[payload.tabId] = {};
    },
    init: (state, { payload }) => {
      state[payload.tabId] = {};
    },
    remove: (state, { payload }) => {
      delete state[payload.tabId];
    },
  },
});

export const { fetchSuccess, fetchFailure, remove, reset, init } = queryResultSlice.actions;

export const selectQueryResult = createSelector(
  (state) => state.queryResults,
  (queryResultState) => queryResultState
);

export const queryResultsReducer = queryResultSlice.reducer;

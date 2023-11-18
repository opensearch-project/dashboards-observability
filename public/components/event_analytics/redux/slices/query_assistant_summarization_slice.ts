/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createSelector, createSlice } from '@reduxjs/toolkit';
import { initialTabId } from '../../../../framework/redux/store/shared_state';

const initialState = {
  [initialTabId]: {
    responseForSummaryStatus: 'false' as 'false' | 'success' | 'failure',
  },
};

export const summarizationSlice = createSlice({
  name: 'queryAssistantSummarization',
  initialState,
  reducers: {
    setResponseForSummaryStatus: (state, { payload }) => {
      state[payload.tabId] = {
        ...state[payload.tabId],
        responseForSummaryStatus: payload.responseForSummaryStatus,
      };
    },
    changeSummary: (state, { payload }) => {
      state[payload.tabId] = {
        ...state[payload.tabId],
        ...payload.data,
      };
    },
    resetSummary: (state, { payload }) => {
      state[payload.tabId] = {
        responseForSummaryStatus: initialState[initialTabId].responseForSummaryStatus,
      };
    },
  },
});

export const {
  setResponseForSummaryStatus,
  changeSummary,
  resetSummary,
} = summarizationSlice.actions;

export const selectQueryAssistantSummarization = createSelector(
  (state) => state.queryAssistantSummarization,
  (summarizationState) => summarizationState
);

export const summarizationReducer = summarizationSlice.reducer;

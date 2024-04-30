/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createSelector, createSlice } from '@reduxjs/toolkit';
import { initialTabId } from '../../../../framework/redux/store/shared_state';

const initialState = {
  [initialTabId]: {
    loading: false,
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
        loading: false,
        responseForSummaryStatus: initialState[initialTabId].responseForSummaryStatus,
      };
    },
    setLoading: (state, { payload }) => {
      state[payload.tabId] = {
        ...state[payload.tabId],
        loading: payload.loading,
      };
    },
  },
});

export const {
  setResponseForSummaryStatus,
  changeSummary,
  resetSummary,
  setLoading,
} = summarizationSlice.actions;

export const selectQueryAssistantSummarization = createSelector(
  (state) => state.queryAssistantSummarization,
  (summarizationState) => summarizationState
);

export const summarizationReducer = summarizationSlice.reducer;

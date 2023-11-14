/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createSlice, createSelector } from '@reduxjs/toolkit';
import { initialTabId } from '../../../../framework/redux/store/shared_state';

const initialState = {
  [initialTabId]: {},
};

export const summarizationSlice = createSlice({
  name: "queryAssistantSummarization",
  initialState,
  reducers: {
    changeSummary: (state, { payload }) => {
      state[payload.tabId] = {
        ...state[payload.tabId],
        ...payload.data,
      };
    },
    reset: (state, { payload }) => {
      state[payload.tabId] = {};
    },
  },
});

export const { changeSummary, reset } = summarizationSlice.actions;

export const selectQueryAssistantSummarization = createSelector(
  (state) => state.queryAssistantSummarization,
  (summarizationState) => summarizationState
);

export const summarizationReducer = summarizationSlice.reducer;

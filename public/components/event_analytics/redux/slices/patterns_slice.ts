/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createSlice, createSelector } from '@reduxjs/toolkit';
import { fetchSuccess as fetchSuccessReducer } from '../reducers';
import { initialTabId } from '../../../../framework/redux/store/shared_state';
import { REDUX_EXPL_SLICE_PATTERNS } from '../../../../../common/constants/explorer';

const initialState = {
  [initialTabId]: {},
};

export const patternsSlice = createSlice({
  name: REDUX_EXPL_SLICE_PATTERNS,
  initialState,
  reducers: {
    setPatterns: fetchSuccessReducer,
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

export const { setPatterns, remove, reset, init } = patternsSlice.actions;

export const selectPatterns = createSelector(
  (state) => state.patterns,
  (patternState) => patternState
);

export const patternsReducer = patternsSlice.reducer;

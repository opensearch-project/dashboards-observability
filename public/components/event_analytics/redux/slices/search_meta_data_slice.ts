/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createSlice, createSelector } from '@reduxjs/toolkit';
// import { fetchSuccess as fetchSuccessReducer } from '../reducers';
import { initialTabId } from '../../../../framework/redux/store/shared_state';
import { REDUX_EXPL_SLICE_SEARCH_META_DATA } from '../../../../../common/constants/explorer';

const initialState = {
  [initialTabId]: {
    lang: 'sql',
    datasource: [],
  },
};

export const searchMetaDataSlice = createSlice({
  name: REDUX_EXPL_SLICE_SEARCH_META_DATA,
  initialState,
  reducers: {
    update: (state, { payload }) => {
      state[payload.tabId] = {
        ...state[payload.tabId],
        ...payload.metadata,
      };
    },
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

export const { update, remove, init } = searchMetaDataSlice.actions;

export const selectQueryResult = createSelector(
  (state) => state.queryResults,
  (queryResultState) => queryResultState
);

export const searchMetaDataSliceReducer = searchMetaDataSlice.reducer;

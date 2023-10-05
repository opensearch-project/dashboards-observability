/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createSlice, createSelector } from '@reduxjs/toolkit';
import { initialTabId } from '../../../../framework/redux/store/shared_state';
import { REDUX_EXPL_SLICE_SEARCH_META_DATA } from '../../../../../common/constants/explorer';

const initialState = {
  [initialTabId]: {
    lang: 'PPL',
    datasources: [],
    isPolling: false,
  },
};

export const searchMetaDataSlice = createSlice({
  name: REDUX_EXPL_SLICE_SEARCH_META_DATA,
  initialState,
  reducers: {
    update: (state, { payload }) => {
      state[payload.tabId] = {
        ...state[payload.tabId],
        ...payload.data,
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

export const selectSearchMetaData = createSelector(
  (state) => state.searchMetadata,
  (searchMetadata) => searchMetadata
);

export const searchMetaDataSliceReducer = searchMetaDataSlice.reducer;

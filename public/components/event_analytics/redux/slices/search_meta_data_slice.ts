/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createSelector, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  DEFAULT_DATA_SOURCE_NAME,
  DEFAULT_DATA_SOURCE_TYPE,
} from '../../../../../common/constants/data_sources';
import { REDUX_EXPL_SLICE_SEARCH_META_DATA } from '../../../../../common/constants/explorer';
import { DirectQueryLoadingStatus, SelectedDataSource } from '../../../../../common/types/explorer';
import { initialTabId } from '../../../../framework/redux/store/shared_state';

const searchMetaInitialState = {
  lang: 'PPL',
  datasources: [
    {
      label: DEFAULT_DATA_SOURCE_NAME,
      value: DEFAULT_DATA_SOURCE_NAME,
      type: DEFAULT_DATA_SOURCE_TYPE,
      name: DEFAULT_DATA_SOURCE_NAME,
    },
  ],
  queryId: '',
  isPolling: false,
};

const initialState = {
  [initialTabId]: {
    ...searchMetaInitialState,
  } as SearchMetaData,
};

interface SearchMetaData {
  lang: string;
  datasources: SelectedDataSource[];
  isPolling: boolean;
  queryId: string;
  status: DirectQueryLoadingStatus;
}

interface SearchMetaDataState {
  [key: string]: SearchMetaData;
}

interface UpdatePayload {
  tabId: string;
  data: Partial<SearchMetaData>;
}

export const searchMetaDataSlice = createSlice({
  name: REDUX_EXPL_SLICE_SEARCH_META_DATA,
  initialState,
  reducers: {
    update: (state, action: PayloadAction<UpdatePayload>) => {
      const { tabId, data } = action.payload;
      state[tabId] = {
        ...state[tabId],
        ...data,
      };
    },
    reset: (state, action: PayloadAction<{ tabId: string }>) => {
      const { tabId } = action.payload;
      state[tabId] = { ...searchMetaInitialState };
    },
    init: (state, action: PayloadAction<{ tabId: string }>) => {
      const { tabId } = action.payload;
      state[tabId] = { ...searchMetaInitialState };
    },
    remove: (state, action: PayloadAction<{ tabId: string }>) => {
      const { tabId } = action.payload;
      delete state[tabId];
    },
  },
});

export const { update, remove, init } = searchMetaDataSlice.actions;

export const selectSearchMetaData = createSelector(
  (state) => state.searchMetadata,
  (searchMetadata) => searchMetadata
);

export const searchMetaDataSliceReducer = searchMetaDataSlice.reducer;

export type { SearchMetaData, SearchMetaDataState, UpdatePayload };

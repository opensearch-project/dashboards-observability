/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createSlice, createSelector } from '@reduxjs/toolkit';
import { initialTabId } from '../../../../framework/redux/store/shared_state';
import { REDUX_EXPL_SLICE_COUNT_DISTRIBUTION } from '../../../../../common/constants/explorer';

const initialState = {
  [initialTabId]: {},
};

export const countDistributionSlice = createSlice({
  name: REDUX_EXPL_SLICE_COUNT_DISTRIBUTION,
  initialState,
  reducers: {
    render: (state, { payload }) => {
      state[payload.tabId] = {
        ...state[payload.tabId],
        ...payload.data,
      };
    },
    reset: (state, { payload }) => {
      state[payload.tabId] = {};
    },
  },
  extraReducers: (builder) => {},
});

export const { render, reset } = countDistributionSlice.actions;

export const selectCountDistribution = createSelector(
  (state) => state.countDistribution,
  (countDisState) => countDisState
);

export const countDistributionReducer = countDistributionSlice.reducer;

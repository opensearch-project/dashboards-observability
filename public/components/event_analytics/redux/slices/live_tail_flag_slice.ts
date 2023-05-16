/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createSlice, createSelector } from '@reduxjs/toolkit';
import { initialTabId } from '../../../../framework/redux/store/shared_state';
import { REDUX_EXPL_SLICE_PATTERNS, LIVE_TAIL_FLAG } from '../../../../../common/constants/explorer';

const initialState = {
  [initialTabId]: {
    [LIVE_TAIL_FLAG]: '',
  },
};

export const liveTailFlagSlice = createSlice({
  name: REDUX_EXPL_SLICE_PATTERNS,
  initialState,
  reducers: {
    init: (state, { payload }) => {
      state[payload.data] = {};
    },
    liveTailFlag: (state, { payload }) => {
        state[payload.data] = payload.data;
      },
  },
});

export const { init, liveTailFlag } = liveTailFlagSlice.actions;

export const selectliveTailFlag = createSelector(
  (state) => state.liveTailFlag,
  (liveTailState) => liveTailState
);

export const liveTailFlagReducer = liveTailFlagSlice.reducer;

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createSlice, createSelector } from '@reduxjs/toolkit';
import { initialTabId } from '../../../../framework/redux/store/shared_state';
import { REDUX_EXPL_SLICE_LIVE_TAIL, LIVE_TAIL_FLAG } from '../../../../../common/constants/explorer';

const initialState = {
  liveTailFlag: false,
};

export const liveTailFlagSlice = createSlice({
  name: REDUX_EXPL_SLICE_LIVE_TAIL,
  initialState,
  reducers: {
    // init: (state, { payload }) => {
    //   state[LIVE_TAIL_FLAG] = false;
    // },
    liveTailFlag: (state, { payload }) => {
        state.liveTailFlag = payload.liveTailFlag;
      },
  },
  extraReducers: (builder) => {},
});

export const { liveTailFlag } = liveTailFlagSlice.actions;

export const selectliveTailFlag = createSelector(
  (state) => state.liveTailFlag,
  (liveTailState) => liveTailState
);

export const liveTailFlagReducer = liveTailFlagSlice.reducer;

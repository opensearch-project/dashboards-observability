/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createSlice, createSelector } from '@reduxjs/toolkit';
import { concat, from, of } from 'rxjs';
import { map, mergeMap, tap, toArray } from 'rxjs/operators';
import {
  CURRENT_NOTEBOOK,
  HTTP_SERVICE,
  NOTEBOOKS_LIST,
  REDUX_NOTEBOOKS_SLICE,
} from '../constants';
import { NotebookType } from '../../components/main';
import { NOTEBOOKS_API_PREFIX } from '../../../../../common/constants/notebooks';

const initialState = {
  [NOTEBOOKS_LIST]: [],
  [CURRENT_NOTEBOOK]: {},
};

export const notebookSlice = createSlice({
  name: REDUX_NOTEBOOKS_SLICE,
  initialState,
  reducers: {
    setNotebooks: (state, { payload }) => {
      state[NOTEBOOKS_LIST] = payload;
    },

    setHttp: (state, { payload }) => {
      state[HTTP_SERVICE] = payload.http;
    },
  },
});

// Redux Thunk Actions

const fetchNotebooks = () => {
  return async (dispatch, getState) => {
    const http = getState().http;
    const notebooks = await http.get(`${NOTEBOOKS_API_PREFIX}/`).catch((err) => {
      return { err, message: 'Issue in fetching the notebooks' };
      // console.error('Issue in fetching the notebooks', err.body.message);
    });
    dispatch(setNotebooks());
  };
};

// Private Utility Functions

const { setNotebooks } = notebookSlice.actions;

const fetchObservabilityNotebooks$ = () =>
  of(this.props.http.get(`${NOTEBOOKS_API_PREFIX}/`)).pipe(
    mergeMap((res) => res),
    mergeMap((res) => res.data),
    map((note) => ({ ...note, isSavedObject: false }))
    // tap((res) => console.log('observability notebooks', res))
  );

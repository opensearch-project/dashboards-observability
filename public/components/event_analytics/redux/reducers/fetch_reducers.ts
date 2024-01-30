/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const fetchSuccess = (state, { payload }) => {
  state[payload.tabId] = payload.data;
};

export const fetchFailure = (state, { payload }) => {
  state[payload.tabId] = { error: payload.error };
};

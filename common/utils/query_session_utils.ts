/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ASYNC_QUERY_SESSION_ID } from '../constants/shared';

export const setAsyncSessionId = (value: string | null) => {
  if (value !== null) {
    sessionStorage.setItem(ASYNC_QUERY_SESSION_ID, value);
  }
};

export const getAsyncSessionId = () => {
  return sessionStorage.getItem(ASYNC_QUERY_SESSION_ID);
};

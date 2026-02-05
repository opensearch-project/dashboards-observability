/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { NoResults } from '../explorer/no_results';
import { initialTabId } from '../../../framework/redux/store/shared_state';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../../framework/redux/reducers';
import thunk from 'redux-thunk';

describe('No result component', () => {
  it('Renders No result component', async () => {
    const store = createStore(rootReducer, applyMiddleware(thunk));

    render(
      <Provider store={store}>
        <NoResults tabId={initialTabId} />
      </Provider>
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

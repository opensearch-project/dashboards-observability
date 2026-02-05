/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { SearchBar } from '../search_bar';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import { rootReducer } from '../../../../framework/redux/reducers';

describe('Search Bar Component', () => {
  const store = createStore(rootReducer, applyMiddleware(thunk));

  it('Search Side Bar Component with no available metrics', async () => {
    const setSearch = jest.fn();

    render(
      <Provider store={store}>
        <SearchBar setSearch={setSearch} />
      </Provider>
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('Search Side Bar Component with available metrics', async () => {
    const setSearch = jest.fn();

    render(
      <Provider store={store}>
        <SearchBar setSearch={setSearch} />
      </Provider>
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

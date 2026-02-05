/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { createStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../../../framework/redux/reducers';
import { Provider } from 'react-redux';
import { TopMenu } from '../top_menu';

describe('Metrics Top Menu Component', () => {
  const store = createStore(rootReducer);

  it('renders Top Menu Component when enabled', async () => {
    render(
      <Provider store={store}>
        <TopMenu />
      </Provider>
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

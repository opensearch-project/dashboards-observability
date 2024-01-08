/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Provider } from 'react-redux';
import { AssistantSetup } from '../types';
import { store } from '../framework/redux/store';
import { DataGridContainer } from './components/data_grid_container';

export const registerAsssitantDependencies = (setup?: AssistantSetup) => {
  if (!setup) return;

  setup.registerContentRenderer('ppl_data_grid', (content, renderProps) => {
    const params = content as string;
    return (
      <Provider store={store}>
        <DataGridContainer rawQuery={params} renderProps={renderProps} />
      </Provider>
    );
  });
};

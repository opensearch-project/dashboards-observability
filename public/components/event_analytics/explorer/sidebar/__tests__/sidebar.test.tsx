/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configureStore } from '@reduxjs/toolkit';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { Provider, useDispatch } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import {
  AVAILABLE_FIELDS,
  QUERIED_FIELDS,
  SELECTED_FIELDS,
  UNSELECTED_FIELDS,
} from '../../../../../../common/constants/explorer';
import { initialTabId } from '../../../../../../public/framework/redux/store/shared_state';
import {
  AVAILABLE_FIELDS as SIDEBAR_AVAILABLE_FIELDS,
  JSON_DATA,
  JSON_DATA_ALL,
  QUERY_FIELDS,
} from '../../../../../../test/event_analytics_constants';
import { rootReducer } from '../../../../../framework/redux/reducers';
import { Sidebar } from '../sidebar';

jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useDispatch: jest.fn(),
}));

describe('Siderbar component', () => {
  const store = configureStore({
    reducer: jest.fn(),
  });
  beforeEach(() => {
    useDispatch.mockClear();
    useDispatch.mockReturnValue(jest.fn());
  });

  it('Renders empty sidebar component', async () => {
    const explorerFields = {
      [SELECTED_FIELDS]: [],
      [AVAILABLE_FIELDS]: [],
      [UNSELECTED_FIELDS]: [],
      [QUERIED_FIELDS]: [],
    };
    const handleOverrideTimestamp = jest.fn();
    const selectedTimestamp = 'timestamp';
    const explorerData = {};

    render(
      <Provider store={store}>
        <Sidebar
          explorerFields={explorerFields}
          explorerData={explorerData}
          selectedTimestamp={selectedTimestamp}
          handleOverrideTimestamp={handleOverrideTimestamp}
          isFieldToggleButtonDisabled={false}
          isOverridingTimestamp={false}
          query={''}
          selectedPattern={''}
          isOverridingPattern={false}
          handleOverridePattern={function (): void {
            throw new Error('Function not implemented.');
          }}
          tabId={initialTabId}
        />
      </Provider>
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('Renders sidebar component', async () => {
    const explorerFields = {
      [SELECTED_FIELDS]: [],
      [UNSELECTED_FIELDS]: [],
      [AVAILABLE_FIELDS]: SIDEBAR_AVAILABLE_FIELDS,
      [QUERIED_FIELDS]: QUERY_FIELDS,
    };
    const handleOverrideTimestamp = jest.fn();
    const selectedTimestamp = 'timestamp';
    const explorerData = {
      jsonData: JSON_DATA,
      jsonDataAll: JSON_DATA_ALL,
    };
    const astore = createStore(rootReducer, applyMiddleware(thunk));

    render(
      <Provider store={astore}>
        <Sidebar
          explorerFields={explorerFields}
          explorerData={explorerData}
          selectedTimestamp={selectedTimestamp}
          handleOverrideTimestamp={handleOverrideTimestamp}
          isFieldToggleButtonDisabled={false}
          isOverridingTimestamp={false}
          tabId={initialTabId}
          query={''}
          selectedPattern={''}
          isOverridingPattern={false}
          handleOverridePattern={function (): void {
            throw new Error('Function not implemented.');
          }}
        />
      </Provider>
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import { useDispatch, Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { waitFor } from '@testing-library/react';
import { Sidebar } from '../sidebar';
import {
  SELECTED_FIELDS,
  AVAILABLE_FIELDS,
  UNSELECTED_FIELDS,
  QUERIED_FIELDS,
} from '../../../../../../common/constants/explorer';
import {
  AVAILABLE_FIELDS as SIDEBAR_AVAILABLE_FIELDS,
  QUERY_FIELDS,
  JSON_DATA,
  JSON_DATA_ALL,
} from '../../../../../../test/event_analytics_constants';

jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useDispatch: jest.fn(),
}));

describe('Siderbar component', () => {
  configure({ adapter: new Adapter() });
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

    const wrapper = mount(
      <Provider store={store}>
        <Sidebar
          explorerFields={explorerFields}
          explorerData={explorerData}
          selectedTimestamp={selectedTimestamp}
          handleOverrideTimestamp={handleOverrideTimestamp}
          isFieldToggleButtonDisabled={false}
          isOverridingTimestamp={false}
        />
      </Provider>
    );

    wrapper.update();

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
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

    const wrapper = mount(
      <Provider store={store}>
        <Sidebar
          explorerFields={explorerFields}
          explorerData={explorerData}
          selectedTimestamp={selectedTimestamp}
          handleOverrideTimestamp={handleOverrideTimestamp}
          isFieldToggleButtonDisabled={false}
          isOverridingTimestamp={false}
          storedExplorerFields={explorerFields}
        />
      </Provider>
    );

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});

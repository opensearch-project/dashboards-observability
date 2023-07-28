/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { waitFor } from '@testing-library/react';
import httpClientMock from '../../../../../test/__mocks__/httpClientMock';
import PPLService from '../../../../services/requests/ppl';
import { applyMiddleware, createStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../../../framework/redux/reducers';
import { Provider } from 'react-redux';
import { Sidebar } from '../sidebar';
import thunk from 'redux-thunk';
import { coreRefs } from '../../../../framework/core_refs';
import { sampleSavedMetric } from '../../../../../test/metrics_contants';
import { SavedObjectsActions } from '../../../../services/saved_objects/saved_object_client/saved_objects_actions';

describe('Side Bar Component', () => {
  configure({ adapter: new Adapter() });
  const store = createStore(rootReducer, applyMiddleware(thunk));

  it('renders Side Bar Component', async () => {
    SavedObjectsActions.getBulk = jest
      .fn()
      .mockResolvedValue({ observabilityObjectList: [{ savedVisualization: sampleSavedMetric }] });

    httpClientMock.get = jest.fn();

    coreRefs.pplService = new PPLService(httpClientMock);
    coreRefs.pplService.fetch = jest.fn(() =>
      Promise.resolve({
        data: { DATA_SOURCES: ['datasource1', 'datasource2'] },
        then: () => Promise.resolve(),
      })
    );

    const wrapper = mount(
      <Provider store={store}>
        <Sidebar />
      </Provider>
    );

    wrapper.update();

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});

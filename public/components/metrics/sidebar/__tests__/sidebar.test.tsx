/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { applyMiddleware, createStore } from '@reduxjs/toolkit';
import { waitFor } from '@testing-library/react';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import toJson from 'enzyme-to-json';
import React from 'react';
import { Provider } from 'react-redux';
import thunk from 'redux-thunk';
import httpClientMock from '../../../../../test/__mocks__/httpClientMock';
import { sampleSavedMetric } from '../../../../../test/metrics_contants';
import { coreRefs } from '../../../../framework/core_refs';
import { rootReducer } from '../../../../framework/redux/reducers';
import PPLService from '../../../../services/requests/ppl';
import { SavedObjectsActions } from '../../../../services/saved_objects/saved_object_client/saved_objects_actions';
import { Sidebar } from '../sidebar';

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
      expect(
        toJson(wrapper, {
          mode: 'deep',
        })
      ).toMatchSnapshot();
    });
  });
});

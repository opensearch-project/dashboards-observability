/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReactWrapper, configure, mount } from 'enzyme';
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
import { act } from 'react-dom/test-utils';

describe('Side Bar Component', () => {
  configure({ adapter: new Adapter() });
  const store = createStore(rootReducer, applyMiddleware(thunk));

  it('renders Side Bar Component', async () => {
    let objectListResolver;
    SavedObjectsActions.getBulk = () =>
      new Promise((_resolve) => {
        console.log('savedObject resolver set');
        objectListResolver = _resolve;
      });

    httpClientMock.get = jest.fn();

    coreRefs.pplService = new PPLService(httpClientMock);
    coreRefs.pplService.fetch = jest.fn(() =>
      Promise.resolve({
        data: { DATA_SOURCES: ['datasource1', 'datasource2'] },
        then: () => Promise.resolve(),
      })
    );

    let wrapper: ReactWrapper;
    act(() => {
      wrapper = mount(
        <Provider store={store}>
          <Sidebar />
        </Provider>
      );
    });

    expect(wrapper.text()).toContain('Available Metrics 0 of 0');

    await act(async () => {
      console.log('calling resolver');
      objectListResolver({ observabilityObjectList: [sampleSavedMetric] });
    });

    await waitFor(() => {
      wrapper.update();
      expect(wrapper.text()).toContain('Available Metrics 1 of 1');
    });

    expect(wrapper).toMatchSnapshot();
  });

  it.skip('renders Side Bar Component for Saved Metric', async () => {
    let objectListResolver;
    SavedObjectsActions.getBulk = () =>
      new Promise((_resolve) => {
        objectListResolver = _resolve;
      });

    httpClientMock.get = jest.fn();

    coreRefs.pplService = new PPLService(httpClientMock);
    coreRefs.pplService.fetch = jest.fn(() => {
      console.log('mock pplService fetch');
      return new Promise((resolve) => {
        resolve({
          data: { DATA_SOURCES: ['datasource1', 'datasource2'] },
          then: () => Promise.resolve(),
        });
      });
    });

    const el = document.createElement('div');
    act(() => {
      ReactDOM.render(<Sidebar />, el);
    });
    expect(el.innerHTML).toContain('Available Metrics 0 of 0');
    await act(async () => {
      objectListResolver({ observabilityObjectList: [sampleSavedMetric] });
    });
    expect(el.innerHTML).toContain('Available Metrics 1 of 1');
    expect(el).toMatchSnapshot();
  });
});

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
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom';

const flushPromises = () => new Promise(process.nextTick);

describe('Side Bar Component', () => {
  configure({ adapter: new Adapter() });

  it('renders Side Bar Component for Saved Metric', async () => {
    jest.useFakeTimers();

    console.log('*** CUSTOM ***');

    SavedObjectsActions.getBulk = jest
      .fn()
      .mockResolvedValue({ observabilityObjectList: [sampleSavedMetric] });

    httpClientMock.get = jest.fn();

    coreRefs.pplService = new PPLService(httpClientMock);
    coreRefs.pplService.fetch = jest.fn().mockResolvedValueOnce({
      data: { DATASOURCE_NAME: [] },
    });

    const el = document.createElement('div');
    let wrapper;
    await act(async () => {
      jest.advanceTimersByTime(1);
      wrapper = mount(<Sidebar />);
      await Promise.resolve();
      wrapper.update();
      // ReactDOM.render(<Sidebar />, el);
    });

    expect(wrapper).toContain('Available Metrics 0 of 0');

    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
      wrapper.update();
    });

    expect(wrapper).toContain('Available Metrics 1 of 1');
    expect(wrapper).toMatchSnapshot();

    jest.useRealTimers();
  });

  it('renders Side Bar Component for Prometheus Metric', async () => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
    console.log('*** PROMETHEUS ***');
    SavedObjectsActions.getBulk = jest.fn().mockResolvedValue({ observabilityObjectList: [] });

    httpClientMock.get = jest.fn();

    coreRefs.pplService = new PPLService(httpClientMock);
    coreRefs.pplService.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        data: { DATASOURCE_NAME: ['datasource1'] },
      })
      .mockResolvedValueOnce({
        jsonData: [
          {
            TABLE_CATALOG: 'datasource1',
            TABLE_NAME: 'metric1',
            TABLE_TYPE: 'metric',
          },
        ],
      });

    const el = document.createElement('div');
    let wrapper;
    await act(async () => {
      jest.advanceTimersByTime(1);
      ReactDOM.render(<Sidebar />, el);
      jest.runAllTicks();
      await Promise.resolve();
    });

    expect(el.innerHTML).toContain('Available Metrics 0 of 0');

    await act(async () => {
      jest.advanceTimersByTime(1);
      jest.runAllTicks();
      await Promise.resolve();
    });

    expect(el.innerHTML).toContain('Available Metrics 1 of 1');
    expect(el).toMatchSnapshot();

    jest.useRealTimers();
  });
});

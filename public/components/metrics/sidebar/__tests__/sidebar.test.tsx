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
import { setOSDHttp, setPPLService } from '../../../../../common/utils';
import { applyMiddleware, createStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../../../framework/redux/reducers';
import { Provider } from 'react-redux';
import { Sidebar } from '../sidebar';
import thunk from 'redux-thunk';
import { sampleSavedMetric } from '../../../../../test/metrics_constants';

jest.mock('../../../../services/requests/ppl');

describe('Side Bar Component', () => {
  configure({ adapter: new Adapter() });
  const store = createStore(rootReducer, applyMiddleware(thunk));

  beforeAll(() => {
    PPLService.mockImplementation(() => {
      return {
        fetch: jest.fn().mockResolvedValueOnce({
          data: { DATASOURCE_NAME: [] },
        }),
      };
    });

    setPPLService(new PPLService(httpClientMock));
  });

  it('renders Side Bar Component', async () => {
    setOSDHttp(httpClientMock);
    httpClientMock.get = jest.fn().mockResolvedValue({
      observabilityObjectList: [
        {
          id: sampleSavedMetric.id,
          savedVisualizationId: sampleSavedMetric.id,
          objectId: sampleSavedMetric.id,
          savedVisualization: sampleSavedMetric,
        },
      ],
    });

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

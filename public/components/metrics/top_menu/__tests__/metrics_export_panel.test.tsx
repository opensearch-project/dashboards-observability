/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { waitFor } from '@testing-library/react';
import httpClientMock from '../../../../../test/__mocks__/httpClientMock';
import { samplePanelOptions, sampleVisualizationById } from '../../../../../test/metrics_contants';
import { applyMiddleware, createStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../../../framework/redux/reducers';
import { Provider } from 'react-redux';
import { HttpResponse } from '../../../../../../../src/core/public';
import { MetricsExportPanel } from '../metrics_export_panel';
import thunk from 'redux-thunk';
import { coreRefs } from '../../../../framework/core_refs';

describe('Export Metrics Panel Component', () => {
  configure({ adapter: new Adapter() });
  const store = createStore(rootReducer, applyMiddleware(thunk));
  coreRefs.savedObjectsClient.find = jest.fn(() =>
    Promise.resolve({
      savedObjects: [],
      then: () => Promise.resolve(),
    })
  );

  let httpFlag = 1;
  httpClientMock.get = jest.fn(() => {
    if (httpFlag === 1) {
      httpFlag += 1;
      return Promise.resolve((samplePanelOptions as unknown) as HttpResponse);
    } else {
      return Promise.resolve((sampleVisualizationById as unknown) as HttpResponse);
    }
  });

  coreRefs.http = httpClientMock;

  it('renders Export Metrics Panel Component', async () => {
    const setIsSavePanelOpen = jest.fn();

    const wrapper = mount(
      <Provider store={store}>
        <MetricsExportPanel
          startTime="0"
          endTime="0"
          spanValue={1}
          resolutionValue={'h'}
          setIsSavePanelOpen={setIsSavePanelOpen}
        />
      </Provider>
    );

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });

    wrapper.unmount();
  });
});

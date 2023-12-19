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
import { mockSavedObjectActions } from '../../../../../test/constants';
import { sampleSavedMetric, sampleSortedMetricsLayout } from '../../../../../test/metrics_contants';
import { coreRefs } from '../../../../framework/core_refs';
import { rootReducer } from '../../../../framework/redux/reducers';
import { MetricsExportPanel } from '../metrics_export_panel';

describe('Export Metrics Panel Component', () => {
  configure({ adapter: new Adapter() });
  const store = createStore(rootReducer, applyMiddleware(thunk));
  coreRefs.savedObjectsClient.find = jest.fn(() =>
    Promise.resolve({
      savedObjects: [],
      then: () => Promise.resolve(),
    })
  );

  it('renders Export Metrics Panel Component', async () => {
    mockSavedObjectActions({ get: [{ savedVisualization: sampleSavedMetric }] });

    const http = httpClientMock;
    const visualizationsMetaData: any = [];
    const setVisualizationsMetaData = jest.fn();
    const sortedMetricsLayout = sampleSortedMetricsLayout;
    const setSelectedPanelOptions = jest.fn();

    const wrapper = mount(
      <Provider store={store}>
        <MetricsExportPanel
          http={http}
          visualizationsMetaData={visualizationsMetaData}
          setVisualizationsMetaData={setVisualizationsMetaData}
          sortedMetricsLayout={sortedMetricsLayout}
          selectedPanelOptions={[]}
          setSelectedPanelOptions={setSelectedPanelOptions}
        />
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

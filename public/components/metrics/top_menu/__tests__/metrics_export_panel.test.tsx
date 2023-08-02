/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { waitFor } from '@testing-library/react';
import httpClientMock from '../../../../../test/__mocks__/httpClientMock';
import { sampleSavedMetric, sampleSortedMetricsLayout } from '../../../../../test/metrics_contants';
import { applyMiddleware, createStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../../../framework/redux/reducers';
import { Provider } from 'react-redux';
import { MetricsExportPanel } from '../metrics_export_panel';
import { EuiComboBoxOptionOption } from '@elastic/eui';
import thunk from 'redux-thunk';
import { coreRefs } from '../../../../framework/core_refs';
import { mockSavedObjectActions } from '../../../../../test/constants';

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
      expect(wrapper).toMatchSnapshot();
    });
  });
});

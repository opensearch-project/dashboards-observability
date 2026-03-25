/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import {
  sampleAvailableDashboards,
  sampleMetricsToExport,
  sampleSavedMetric,
} from '../../../../../test/metrics_constants';
import { applyMiddleware, createStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../../../framework/redux/reducers';
import { Provider } from 'react-redux';
import { MetricsExportPanel } from '../metrics_export_panel';
import thunk from 'redux-thunk';
import { coreRefs } from '../../../../framework/core_refs';
import { mockSavedObjectActions } from '../../../../../test/constants';

describe('Export Metrics Panel Component', () => {
  const store = createStore(rootReducer, applyMiddleware(thunk));
  coreRefs.savedObjectsClient.find = jest.fn(() =>
    Promise.resolve({
      savedObjects: [],
      then: () => Promise.resolve(),
    })
  );

  it('renders Export Metrics Panel Component', async () => {
    mockSavedObjectActions({ get: [{ savedVisualization: sampleSavedMetric }] });

    render(
      <Provider store={store}>
        <MetricsExportPanel
          metricsToExport={sampleMetricsToExport}
          availableDashboards={sampleAvailableDashboards}
        />
      </Provider>
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

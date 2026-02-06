/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MetricsGrid } from '../metrics_grid';
// eslint-disable-next-line jest/no-mocks-import
import { coreStartMock } from '../../../../../test/__mocks__/coreMocks';
import { sampleMetricsVisualizations } from '../../../../../test/metrics_constants';
import { createStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../../../framework/redux/reducers';
import { Provider } from 'react-redux';
import PPLService from '../../../../services/requests/ppl';
// eslint-disable-next-line jest/no-mocks-import
import httpClientMock from '../../../../../test/__mocks__/httpClientMock';
import { coreRefs } from '../../../../framework/core_refs';
import { of } from 'rxjs';

describe('Metrics Grid Component', () => {
  const store = createStore(rootReducer);
  const core = coreStartMock;

  it('renders Metrics Grid Component', async () => {
    const panelVisualizations = sampleMetricsVisualizations;
    const setPanelVisualizations = jest.fn();
    const editMode = false;
    const startTime = 'now-30m';
    const endTime = 'now';
    const onEditClick = jest.fn();
    const onRefresh = true;
    const editActionType = 'save';
    const spanParam = '1h';
    const setEditActionType = jest.fn();

    coreRefs.pplService = new PPLService(httpClientMock);
    coreRefs.pplService.fetch = jest.fn(() =>
      Promise.resolve({
        data: {
          datarows: [],
          schema: [
            { name: '@timestamp', type: 'timestamp' },
            { name: '@value', type: 'number' },
            { name: '@labels', type: 'string' },
          ],
        },
        then: () => Promise.resolve(),
      })
    );
    coreRefs.chrome = { getIsNavDrawerLocked$: () => of(false) };

    render(
      <Provider store={store}>
        <MetricsGrid
          chrome={core.chrome}
          panelVisualizations={panelVisualizations}
          setPanelVisualizations={setPanelVisualizations}
          editMode={editMode}
          startTime={startTime}
          endTime={endTime}
          moveToEvents={onEditClick}
          onRefresh={onRefresh}
          editActionType={editActionType}
          setEditActionType={setEditActionType}
          spanParam={spanParam}
        />
      </Provider>
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

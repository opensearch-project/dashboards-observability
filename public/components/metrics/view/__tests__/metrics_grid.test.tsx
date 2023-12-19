/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createStore } from '@reduxjs/toolkit';
import { waitFor } from '@testing-library/react';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import toJson from 'enzyme-to-json';
import React from 'react';
import { Provider } from 'react-redux';
import { coreStartMock } from '../../../../../test/__mocks__/coreMocks';
import httpClientMock from '../../../../../test/__mocks__/httpClientMock';
import { sampleMetricsVisualizations } from '../../../../../test/metrics_contants';
import { coreRefs } from '../../../../framework/core_refs';
import { rootReducer } from '../../../../framework/redux/reducers';
import PPLService from '../../../../services/requests/ppl';
import { MetricsGrid } from '../metrics_grid';

describe('Metrics Grid Component', () => {
  configure({ adapter: new Adapter() });
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

    const wrapper = mount(
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

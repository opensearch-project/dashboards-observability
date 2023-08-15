/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { waitFor } from '@testing-library/react';
import { MetricsGrid } from '../metrics_grid';
import { coreStartMock } from '../../../../../test/__mocks__/coreMocks';
import { sampleMetric, sampleMetricsVisualizations } from '../../../../../test/metrics_contants';
import { createStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../../../framework/redux/reducers';
import { Provider } from 'react-redux';

describe('Metrics Grid Component', () => {
  configure({ adapter: new Adapter() });
  const store = createStore(rootReducer);

  it('renders Metrics Grid Component', async () => {
    const core = coreStartMock;
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
      expect(wrapper).toMatchSnapshot();
    });
  });
});

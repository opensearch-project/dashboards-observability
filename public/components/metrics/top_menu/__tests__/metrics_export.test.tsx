/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { PropsWithChildren } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { waitFor } from '@testing-library/react';
import { sampleSavedMetric } from '../../../../../test/metrics_constants';
import { applyMiddleware, createStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../../../framework/redux/reducers';
import { MetricsExport } from '../metrics_export';
import thunk from 'redux-thunk';
import { coreRefs } from '../../../../framework/core_refs';
import { mockSavedObjectActions } from '../../../../../test/constants';
import { OBSERVABILITY_CUSTOM_METRIC } from '../../../../../common/constants/metrics';
import { metricsReducers } from '../../redux/slices/metrics_slice';
import { panelReducer } from '../../../custom_panels/redux/panel_slice';
import { act } from 'react-dom/test-utils';

const defaultInitialState = {
  metrics: {},
  selectedIds: [],
  sortedIds: [],
  search: '',
  metricsLayout: [],
  dataSources: [OBSERVABILITY_CUSTOM_METRIC],
  dataSourceTitles: ['Observability Custom Metrics'],
  dataSourceIcons: [[OBSERVABILITY_CUSTOM_METRIC, { color: 'blue' }]],
  dateSpanFilter: {
    start: 'now-1d',
    end: 'now',
    span: 1,
    resolution: 'h',
    recentlyUsedRanges: [],
  },
  refresh: 0, // set to new Date() to trigger
};

// eslint-disable-next-line jest/no-export
export function renderWithMetricsProviders(
  ui: React.ReactElement,
  {
    preloadedState = {},
    // Automatically create a store instance if no store was passed in
    store = configureStore({
      reducer: { metrics: metricsReducers, customPanel: panelReducer },
      preloadedState,
    }),
    ...renderOptions
  }: ExtendedRenderOptions = {}
) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function Wrapper({ children }: PropsWithChildren<{}>): JSX.Element {
    return <Provider store={store}>{children}</Provider>;
  }

  // Return an object with the store and all of RTL's query functions
  return { store, ...render(<Provider store={store}>{ui}</Provider>, { ...renderOptions }) };
}

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

    const wrapper = mount(
      <Provider store={store}>
        <MetricsExport />
      </Provider>
    );
    wrapper.update();

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
  it('opens metric export panel on Save button, closes on Cancel', async () => {
    // Arrange
    const preloadedState = {
      metrics: {
        ...defaultInitialState,
        metrics: { [sampleSavedMetric.id]: sampleSavedMetric },
        selectedIds: [sampleSavedMetric.id],
      },
      customPanel: {
        panelList: [],
      },
    };

    // Act
    renderWithMetricsProviders(<MetricsExport />, { preloadedState });

    // Assert
    const saveButton = await screen.findByText(/Save/);
    expect(saveButton).toBeInTheDocument();
    fireEvent.click(saveButton);

    const modalCancelButton = await screen.findByTestId('metrics__SaveCancel');
    expect(modalCancelButton).toBeInTheDocument();
    fireEvent.click(modalCancelButton);

    await waitFor(() => {
      expect(screen.queryByTestId('metrics__SaveCancel')).not.toBeInTheDocument();
    });

    expect(screen.queryByTestId('metrics__SaveCancel')).toBeNull();
  });

  it('opens metric export panel on Save button, closes by clicking away from panel', async () => {
    // Arrange
    const preloadedState = {
      metrics: {
        ...defaultInitialState,
        metrics: { [sampleSavedMetric.id]: sampleSavedMetric },
        selectedIds: [sampleSavedMetric.id],
      },
      customPanel: {
        panelList: [],
      },
    };

    // Act
    renderWithMetricsProviders(
      <div>
        <span>A Clickable Target</span>
        <MetricsExport />
      </div>,
      { preloadedState }
    );

    // Assert
    const saveButton = await screen.findByText(/Save/);
    expect(saveButton).toBeInTheDocument();
    fireEvent.click(saveButton);

    // eslint-disable-next-line jest/valid-expect
    expect(await screen.findByText('Dashboards and applications - optional'));

    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('metrics__SaveCancel')).not.toBeInTheDocument();
    });

    expect(screen.queryByTestId('metrics__SaveCancel')).toBeNull();
  });
  it('handles saving new metric objects on Save', async () => {
    // Arrange
    const preloadedState = {
      metrics: {
        ...defaultInitialState,
        metrics: { [sampleSavedMetric.id]: sampleSavedMetric },
        selectedIds: [sampleSavedMetric.id],
      },
      customPanel: {
        panelList: [],
      },
    };

    // Act
    renderWithMetricsProviders(<MetricsExport />, { preloadedState });

    // Assert
    const saveButton = await screen.findByText(/Save/);
    expect(saveButton).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(saveButton);

      expect(await screen.findByTestId('metrics__querySaveName')).toBeInTheDocument();
      const modalSaveButton = await screen.findByTestId('metrics__SaveConfirm');
      expect(modalSaveButton).toBeInTheDocument();
      fireEvent.click(modalSaveButton);
    });
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { PropsWithChildren } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RenderOptions } from '@testing-library/react';
import '@testing-library/jest-dom';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';

import { OBSERVABILITY_CUSTOM_METRIC } from '../../../../../../common/constants/metrics';
import { PROMQL_METRIC_SUBTYPE } from '../../../../../../common/constants/shared';
import {
  metricsReducers,
  mergeMetrics,
  clearSelectedMetrics,
  addSelectedMetric,
  metricSlice,
} from '../metrics_slice';
import { sampleSavedMetric } from '../../../../../../test/metrics_constants';
import httpClientMock from '../../../../../../test/__mocks__/httpClientMock';
import { Sidebar } from '../../../sidebar/sidebar';
import { setOSDHttp, setPPLService } from '../../../../../../common/utils';
import PPLService from '../../../../../services/requests/ppl';

jest.mock('../../../../../services/requests/ppl');

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

// This type interface extends the default options for render from RTL, as well
// as allows the user to specify other things such as initialState, store.
interface ExtendedRenderOptions extends Omit<RenderOptions, 'queries'> {
  preloadedState?: Partial<RootState>;
  store?: AppStore;
}

function configureMetricStore(additionalState = {}) {
  const preloadedState = {
    metrics: { ...defaultInitialState, ...additionalState },
  };
  return configureStore({ reducer: { metrics: metricsReducers }, preloadedState });
}

export function renderWithMetricsProviders(
  ui: React.ReactElement,
  {
    preloadedState = {},
    // Automatically create a store instance if no store was passed in
    store = configureStore({ reducer: { metrics: metricsReducers }, preloadedState }),
    ...renderOptions
  }: ExtendedRenderOptions = {}
) {
  function Wrapper({ children }: PropsWithChildren<{}>): JSX.Element {
    return <Provider store={store}>{children}</Provider>;
  }

  // Return an object with the store and all of RTL's query functions
  return { store, ...render(<Provider store={store}>{ui}</Provider>, { ...renderOptions }) };
}

describe('Add and Remove Selected Metrics', () => {
  beforeAll(() => {
    PPLService.mockImplementation(() => {
      return {
        fetch: jest
          .fn()
          .mockResolvedValueOnce({
            data: { DATASOURCE_NAME: ['datasource1', 'datasource2'] },
          })
          // datasource1 return schema
          .mockResolvedValueOnce({
            jsonData: [{ TABLE_CATALOG: 'datasource1', TABLE_NAME: 'testMetric' }],
          })
          // datasource2 return schema (none) plus getAvailableAttributes
          .mockResolvedValue({
            jsonData: [],
          }),
      };
    });
  });

  beforeEach(() => {
    jest.resetModules();
  });

  it('should render available metrics', async () => {
    const preloadedState = {
      metrics: {
        ...defaultInitialState,
      },
    };

    setPPLService(new PPLService(httpClientMock));

    setOSDHttp(httpClientMock);
    httpClientMock.get = jest.fn().mockResolvedValue({
      observabilityObjectList: [
        {
          id: sampleSavedMetric.id,
          objectId: sampleSavedMetric.id,
          savedVisualization: sampleSavedMetric,
        },
      ],
    });

    // Act
    renderWithMetricsProviders(<Sidebar />, { preloadedState });

    // Assert

    // wait for render after loadMetrics
    expect(await screen.findByText(/Available Metrics 2 of 2/)).toBeInTheDocument();
    expect(await screen.findByText(/Selected Metrics 0 of 0/)).toBeInTheDocument();
    expect(screen.getByText(/\[Logs\]/)).toBeInTheDocument();

    // Find the testMetric and click on it to "select" it.
    const testMetricEl = screen.getByText(/testMetric/);
    expect(testMetricEl).toBeInTheDocument();
    fireEvent.click(testMetricEl);

    // Selected and Available now show 1 each -- testMetric has been moved
    expect(await screen.findByText(/Available Metrics 1 of 1/)).toBeInTheDocument();
    expect(await screen.findByText(/Selected Metrics 1 of 1/)).toBeInTheDocument();
  });
});
describe('Metrics redux state tests', () => {
  it('Should initially set metrics state', () => {
    const store = configureMetricStore();
    const state = store.getState().metrics;
    expect(state).toHaveProperty('metrics');
    expect(state).toHaveProperty('selectedIds');
  });
});

describe('metricsSlice actions and reducers', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should handle mergeMetrics', async () => {
    const newMetrics = {
      metric1: { name: 'metricName', availableAttributes: undefined },
    };
    const store = configureMetricStore();

    store.dispatch(mergeMetrics(newMetrics));

    const newState = store.getState().metrics;

    expect(newState.metrics).toMatchObject(newMetrics);
  });

  it('should handle clearSelectedMetrics', () => {
    const store = configureMetricStore({ selectedIds: ['testId'] });
    store.dispatch(clearSelectedMetrics());

    const newState = store.getState().metrics;
    expect(newState.selectedIds).toEqual([]);
  });

  it('should handle updateMetricQuery', () => {
    const metricsState = {
      ...defaultInitialState,
      metrics: { metric1: { name: 'metricName' }, metric2: { name: 'metric2' } },
    };
    // const store = configureStore( { metrics: metricsReducers },
    //   preloadedState: { metrics: metricsState },
    // });

    // const dispatchedAction = store.dispatch(
    //   updateMetricQuery('metric1', { availableAttributes: ['label1'] })
    // );
    // expect(dispatchedAction.type).toEqual('metrics/setMetric');
    // expect(dispatchedAction.payload).toMatchObject({
    //   aggregation: 'avg',
    //   attributesGroupBy: [],
    //   availableAttributes: ['label1'],
    // });
  });

  describe('loadMetrics', () => {
    it('should handle setSortedIds', async () => {
      const store = configureMetricStore();
      await store.dispatch(metricSlice.actions.setSortedIds(['id1', 'id2']));
      expect(store.getState().metrics.sortedIds).toEqual(['id1', 'id2']);
    });
  });
});

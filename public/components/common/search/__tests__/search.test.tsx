/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { applyMiddleware, createStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { Provider } from 'react-redux';
import thunk from 'redux-thunk';
import { coreRefs } from '../../../../framework/core_refs';
import { rootReducer } from '../../../../framework/redux/reducers';
import { initialTabId } from '../../../../framework/redux/store/shared_state';
import * as hookExports from '../../../event_analytics/explorer/query_assist/hooks';
import { Search } from '../search';

describe('Explorer Search component', () => {
  configure({ adapter: new Adapter() });
  const store = createStore(rootReducer, applyMiddleware(thunk));

  it('renders basic component', () => {
    const wrapper = mount(
      <Provider store={store}>
        <Search tabId={initialTabId} />
      </Provider>
    );
    wrapper.update();
    expect(wrapper).toMatchSnapshot();
  });
});

describe('Search state', () => {
  const catIndicesSpy = jest.spyOn(hookExports, 'useCatIndices');
  const getIndexPatternsSpy = jest.spyOn(hookExports, 'useGetIndexPatterns');
  const store = createStore(rootReducer, applyMiddleware(thunk));

  beforeEach(() => {
    coreRefs.queryAssistEnabled = true;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('selects logs sample data over others', async () => {
    catIndicesSpy.mockReturnValue({
      data: [{ label: 'opensearch_dashboards_sample_data_flights' }],
      loading: false,
      refresh: jest.fn(),
    });
    getIndexPatternsSpy.mockReturnValue({
      data: [{ label: 'test-index' }, { label: 'opensearch_dashboards_sample_data_logs' }],
      loading: false,
      refresh: jest.fn(),
    });
    const component = render(
      <Provider store={store}>
        <Search
          tabId={initialTabId}
          handleQueryChange={jest.fn()}
          pplService={{ fetch: () => Promise.resolve() }}
        />
      </Provider>
    );
    expect(component.getByText('opensearch_dashboards_sample_data_logs')).toBeInTheDocument();
  });

  it('selects other sample data', async () => {
    catIndicesSpy.mockReturnValue({
      data: [{ label: 'test-index' }, { label: 'opensearch_dashboards_sample_data_flights' }],
      loading: false,
      refresh: jest.fn(),
    });
    getIndexPatternsSpy.mockReturnValue({
      data: [],
      loading: false,
      refresh: jest.fn(),
    });
    const component = render(
      <Provider store={store}>
        <Search
          tabId={initialTabId}
          handleQueryChange={jest.fn()}
          pplService={{ fetch: () => Promise.resolve() }}
        />
      </Provider>
    );
    expect(component.getByText('opensearch_dashboards_sample_data_flights')).toBeInTheDocument();
  });
});

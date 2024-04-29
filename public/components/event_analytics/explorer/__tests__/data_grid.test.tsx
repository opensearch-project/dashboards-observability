/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { waitFor } from '@testing-library/react';
import { DataGrid } from '../events_views/data_grid';
import {
  SELECTED_FIELDS,
  AVAILABLE_FIELDS,
  UNSELECTED_FIELDS,
  QUERIED_FIELDS,
  DEFAULT_EMPTY_EXPLORER_FIELDS,
  SELECTED_TIMESTAMP,
} from '../../../../../common/constants/explorer';
import {
  AVAILABLE_FIELDS as SIDEBAR_AVAILABLE_FIELDS,
  QUERY_FIELDS,
  DATA_GRID_ROWS,
  EXPLORER_DATA_GRID_QUERY,
} from '../../../../../test/event_analytics_constants';
import { sampleEmptyPanel } from '../../../../../test/panels_constants';
import { HttpResponse } from '../../../../../../../src/core/public';
import PPLService from '../../../../../public/services/requests/ppl';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { queriesReducer } from '../../redux/slices/query_slice';
import { coreMock } from '../../../../../../../src/core/public/mocks';

const coreStartMock = coreMock.createStart();

describe('Datagrid component', () => {
  configure({ adapter: new Adapter() });

  it('Renders data grid component', async () => {
    const explorerFields = {
      [SELECTED_FIELDS]: [],
      [UNSELECTED_FIELDS]: [],
      [AVAILABLE_FIELDS]: SIDEBAR_AVAILABLE_FIELDS,
      [QUERIED_FIELDS]: QUERY_FIELDS,
    };

    coreStartMock.http.get = jest
      .fn()
      .mockResolvedValue((sampleEmptyPanel as unknown) as HttpResponse);

    const tabId = 'explorer-tab-_fbef9141-48eb-11ee-a60a-af33302cfb3c';

    const pplService = new PPLService(coreStartMock.http);
    const preloadedState = {
      queries: {
        [tabId]: {
          [SELECTED_TIMESTAMP]: 'timestamp',
        },
      },
    };
    const store = configureStore({ reducer: queriesReducer, preloadedState });

    const wrapper = mount(
      <Provider store={store}>
        <DataGrid
          http={coreStartMock.http}
          pplService={pplService}
          rows={DATA_GRID_ROWS}
          explorerFields={explorerFields}
          timeStampField={'timestamp'}
          rawQuery={EXPLORER_DATA_GRID_QUERY}
          totalHits={1390}
          requestParams={{ tabId }}
          startTime={'now/y'}
          endTime={'now'}
          storedSelectedColumns={DEFAULT_EMPTY_EXPLORER_FIELDS}
        />
      </Provider>
    );

    wrapper.update();

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });

  it('renders data grid with different timestamp', async () => {
    const explorerFields = {
      [SELECTED_FIELDS]: [],
      [UNSELECTED_FIELDS]: [],
      [AVAILABLE_FIELDS]: SIDEBAR_AVAILABLE_FIELDS,
      [QUERIED_FIELDS]: QUERY_FIELDS,
    };

    coreStartMock.http.get = jest
      .fn()
      .mockResolvedValue((sampleEmptyPanel as unknown) as HttpResponse);

    const tabId = 'explorer-tab-_fbef9141-48eb-11ee-a60a-af33302cfb3c';

    const pplService = new PPLService(coreStartMock.http);
    const preloadedState = {
      queries: {
        [tabId]: {
          [SELECTED_TIMESTAMP]: 'utc_time',
        },
      },
    };
    const store = configureStore({ reducer: queriesReducer, preloadedState });

    const wrapper = mount(
      <Provider store={store}>
        <DataGrid
          http={coreStartMock.http}
          pplService={pplService}
          rows={DATA_GRID_ROWS}
          explorerFields={explorerFields}
          timeStampField={'utc_time'}
          rawQuery={EXPLORER_DATA_GRID_QUERY}
          totalHits={1390}
          requestParams={{ tabId }}
          startTime={'now/y'}
          endTime={'now'}
          storedSelectedColumns={DEFAULT_EMPTY_EXPLORER_FIELDS}
        />
      </Provider>
    );

    wrapper.update();

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });

  it('renders data grid with no timestamp', async () => {
    const explorerFields = {
      [SELECTED_FIELDS]: [],
      [UNSELECTED_FIELDS]: [],
      [AVAILABLE_FIELDS]: SIDEBAR_AVAILABLE_FIELDS,
      [QUERIED_FIELDS]: QUERY_FIELDS,
    };

    coreStartMock.http.get = jest
      .fn()
      .mockResolvedValue((sampleEmptyPanel as unknown) as HttpResponse);

    const tabId = 'explorer-tab-_fbef9141-48eb-11ee-a60a-af33302cfb3c';

    const pplService = new PPLService(coreStartMock.http);
    const preloadedState = {
      queries: {
        [tabId]: {
          [SELECTED_TIMESTAMP]: '',
        },
      },
    };
    const store = configureStore({ reducer: queriesReducer, preloadedState });

    const wrapper = mount(
      <Provider store={store}>
        <DataGrid
          http={coreStartMock.http}
          pplService={pplService}
          rows={DATA_GRID_ROWS}
          explorerFields={explorerFields}
          timeStampField={''}
          rawQuery={EXPLORER_DATA_GRID_QUERY}
          totalHits={1390}
          requestParams={{ tabId }}
          startTime={'now/y'}
          endTime={'now'}
          storedSelectedColumns={DEFAULT_EMPTY_EXPLORER_FIELDS}
        />
      </Provider>
    );

    wrapper.update();

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});

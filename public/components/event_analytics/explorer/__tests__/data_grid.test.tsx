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
} from '../../../../../common/constants/explorer';
import {
  AVAILABLE_FIELDS as SIDEBAR_AVAILABLE_FIELDS,
  QUERY_FIELDS,
  DATA_GRID_ROWS,
  EXPLORER_DATA_GRID_QUERY,
} from '../../../../../test/event_analytics_constants';
import httpClientMock from '../../../../../test/__mocks__/httpClientMock';
import { sampleEmptyPanel } from '../../../../../test/panels_constants';
import { HttpResponse } from '../../../../../../../src/core/public';
import PPLService from '../../../../../public/services/requests/ppl';
import { applyMiddleware, createStore } from 'redux';
import { rootReducer } from '../../../../../public/framework/redux/reducers';
import thunk from 'redux-thunk';
import { Provider } from 'react-redux';

describe('Datagrid component', () => {
  configure({ adapter: new Adapter() });

  it('Renders data grid component', async () => {
    const explorerFields = {
      [SELECTED_FIELDS]: [],
      [UNSELECTED_FIELDS]: [],
      [AVAILABLE_FIELDS]: SIDEBAR_AVAILABLE_FIELDS,
      [QUERIED_FIELDS]: QUERY_FIELDS,
    };

    httpClientMock.get = jest.fn(() =>
      Promise.resolve((sampleEmptyPanel as unknown) as HttpResponse)
    );

    const http = httpClientMock;
    const pplService = new PPLService(httpClientMock);
    const store = createStore(rootReducer, applyMiddleware(thunk));

    const wrapper = mount(
      <Provider store={store}>
        <DataGrid
          http={http}
          pplService={pplService}
          rows={DATA_GRID_ROWS}
          rowsAll={[]}
          explorerFields={explorerFields}
          timeStampField={'timestamp'}
          rawQuery={EXPLORER_DATA_GRID_QUERY}
          totalHits={1390}
          requestParams={{
            tabId: 'explorer-tab-_fbef9141-48eb-11ee-a60a-af33302cfb3c',
          }}
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

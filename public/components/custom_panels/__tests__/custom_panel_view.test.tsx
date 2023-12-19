/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitFor } from '@testing-library/react';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import toJson from 'enzyme-to-json';
import React from 'react';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import { HttpResponse } from '../../../../../../src/core/public';
import DSLService from '../../../../public/services/requests/dsl';
import PPLService from '../../../../public/services/requests/ppl';
import { coreStartMock } from '../../../../test/__mocks__/coreMocks';
import httpClientMock from '../../../../test/__mocks__/httpClientMock';
import {
  panelBreadCrumbs,
  sampleEmptyPanel,
  samplePPLResponse,
  samplePanel,
  sampleSavedVisualization,
} from '../../../../test/panels_constants';
import { rootReducer } from '../../../framework/redux/reducers';
import { CustomPanelView } from '../custom_panel_view';

describe('Panels View Component', () => {
  configure({ adapter: new Adapter() });

  const store = createStore(rootReducer, applyMiddleware(thunk));

  it('renders panel view container without visualizations', async () => {
    httpClientMock.get = jest.fn(() =>
      Promise.resolve((sampleEmptyPanel as unknown) as HttpResponse)
    );
    const panelId = 'L8Sx53wBDp0rvEg3yoLb';
    const http = httpClientMock;
    const pplService = new PPLService(httpClientMock);
    const dslService = new DSLService(httpClientMock);
    const core = coreStartMock;
    const parentBreadcrumbs = panelBreadCrumbs;
    const start = 'now-30m';
    const end = 'now';
    const setStart = jest.fn();
    const setEnd = jest.fn();
    const renameCustomPanel = jest.fn();
    const cloneCustomPanel = jest.fn();
    const deleteCustomPanel = jest.fn();
    const setToast = jest.fn();
    const onEditClick = (savedVisId: string) => {
      window.location.assign(`#/event_analytics/explorer/${savedVisId}`);
    };

    const wrapper = mount(
      <Provider store={store}>
        <CustomPanelView
          panelId={panelId}
          http={http}
          pplService={pplService}
          dslService={dslService}
          chrome={core.chrome}
          parentBreadcrumbs={parentBreadcrumbs}
          renameCustomPanel={renameCustomPanel}
          cloneCustomPanel={cloneCustomPanel}
          deleteCustomPanel={deleteCustomPanel}
          setToast={setToast}
          onEditClick={onEditClick}
          startTime={start}
          endTime={end}
          setStartTime={setStart}
          setEndTime={setEnd}
          page="operationalPanels"
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

  it('renders panel view container with visualizations', async () => {
    let counter = 0;
    // Mocks two http get requests first for fetch panel
    // Others for fetching visualizations in panel
    httpClientMock.get = jest.fn(() => {
      if (counter === 0) {
        counter += 1;
        return Promise.resolve((samplePanel as unknown) as HttpResponse);
      } else return Promise.resolve((sampleSavedVisualization as unknown) as HttpResponse);
    });

    httpClientMock.post = jest.fn(() =>
      Promise.resolve((samplePPLResponse as unknown) as HttpResponse)
    );
    const panelId = 'L8Sx53wBDp0rvEg3yoLb';
    const http = httpClientMock;
    const pplService = new PPLService(httpClientMock);
    const dslService = new DSLService(httpClientMock);
    const core = coreStartMock;
    const parentBreadcrumbs = panelBreadCrumbs;
    const start = 'now-30m';
    const end = 'now';
    const setStart = jest.fn();
    const setEnd = jest.fn();
    const renameCustomPanel = jest.fn();
    const cloneCustomPanel = jest.fn();
    const deleteCustomPanel = jest.fn();
    const setToast = jest.fn();
    const onEditClick = (savedVisId: string) => {
      window.location.assign(`#/event_analytics/explorer/${savedVisId}`);
    };

    const wrapper = mount(
      <Provider store={store}>
        <CustomPanelView
          panelId={panelId}
          http={http}
          pplService={pplService}
          dslService={dslService}
          chrome={core.chrome}
          parentBreadcrumbs={parentBreadcrumbs}
          renameCustomPanel={renameCustomPanel}
          cloneCustomPanel={cloneCustomPanel}
          deleteCustomPanel={deleteCustomPanel}
          setToast={setToast}
          onEditClick={onEditClick}
          startTime={start}
          endTime={end}
          setStartTime={setStart}
          setEndTime={setEnd}
          page="operationalPanels"
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

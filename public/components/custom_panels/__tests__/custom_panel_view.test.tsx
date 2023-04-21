/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { CustomPanelView } from '../custom_panel_view';
import { waitFor } from '@testing-library/react';
import {
  panelBreadCrumbs,
  sampleEmptyPanel,
  samplePanel,
  samplePPLResponse,
  sampleSavedVisualization,
} from '../../../../test/panels_constants';
import httpClientMock from '../../../../test/__mocks__/httpClientMock';
import PPLService from '../../../../public/services/requests/ppl';
import DSLService from '../../../../public/services/requests/dsl';
import { coreStartMock } from '../../../../test/__mocks__/coreMocks';
import { HttpResponse } from '../../../../../../src/core/public';
import { applyMiddleware, createStore } from 'redux';
import { rootReducer } from '../../../framework/redux/reducers';
import thunk from 'redux-thunk';
import { Provider } from 'react-redux';
import { OpenSearchDashboardsContextProvider } from '../../../../../../src/plugins/opensearch_dashboards_react/public';

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
      expect(wrapper).toMatchSnapshot();
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

    const services = { toasts: { addDanger: (t) => {} } }

    const wrapper = mount(
      <OpenSearchDashboardsContextProvider services={services} >
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
      </OpenSearchDashboardsContextProvider>
    );
    wrapper.update();

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});

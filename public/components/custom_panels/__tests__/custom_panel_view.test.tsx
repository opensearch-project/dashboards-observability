/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { CustomPanelView } from '../custom_panel_view';

import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import {
  panelBreadCrumbs,
  sampleEmptyPanel,
  samplePanel,
  samplePPLResponse,
  sampleSavedVisualization,
} from '../../../../test/panels_constants';
// eslint-disable-next-line jest/no-mocks-import
import httpClientMock from '../../../../test/__mocks__/httpClientMock';
import PPLService from '../../../../public/services/requests/ppl';
import DSLService from '../../../../public/services/requests/dsl';
// eslint-disable-next-line jest/no-mocks-import
import { coreStartMock } from '../../../../test/__mocks__/coreMocks';
import { HttpResponse } from '../../../../../../src/core/public';
import { applyMiddleware, createStore } from 'redux';
import { rootReducer } from '../../../framework/redux/reducers';
import thunk from 'redux-thunk';
import { Provider } from 'react-redux';
import { setPanelList } from '../redux/panel_slice';
import { coreRefs } from '../../../../public/framework/core_refs';

describe('Panels View Component', () => {
  configure({ adapter: new Adapter() });

  const store = createStore(rootReducer, applyMiddleware(thunk));

  const props = {
    panelId: 'L8Sx53wBDp0rvEg3yoLb',
    http: httpClientMock,
    pplService: new PPLService(httpClientMock),
    dslService: new DSLService(httpClientMock),
    core: coreStartMock,
    chrome: coreStartMock.chrome,
    parentBreadcrumbs: panelBreadCrumbs,
    startTime: 'now-30m',
    endTime: 'now',
    setStartTime: jest.fn(),
    setEndTime: jest.fn(),
    renameCustomPanel: jest.fn(),
    cloneCustomPanel: jest.fn(),
    deleteCustomPanel: jest.fn(),
    setToast: jest.fn(),
    onEditClick: (savedVisId: string) => {
      window.location.assign(`#/event_analytics/explorer/${savedVisId}`);
    },
  };

  const renderPanelView = (overrides = {}) => {
    const utils = render(
      <Provider store={store}>
        <CustomPanelView {...props} {...overrides} page="operationalPanels" />
      </Provider>
    );
    return utils;
  };

  afterEach(() => {
    cleanup();
  });

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
      expect(wrapper).toMatchSnapshot();
    });
  });

  it('render panel view container and refresh panel', async () => {
    let counter = 0;
    httpClientMock.get = jest.fn(() => {
      if (counter === 0) {
        counter += 1;
        return Promise.resolve((samplePanel as unknown) as HttpResponse);
      } else return Promise.resolve((sampleSavedVisualization as unknown) as HttpResponse);
    });

    httpClientMock.post = jest.fn(() =>
      Promise.resolve((samplePPLResponse as unknown) as HttpResponse)
    );
    const http = httpClientMock;
    const pplService = new PPLService(httpClientMock);
    const dslService = new DSLService(httpClientMock);
    const panelView = renderPanelView({ http, pplService, dslService });

    fireEvent.click(panelView.getByTestId('superDatePickerApplyTimeButton'));
    expect(panelView.container.firstChild).toMatchSnapshot();
  });

  it('render panel view container and duplicate dashboard', async () => {
    store.dispatch(setPanelList([sampleSavedVisualization]));
    const utils = renderPanelView(sampleSavedVisualization);

    fireEvent.click(utils.getByTestId('panelActionContextMenu'));
    fireEvent.click(utils.getByTestId('duplicatePanelContextMenuItem'));
    expect(utils.getByTestId('customModalFieldText')).toBeInTheDocument();

    fireEvent.input(utils.getByTestId('customModalFieldText'), {
      target: { value: 'duplicate panel' },
    });
    act(() => {
      fireEvent.click(utils.getByTestId('runModalButton'));
    });
    await waitFor(() => {
      expect(coreRefs.savedObjectsClient.create).toBeCalledTimes(1);
    });
  });

  it('render panel view so container and reload dashboard', async () => {
    store.dispatch(setPanelList([sampleSavedVisualization]));
    const utils = renderPanelView(sampleSavedVisualization);

    fireEvent.click(utils.getByTestId('panelActionContextMenu'));
    fireEvent.click(utils.getByTestId('reloadPanelContextMenuItem'));
    expect(utils.container.firstChild).toMatchSnapshot();
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { CustomPanelViewSO } from '../custom_panel_view_so';

import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import {
  panelBreadCrumbs,
  samplePanel,
  samplePPLResponse,
  sampleSavedVisualization,
  sampleSavedObjectPanel,
  sampleSavedObjectPanelWithVisualization,
} from '../../../../test/panels_constants';
// eslint-disable-next-line jest/no-mocks-import
import httpClientMock from '../../../../test/__mocks__/httpClientMock';
import PPLService from '../../../../public/services/requests/ppl';
import { HttpResponse } from '../../../../../../src/core/public';
import DSLService from '../../../../public/services/requests/dsl';
// eslint-disable-next-line jest/no-mocks-import
import { coreStartMock } from '../../../../test/__mocks__/coreMocks';
import { applyMiddleware, createStore } from 'redux';
import { coreRefs } from '../../../framework/core_refs';
import { rootReducer } from '../../../framework/redux/reducers';
import thunk from 'redux-thunk';
import { Provider } from 'react-redux';
import { setPanelList } from '../redux/panel_slice';

jest.mock('react-router-dom', () => ({
  useLocation: jest.fn().mockReturnValue({
    pathname: '/operational_panels/L8Sx53wBDp0rvEg3yoLb',
    search: '',
    hash: '',
    state: null,
    key: '',
  }),
  useHistory: jest.fn(),
}));

describe('Panels View SO Component', () => {
  configure({ adapter: new Adapter() });
  const store = createStore(rootReducer, applyMiddleware(thunk));

  const http = httpClientMock;
  let counter = 0;
  http.get = jest.fn(() => {
    if (counter === 0) {
      counter += 1;
      return Promise.resolve((samplePanel as unknown) as HttpResponse);
    } else return Promise.resolve((sampleSavedVisualization as unknown) as HttpResponse);
  });
  http.post = jest.fn(() => Promise.resolve((samplePPLResponse as unknown) as HttpResponse));
  const pplService = new PPLService(http);
  const dslService = new DSLService(http);
  coreRefs.savedObjectsClient.create = jest
    .fn()
    .mockReturnValue(sampleSavedObjectPanelWithVisualization);
  coreRefs.savedObjectsClient.get = jest
    .fn()
    .mockReturnValue(sampleSavedObjectPanelWithVisualization);
  coreRefs.savedObjectsClient.find = jest
    .fn()
    .mockReturnValue(sampleSavedObjectPanelWithVisualization);
  coreRefs.savedObjectsClient.update = jest.fn();
  coreRefs.savedObjectsClient.delete = jest.fn();
  coreRefs.http.post = jest.fn();
  coreRefs.http.delete = jest.fn();
  jest.useFakeTimers().setSystemTime(new Date('2024-01-01'));

  afterEach(() => {
    cleanup();
  });

  const props = {
    panelId: 'L8Sx53wBDp0rvEg3yoLb',
    coreSavedObjects: coreStartMock.savedObjects,
    chrome: coreStartMock.chrome,
    parentBreadcrumbs: panelBreadCrumbs,
    cloneCustomPanel: jest.fn(),
    onEditClick: (savedVisId: string) => {
      window.location.assign(`#/event_analytics/explorer/${savedVisId}`);
    },
    http,
    pplService,
    dslService,
  };

  const renderPanelView = (savedObject, overrides = {}) => {
    coreRefs.savedObjectsClient.get = jest.fn().mockReturnValue(savedObject);
    coreRefs.savedObjectsClient.find = jest.fn().mockReturnValue(savedObject);
    const utils = render(
      <Provider store={store}>
        <CustomPanelViewSO {...props} {...overrides} page="operationalPanels" />
      </Provider>
    );
    return utils;
  };

  afterEach(() => {
    cleanup();
  });

  it('renders panel view SO container without visualizations', async () => {
    const utils = renderPanelView(sampleSavedObjectPanel);

    await waitFor(() => {
      expect(utils.container.firstChild).toMatchSnapshot();
    });
  });

  it('renders panels view SO container with visualizations', async () => {
    const utils = renderPanelView(sampleSavedObjectPanelWithVisualization);

    await waitFor(() => {
      expect(utils.container.firstChild).toMatchSnapshot();
    });
  });

  it('render panel view container and refresh panel', async () => {
    const utils = renderPanelView(sampleSavedObjectPanelWithVisualization);
    fireEvent.click(utils.getByTestId('superDatePickerApplyTimeButton'));

    expect(utils.container.firstChild).toMatchSnapshot();
  });

  it('render panel view so container and duplicate dashboard', async () => {
    store.dispatch(setPanelList([sampleSavedObjectPanelWithVisualization]));
    const utils = renderPanelView(sampleSavedObjectPanelWithVisualization);

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

  it('render panel view so container and delete dashboard', async () => {
    store.dispatch(setPanelList([sampleSavedObjectPanelWithVisualization]));
    const utils = renderPanelView(sampleSavedObjectPanelWithVisualization);

    fireEvent.click(utils.getByTestId('panelActionContextMenu'));
    fireEvent.click(utils.getByTestId('deletePanelContextMenuItem'));
    expect(utils.getByTestId('popoverModal__deleteTextInput')).toBeInTheDocument();

    fireEvent.input(utils.getByTestId('popoverModal__deleteTextInput'), {
      target: { value: 'delete' },
    });
    act(() => {
      fireEvent.click(utils.getByTestId('popoverModal__deleteButton'));
    });
    await waitFor(() => {
      expect(coreRefs.http.delete).toBeCalledTimes(1);
    });
  });

  it('render panel view so container and reload dashboard', async () => {
    store.dispatch(setPanelList([sampleSavedObjectPanelWithVisualization]));
    const utils = renderPanelView(sampleSavedObjectPanelWithVisualization);

    fireEvent.click(utils.getByTestId('panelActionContextMenu'));
    fireEvent.click(utils.getByTestId('reloadPanelContextMenuItem'));
    expect(utils.container.firstChild).toMatchSnapshot();
  });
});

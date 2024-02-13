/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { applyMiddleware, createStore } from '@reduxjs/toolkit';
import { fireEvent, render, waitFor, act, cleanup } from '@testing-library/react';
import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { Provider } from 'react-redux';
import thunk from 'redux-thunk';
import { panelBreadCrumbs, panelsData } from '../../../../test/panels_constants';
import { coreRefs } from '../../../framework/core_refs';
import { rootReducer } from '../../../framework/redux/reducers';
import { CustomPanelTable } from '../custom_panel_table';
import { setPanelList } from '../redux/panel_slice';

jest.mock('react-router-dom', () => ({
  useLocation: jest.fn().mockReturnValue({
    pathname: '/operational_panels',
    search: '',
    hash: '',
    state: null,
    key: '',
  }),
  useHistory: jest.fn(),
}));

describe('Panels Table Component', () => {
  configure({ adapter: new Adapter() });
  const store = createStore(rootReducer, applyMiddleware(thunk));
  coreRefs.savedObjectsClient.find = jest.fn(() =>
    Promise.resolve({
      savedObjects: [],
      then: () => Promise.resolve(),
    })
  );
  coreRefs.savedObjectsClient.create = jest
    .fn()
    .mockReturnValue({ operationalPanle: panelsData.panels[0] });
  coreRefs.savedObjectsClient.delete = jest.fn(() =>
    Promise.resolve({
      savedObjects: [],
      then: () => Promise.resolve(),
    })
  );
  coreRefs.http.get = jest.fn().mockReturnValue({ operationalPanel: panelsData.panels[0] });
  coreRefs.http.post = jest.fn();
  coreRefs.http.delete = jest.fn(() =>
    Promise.resolve({
      savedObjects: [],
      then: () => Promise.resolve(),
    })
  );

  const props = {
    loading: false,
    setBreadcrumbs: jest.fn(),
    parentBreadcrumbs: panelBreadCrumbs,
    addSamplePanels: jest.fn(),
  };

  const renderPanelTable = () => {
    const utils = render(
      <Provider store={store}>
        <CustomPanelTable {...props} />
      </Provider>
    );
    return utils;
  };

  afterEach(() => {
    cleanup();
  });

  it('renders empty dashboard table container', async () => {
    const utils = renderPanelTable();

    await waitFor(() => {
      expect(utils.container.firstChild).toMatchSnapshot();
    });
  });

  it('render dashboard table container with panels', async () => {
    store.dispatch(setPanelList(panelsData.panels));
    const utils = renderPanelTable();

    await waitFor(() => {
      expect(utils.container.firstChild).toMatchSnapshot();
    });
  });

  it('create a custom dashboard from empty table view', async () => {
    const utils = renderPanelTable();

    fireEvent.click(utils.getByTestId('customPanels__createNewPanels'));
    await waitFor(() => {
      expect(global.window.location.href).toContain('create');
    });
  });

  it('create a custom dashboard from populated table view', async () => {
    const utils = renderPanelTable();

    fireEvent.click(utils.getByTestId('customPanels__createNewPanels'));
    await waitFor(() => {
      expect(global.window.location.href).toContain('create');
    });
  });

  it('clone a custom dashboard', async () => {
    store.dispatch(setPanelList(panelsData.panels));
    const utils = renderPanelTable();

    fireEvent.click(utils.getAllByLabelText('Select this row')[0]);
    fireEvent.click(utils.getByTestId('operationalPanelsActionsButton'));
    fireEvent.click(utils.getByTestId('duplicateContextMenuItem'));
    expect(utils.getByTestId('customModalFieldText')).toBeInTheDocument();

    fireEvent.input(utils.getByTestId('customModalFieldText'), {
      target: { value: 'copy' },
    });
    act(() => {
      fireEvent.click(utils.getByTestId('runModalButton'));
    });
    await waitFor(() => {
      expect(coreRefs.savedObjectsClient.create).toHaveBeenCalledTimes(1);
    });
  });

  it('rename a custom panel', async () => {
    store.dispatch(setPanelList(panelsData.panels));
    const utils = renderPanelTable();

    fireEvent.click(utils.getAllByLabelText('Select this row')[0]);
    fireEvent.click(utils.getByTestId('operationalPanelsActionsButton'));
    fireEvent.click(utils.getByTestId('renameContextMenuItem'));
    expect(utils.getByTestId('customModalFieldText')).toBeInTheDocument();

    fireEvent.input(utils.getByTestId('customModalFieldText'), {
      target: { value: 'renamed dashboard' },
    });
    act(() => {
      fireEvent.click(utils.getByTestId('runModalButton'));
    });
    await waitFor(() => {
      expect(coreRefs.http?.post).toHaveBeenCalledTimes(1);
    });
  });

  it('delete a custom panel', async () => {
    store.dispatch(setPanelList(panelsData.panels));
    const utils = renderPanelTable();

    fireEvent.click(utils.getAllByLabelText('Select this row')[0]);
    fireEvent.click(utils.getByTestId('operationalPanelsActionsButton'));
    fireEvent.click(utils.getByTestId('deleteContextMenuItem'));
    expect(utils.getByTestId('popoverModal__deleteTextInput')).toBeInTheDocument();

    fireEvent.input(utils.getByTestId('popoverModal__deleteTextInput'), {
      target: { value: 'delete' },
    });
    act(() => {
      fireEvent.click(utils.getByTestId('popoverModal__deleteButton'));
    });
    await waitFor(() => {
      expect(coreRefs.http.delete).toHaveBeenCalledTimes(1);
    });
  });

  it('renders empty panel table container2', async () => {
    const utils = renderPanelTable();
    await waitFor(() => {
      expect(utils.container.firstChild).toMatchSnapshot();
    });
  });
});

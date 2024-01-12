/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { waitFor } from '@testing-library/react';
import { NoResults } from '../explorer/no_results';
import { initialTabId } from '../../../framework/redux/store/shared_state';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../../framework/redux/reducers';
import thunk from 'redux-thunk';

describe('No result component', () => {
  configure({ adapter: new Adapter() });

  it('Renders No result component', async () => {
    const store = createStore(rootReducer, applyMiddleware(thunk));

    const wrapper = mount(
      <Provider store={store}>
        <NoResults tabId={initialTabId} />
      </Provider>
    );

    wrapper.update();

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});

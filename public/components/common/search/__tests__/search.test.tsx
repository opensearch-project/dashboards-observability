/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { applyMiddleware, createStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../../../framework/redux/reducers';
import { Provider } from 'react-redux';
import { Search } from '../search';
import thunk from 'redux-thunk';
import { initialTabId } from '../../../../framework/redux/store/shared_state';

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

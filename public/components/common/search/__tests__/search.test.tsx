/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount, shallow } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { createStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../../../framework/redux/reducers';
import { Provider } from 'react-redux';
import { Search } from '../search';

describe('Explorer Search component', () => {
  configure({ adapter: new Adapter() });
  const store = createStore(rootReducer);

  it('renders basic component', () => {
    const wrapper = mount(
      <Provider store={store}>
        <Search />
      </Provider>
    );
    wrapper.update();
    expect(wrapper).toMatchSnapshot();
  });
});

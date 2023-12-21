/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { waitFor } from '@testing-library/react';
import { createStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../../../framework/redux/reducers';
import { Provider } from 'react-redux';
import { TopMenu } from '../top_menu';

describe('Metrics Top Menu Component', () => {
  configure({ adapter: new Adapter() });
  const store = createStore(rootReducer);

  it('renders Top Menu Component when enabled', async () => {
    const wrapper = mount(
      <Provider store={store}>
        <TopMenu />
      </Provider>
    );
    wrapper.update();

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});

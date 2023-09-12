/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { waitFor } from '@testing-library/react';
import { SearchBar } from '../search_bar';

describe('Search Bar Component', () => {
  configure({ adapter: new Adapter() });

  it('Search Side Bar Component', async () => {
    const wrapper = mount(<SearchBar />);

    wrapper.update();

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});

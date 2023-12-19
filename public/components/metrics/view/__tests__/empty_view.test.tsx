/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitFor } from '@testing-library/react';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import toJson from 'enzyme-to-json';
import React from 'react';
import { EmptyMetricsView } from '../empty_view';

describe('Empty View Component', () => {
  configure({ adapter: new Adapter() });

  it('renders empty view container without metrics', async () => {
    const wrapper = mount(<EmptyMetricsView />);
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

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitFor } from '@testing-library/react';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import toJson from 'enzyme-to-json';
import React from 'react';
import { TEST_VISUALIZATIONS_DATA } from '../../../../../test/event_analytics_constants';
import { Text } from '../text/text';

describe('Text component', () => {
  configure({ adapter: new Adapter() });

  it('Renders text component', async () => {
    const wrapper = mount(<Text visualizations={TEST_VISUALIZATIONS_DATA} />);

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

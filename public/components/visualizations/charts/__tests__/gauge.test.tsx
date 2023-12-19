/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitFor } from '@testing-library/react';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import toJson from 'enzyme-to-json';
import React from 'react';
import {
  GAUGE_TEST_VISUALIZATIONS_DATA,
  LAYOUT_CONFIG,
} from '../../../../../test/event_analytics_constants';
import { Gauge } from '../financial/gauge/gauge';

describe('Gauge component', () => {
  configure({ adapter: new Adapter() });

  it('Renders gauge component', async () => {
    const wrapper = mount(
      <Gauge visualizations={GAUGE_TEST_VISUALIZATIONS_DATA} layout={LAYOUT_CONFIG} config={true} />
    );

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

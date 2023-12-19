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
  LAYOUT_CONFIG,
  METRICS_TEST_VISUALIZATIONS_DATA,
} from '../../../../../test/event_analytics_constants';
import { Metrics } from '../metrics/metrics';

describe('Metrics component', () => {
  configure({ adapter: new Adapter() });

  it('Renders Metrics component', async () => {
    const wrapper = mount(
      <Metrics
        visualizations={METRICS_TEST_VISUALIZATIONS_DATA}
        layout={LAYOUT_CONFIG}
        config={true}
      />
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

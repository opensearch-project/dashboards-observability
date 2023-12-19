/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitFor } from '@testing-library/react';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import toJson from 'enzyme-to-json';
import React from 'react';
import { SAMPLE_VISUALIZATIONS } from '../../../../../../../test/event_analytics_constants';
import { CountDistribution } from '../count_distribution';

describe('Count distribution component', () => {
  configure({ adapter: new Adapter() });

  it('Renders empty count distribution component', async () => {
    const wrapper = mount(<CountDistribution />);

    wrapper.update();

    await waitFor(() => {
      expect(
        toJson(wrapper, {
          mode: 'deep',
        })
      ).toMatchSnapshot();
    });
  });

  it('Renders count distribution component with data', async () => {
    const wrapper = mount(<CountDistribution countDistribution={SAMPLE_VISUALIZATIONS} />);

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

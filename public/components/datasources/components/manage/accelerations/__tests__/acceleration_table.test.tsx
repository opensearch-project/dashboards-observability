/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { AccelerationTable } from '../acceleration_table';

import React from 'react';
import { dummyAccelerations } from '../../../../../../../test/datasources';
import * as Plugin from '../../../../../../plugin';

describe('Acceleration Table Test', () => {
  configure({ adapter: new Adapter() });

  Plugin.getRenderAccelerationDetailsFlyout = jest.fn();

  it('Render empty acceleration table', () => {
    const wrapper = mount(<AccelerationTable accelerations={[]} />);

    expect(wrapper).toMatchSnapshot();
  });

  it('Render acceleration table with dummy acceleration', () => {
    const wrapper = mount(<AccelerationTable accelerations={dummyAccelerations} />);

    expect(wrapper).toMatchSnapshot();
  });
});

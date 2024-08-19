/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitFor } from '@testing-library/dom';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import _ from 'lodash';
import React from 'react';
import { DataSourcePicker } from '../mode_picker';

describe('Mode picker component', () => {
  configure({ adapter: new Adapter() });
  const modes = [
    { id: 'jaeger', title: 'Jaeger' },
    { id: 'data_prepper', title: 'Data Prepper' },
  ];

  it('renders mode picker', async () => {
    const setMode = jest.fn()
    const wrapper = mount(
        <DataSourcePicker modes={modes} selectedMode={'jaeger'} setMode={setMode} />
    );

    expect(wrapper).toMatchSnapshot();
    wrapper.find('EuiSmallButtonEmpty[className="dscIndexPattern__triggerButton"]').simulate('click');
    expect(wrapper).toMatchSnapshot();
  });
});

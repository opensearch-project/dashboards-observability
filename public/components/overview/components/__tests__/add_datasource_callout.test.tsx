/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { AddDataSourceCallout } from '../add_datasource_callout';

describe('Add dashboard callout', () => {
  configure({ adapter: new Adapter() });

  const wrapper = mount(<AddDataSourceCallout />);

  it('renders add datasource callout', async () => {
    expect(wrapper).toMatchSnapshot();
  });
});

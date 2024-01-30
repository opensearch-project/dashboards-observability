/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { NoAccess } from '../no_access';

describe('No access test', () => {
  configure({ adapter: new Adapter() });

  it('Renders no access view of data source', async () => {
    const wrapper = mount(<NoAccess />);

    expect(wrapper).toMatchSnapshot();
  });
});

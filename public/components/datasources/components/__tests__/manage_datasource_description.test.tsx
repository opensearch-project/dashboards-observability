/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { waitFor } from '@testing-library/react';
import React from 'react';
import { DataConnectionsDescription } from '../manage_datasource_description';

describe('Manage Datasource Description test', () => {
  configure({ adapter: new Adapter() });

  it('Renders manage datasource description', async () => {
    const wrapper = mount(<DataConnectionsDescription />);

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});

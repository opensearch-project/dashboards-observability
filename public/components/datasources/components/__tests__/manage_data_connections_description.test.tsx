/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { waitFor } from '@testing-library/react';
import React from 'react';
import { DataConnectionsDescription } from '../manage/manage_data_connections_description';

describe('Manage Data Connections Description test', () => {
  configure({ adapter: new Adapter() });

  it('Renders manage data connections description', async () => {
    const wrapper = mount(<DataConnectionsDescription refresh={() => {}} />);

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});

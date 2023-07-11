/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { waitFor } from '@testing-library/react';
import { IntegrationHeader } from '../integration_header';

describe('Integration Header Test', () => {
  configure({ adapter: new Adapter() });

  it('Renders integration header as expected', async () => {
    const wrapper = mount(<IntegrationHeader />);

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});

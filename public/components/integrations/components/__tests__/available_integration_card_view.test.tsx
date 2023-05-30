/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { waitFor } from '@testing-library/react';
import { AvailableIntegrationsCardView } from '../available_integration_card_view';
import { data } from './testing_constants';

describe('Integration Header Test', () => {
  configure({ adapter: new Adapter() });

  it('Renders integration header as expected', async () => {
    const wrapper = mount(AvailableIntegrationsCardView(data));

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});

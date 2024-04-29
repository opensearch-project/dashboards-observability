/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { waitFor } from '@testing-library/react';
import { SetupIntegrationPage } from '../setup_integration';
import { TEST_INTEGRATION_CONFIG } from '../../../../../test/constants';

describe('Integration Setup Page', () => {
  configure({ adapter: new Adapter() });

  it('Renders integration setup page as expected', async () => {
    const wrapper = mount(<SetupIntegrationPage integration={TEST_INTEGRATION_CONFIG.name} />);

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { waitFor } from '@testing-library/react';
import { SetupIntegrationStepsPage } from '../setup_integration';

describe('Integration Setup Page Test', () => {
  configure({ adapter: new Adapter() });

  it('Renders integration setup page as expected', async () => {
    const wrapper = mount(<SetupIntegrationStepsPage />);

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});

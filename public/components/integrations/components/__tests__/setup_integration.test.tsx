/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { waitFor } from '@testing-library/react';
import {
  IntegrationConfig,
  SetupIntegrationPage,
  SetupIntegrationForm,
} from '../setup_integration';

const TEST_CONFIG: IntegrationConfig = {
  displayName: 'Test Instance Name',
  connectionType: 'index',
  connectionDataSource: 'ss4o_logs-nginx-test',
};

describe('Integration Setup Page', () => {
  configure({ adapter: new Adapter() });

  it('Renders integration setup page as expected', async () => {
    const wrapper = mount(<SetupIntegrationPage integration="test_integration" />);

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });

  it('Renders the form as expected', async () => {
    const wrapper = mount(<SetupIntegrationForm config={TEST_CONFIG} updateConfig={() => {}} />);

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});

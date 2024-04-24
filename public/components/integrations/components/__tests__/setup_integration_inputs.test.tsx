/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { waitFor } from '@testing-library/react';
import { SetupIntegrationFormInputs } from '../setup_integration_inputs';
import {
  TEST_INTEGRATION_CONFIG,
  TEST_INTEGRATION_SETUP_INPUTS,
} from '../../../../../test/constants';

describe('Integration Setup Inputs', () => {
  configure({ adapter: new Adapter() });

  it('Renders the index form as expected', async () => {
    const wrapper = mount(
      <SetupIntegrationFormInputs
        config={TEST_INTEGRATION_SETUP_INPUTS}
        updateConfig={() => {}}
        integration={TEST_INTEGRATION_CONFIG}
        setupCallout={{ show: false }}
      />
    );

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });

  it('Renders the S3 connector form as expected', async () => {
    const wrapper = mount(
      <SetupIntegrationFormInputs
        config={{ ...TEST_INTEGRATION_SETUP_INPUTS, connectionType: 's3' }}
        updateConfig={() => {}}
        integration={TEST_INTEGRATION_CONFIG}
        setupCallout={{ show: false }}
      />
    );

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });

  it('Renders the S3 connector form without workflows', async () => {
    const wrapper = mount(
      <SetupIntegrationFormInputs
        config={{ ...TEST_INTEGRATION_SETUP_INPUTS, connectionType: 's3' }}
        updateConfig={() => {}}
        integration={{ ...TEST_INTEGRATION_CONFIG, workflows: undefined }}
        setupCallout={{ show: false }}
      />
    );

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});

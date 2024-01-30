/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { waitFor } from '@testing-library/react';
import { AddIntegrationFlyout } from '../add_integration_flyout';
import React from 'react';
import { HttpSetup } from '../../../../../../../src/core/public';

describe('Add Integration Flyout Test', () => {
  configure({ adapter: new Adapter() });

  it('Renders add integration flyout with dummy integration name', async () => {
    const wrapper = mount(
      <AddIntegrationFlyout
        onClose={jest.fn}
        onCreate={jest.fn}
        integrationName="test"
        integrationType="test"
        http={
          ({
            get: jest.fn(),
            post: jest.fn(),
          } as Partial<HttpSetup>) as HttpSetup
        }
      />
    );

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});

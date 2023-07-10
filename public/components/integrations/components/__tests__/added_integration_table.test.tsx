/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { waitFor } from '@testing-library/react';
import { AddedIntegrationsTable } from '../added_integration_table';
import { addedIntegrationData } from './testing_constants';
import React from 'react';

describe('Added Integration Table View Test', () => {
  configure({ adapter: new Adapter() });

  it('Renders added integration table view using dummy data', async () => {
    const wrapper = mount(<AddedIntegrationsTable {...addedIntegrationData} />);

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});

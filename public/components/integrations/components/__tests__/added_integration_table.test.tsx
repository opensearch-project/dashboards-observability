/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitFor } from '@testing-library/react';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { AddedIntegrationsTable } from '../added_integration_table';
import { addedIntegrationData, addedIntegrationDataWithoutMDS } from './testing_constants';

describe('Added Integration Table View Test', () => {
  configure({ adapter: new Adapter() });

  it('Renders added integration table view using dummy data', async () => {
    const wrapper = mount(<AddedIntegrationsTable {...addedIntegrationData} />);

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });

  it('Renders added integration table view using dummy data when MDS is disabled', async () => {
    const wrapper = mount(<AddedIntegrationsTable {...addedIntegrationDataWithoutMDS} />);

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});

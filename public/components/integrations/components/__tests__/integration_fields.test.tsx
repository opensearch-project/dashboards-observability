/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { waitFor } from '@testing-library/react';
import { IntegrationFields } from '../integration_fields_panel';
import { nginxIntegrationData } from './testing_constants';

describe('Available Integration Table View Test', () => {
  configure({ adapter: new Adapter() });

  it('Renders nginx integration table view using dummy data', async () => {
    const wrapper = mount(IntegrationFields(nginxIntegrationData));

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});

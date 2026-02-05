/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import { IntegrationFields } from '../integration_fields_panel';
import { nginxIntegrationData } from './testing_constants';

describe('Available Integration Table View Test', () => {
  it('Renders nginx integration table view using dummy data', async () => {
    render(IntegrationFields(nginxIntegrationData));

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

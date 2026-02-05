/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import { IntegrationDetails } from '../integration_details_panel';
import { nginxIntegrationData } from './testing_constants';

describe('Available Integration Table View Test', () => {
  it('Renders nginx integration table view using dummy data', async () => {
    render(IntegrationDetails(nginxIntegrationData));

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

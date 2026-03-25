/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { AddedIntegrationsTable } from '../added_integration_table';
import { addedIntegrationData, addedIntegrationDataWithoutMDS } from './testing_constants';

describe('Added Integration Table View Test', () => {
  it('Renders added integration table view using dummy data', async () => {
    render(<AddedIntegrationsTable {...addedIntegrationData} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('Renders added integration table view using dummy data when MDS is disabled', async () => {
    render(<AddedIntegrationsTable {...addedIntegrationDataWithoutMDS} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

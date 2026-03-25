/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import { AvailableIntegrationsTable } from '../available_integration_table';
import { availableTableViewData } from './testing_constants';
import React from 'react';

describe('Available Integration Table View Test', () => {
  it('Renders nginx integration table view using dummy data', async () => {
    render(<AvailableIntegrationsTable {...availableTableViewData} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

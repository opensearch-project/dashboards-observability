/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { Filters } from '../filters';

describe('Filter component', () => {
  it('renders filters', async () => {
    const setFilters = jest.fn();
    render(<Filters page="dashboard" filters={[]} setFilters={setFilters} appConfigs={[]} />);
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

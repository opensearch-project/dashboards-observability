/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { EmptyMetricsView } from '../empty_view';

describe('Empty View Component', () => {
  it('renders empty view container without metrics', async () => {
    render(<EmptyMetricsView />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { AddDashboardCallout } from '../add_dashboard_callout';

describe('Add dashboard callout', () => {
  it('renders add dashboard callout', async () => {
    render(<AddDashboardCallout />);
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

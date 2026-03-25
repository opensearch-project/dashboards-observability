/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { AddDataSourceCallout } from '../add_datasource_callout';

describe('Add dashboard callout', () => {
  it('renders add datasource callout', async () => {
    render(<AddDataSourceCallout />);
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

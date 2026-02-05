/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { IntegrationHeader } from '../integration_header';

describe('Integration Header Test', () => {
  it('Renders integration header as expected', async () => {
    render(<IntegrationHeader />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

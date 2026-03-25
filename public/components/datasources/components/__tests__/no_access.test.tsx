/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { NoAccess } from '../no_access';

describe('No access test', () => {
  it('Renders no access view of data source', async () => {
    render(<NoAccess />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

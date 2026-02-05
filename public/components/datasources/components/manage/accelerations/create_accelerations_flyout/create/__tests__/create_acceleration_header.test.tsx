/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { CreateAccelerationHeader } from '../create_acceleration_header';

describe('Acceleration header', () => {
  it('renders acceleration flyout header', async () => {
    render(<CreateAccelerationHeader />);
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

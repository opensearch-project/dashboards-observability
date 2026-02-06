/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { SetupIntegrationPage } from '../setup_integration';
import { TEST_INTEGRATION_CONFIG } from '../../../../../test/constants';

describe('Integration Setup Page', () => {
  it('Renders integration setup page as expected', async () => {
    render(<SetupIntegrationPage integration={TEST_INTEGRATION_CONFIG.name} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

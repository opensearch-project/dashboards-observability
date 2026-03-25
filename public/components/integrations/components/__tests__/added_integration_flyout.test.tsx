/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import { AddIntegrationFlyout } from '../add_integration_flyout';
import React from 'react';
import { HttpSetup } from '../../../../../../../src/core/public';

describe('Add Integration Flyout Test', () => {
  it('Renders add integration flyout with dummy integration name', async () => {
    render(
      <AddIntegrationFlyout
        onClose={jest.fn}
        onCreate={jest.fn}
        integrationName="test"
        integrationType="test"
        http={
          ({
            get: jest.fn(),
            post: jest.fn(),
          } as Partial<HttpSetup>) as HttpSetup
        }
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

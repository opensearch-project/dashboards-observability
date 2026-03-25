/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import { AddedIntegration } from '../added_integration';
import { testIntegrationInstanceData } from './testing_constants';
import React from 'react';

describe('Added Integration View Test', () => {
  let mockChrome: any;
  let mockHttp: any;
  const instanceId: string = '6b3b8010-015a-11ee-8bf8-9f447e9961b0';

  beforeEach(() => {
    // Create mock instances for each test
    mockChrome = {
      setBreadcrumbs: jest.fn(),
    };
    mockHttp = {
      get: jest.fn().mockResolvedValue({ data: testIntegrationInstanceData }),
    };
  });

  it('Renders added integration view using dummy data', async () => {
    render(
      <AddedIntegration
        chrome={mockChrome}
        http={mockHttp}
        integrationInstanceId={instanceId}
        parentBreadcrumbs={[]}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

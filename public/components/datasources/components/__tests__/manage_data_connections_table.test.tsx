/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, act } from '@testing-library/react';
import React from 'react';
import { ManageDataConnectionsTable } from '../manage/manage_data_connections_table';
import { showDataConnectionsData } from '../../../../../test/datasources';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: () => ({
    pathname: '/manage',
  }),
}));

jest.mock('../../../../plugin', () => ({
  getRenderCreateAccelerationFlyout: jest.fn(() => jest.fn()),
}));

describe('Manage Data Connections Table test', () => {
  it('Renders manage data connections table with data', async () => {
    const http = {
      get: jest.fn().mockResolvedValue(showDataConnectionsData),
    };
    const pplService = {
      fetch: jest.fn().mockResolvedValue(showDataConnectionsData),
    };
    const mockChrome = {
      setBreadcrumbs: jest.fn(),
    };
    let container: HTMLElement;
    await act(async () => {
      const result = render(
        <ManageDataConnectionsTable http={http} pplService={pplService} chrome={mockChrome} />
      );
      container = result.container;
    });
    expect(container!).toMatchSnapshot();
  });
});

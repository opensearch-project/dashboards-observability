/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { act } from '@testing-library/react';
import React from 'react';
import { ManageDataConnectionsTable } from '../manage/manage_data_connections_table';
import { showDataConnectionsData } from '../../../../../test/datasources';
import ReactDOM from 'react-dom';

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
  configure({ adapter: new Adapter() });

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
    const container = document.createElement('div');
    await act(() => {
      ReactDOM.render(
        <ManageDataConnectionsTable http={http} pplService={pplService} chrome={mockChrome} />,
        container
      );
    });
    expect(container).toMatchSnapshot();
  });
});

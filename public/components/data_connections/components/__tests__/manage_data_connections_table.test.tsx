/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { act } from '@testing-library/react';
import React from 'react';
import { ManageDataConnectionsTable } from '../manage_data_connections_table';
import { showDataConnectionsData } from './testing_constants';
import ReactDOM from 'react-dom';
import { coreRefs } from '../../../../../public/framework/core_refs';

jest.mock('../../../../../public/framework/core_refs', () => ({
  coreRefs: {
    chrome: {
      setBreadcrumbs: jest.fn(),
    },
    http: {
      get: jest.fn().mockResolvedValue(showDataConnectionsData),
    },
  },
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

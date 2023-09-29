/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { act } from '@testing-library/react';
import React from 'react';
import { ManageDatasourcesTable } from '../manage_datasource_table';
import { showDatasourceData } from './testing_constants';
import ReactDOM from 'react-dom';

describe('Manage Datasource Table test', () => {
  configure({ adapter: new Adapter() });

  it('Renders manage datasource table with data', async () => {
    const http = {
      get: jest.fn().mockResolvedValue(showDatasourceData),
    };
    const pplService = {
      fetch: jest.fn(),
    };
    const mockChrome = {
      setBreadcrumbs: jest.fn(),
    };
    const container = document.createElement('div');
    await act(() => {
      ReactDOM.render(
        <ManageDatasourcesTable http={http} pplService={pplService} chrome={mockChrome} />,
        container
      );
    });
    expect(container).toMatchSnapshot();
  });
});

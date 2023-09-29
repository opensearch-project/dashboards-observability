/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { act, waitFor } from '@testing-library/react';
import React from 'react';
import { DataConnectionsDescription } from '../manage_datasource_description';
import { ManageDatasourcesTable } from '../manage_datasource_table';
import { describeDatasource, showDatasourceData } from './testing_constants';
import { DataSource } from '../datasource';
import ReactDOM from 'react-dom';

describe('Datasource Page test', () => {
  configure({ adapter: new Adapter() });

  it('Renders datasource page with data', async () => {
    const http = {
      get: jest.fn().mockResolvedValue(describeDatasource),
    };
    const pplService = {
      fetch: jest.fn(),
    };
    const mockChrome = {
      setBreadcrumbs: jest.fn(),
    };
    const wrapper = mount(<DataSource http={http} pplService={pplService} chrome={mockChrome} />);
    const container = document.createElement('div');
    await act(() => {
      ReactDOM.render(
        <DataSource http={http} pplService={pplService} chrome={mockChrome} />,
        container
      );
    });
    expect(container).toMatchSnapshot();
  });
});

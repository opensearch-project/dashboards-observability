/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { act, waitFor } from '@testing-library/react';
import React from 'react';
import { describeDataConnection } from './testing_constants';
import { DataConnection } from '../data_connection';
import ReactDOM from 'react-dom';

describe('Data Connection Page test', () => {
  configure({ adapter: new Adapter() });

  it('Renders data connection page with data', async () => {
    const http = {
      get: jest.fn().mockResolvedValue(describeDataConnection),
    };
    const pplService = {
      fetch: jest.fn(),
    };
    const mockChrome = {
      setBreadcrumbs: jest.fn(),
    };
    const wrapper = mount(
      <DataConnection http={http} pplService={pplService} chrome={mockChrome} />
    );
    const container = document.createElement('div');
    await act(() => {
      ReactDOM.render(
        <DataConnection http={http} pplService={pplService} chrome={mockChrome} />,
        container
      );
    });
    expect(container).toMatchSnapshot();
  });
});

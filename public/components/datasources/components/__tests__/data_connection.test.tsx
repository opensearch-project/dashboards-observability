/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { act } from '@testing-library/react';
import React from 'react';
import { describeDataConnection, mockRoleData } from '../../../../../test/datasources';
import { DataConnection } from '../manage/data_connection';
import ReactDOM from 'react-dom';

jest.mock('../../../../../public/framework/core_refs', () => ({
  coreRefs: {
    chrome: {
      setBreadcrumbs: jest.fn(),
    },
    http: {
      get: jest.fn().mockResolvedValue(describeDataConnection),
    },
  },
}));

describe('Data Connection Page test', () => {
  configure({ adapter: new Adapter() });

  it('Renders data connection page with data', async () => {
    const pplService = {
      fetch: jest.fn(),
    };
    const container = document.createElement('div');
    await act(() => {
      ReactDOM.render(<DataConnection pplService={pplService} />, container);
    });
    expect(container).toMatchSnapshot();
  });
});

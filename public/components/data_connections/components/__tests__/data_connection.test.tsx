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
    const wrapper = mount(<DataConnection pplService={pplService} />);
    const container = document.createElement('div');
    await act(() => {
      ReactDOM.render(<DataConnection pplService={pplService} />, container);
    });
    expect(container).toMatchSnapshot();
  });
});

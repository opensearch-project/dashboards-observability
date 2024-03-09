/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { act } from '@testing-library/react';
import React from 'react';
import {
  describePrometheusDataConnection,
  describeS3Dataconnection,
} from '../../../../../test/datasources';
import { DataConnection } from '../manage/data_connection';
import ReactDOM from 'react-dom';
import { coreRefs } from '../../../../../public/framework/core_refs';

jest.mock('../../../../plugin', () => ({
  getRenderAccelerationDetailsFlyout: jest.fn(() =>
    jest.fn().mockImplementation(() => console.log('Acceleration Details Flyout Rendered'))
  ),
  getRenderAssociatedObjectsDetailsFlyout: jest.fn(() =>
    jest.fn().mockImplementation(() => console.log('Associated Objects Details Flyout Rendered'))
  ),
}));

jest.mock('../../../../../public/framework/core_refs', () => ({
  coreRefs: {
    chrome: {
      setBreadcrumbs: jest.fn(),
    },
    http: {
      get: jest.fn(),
    },
  },
}));
jest.useFakeTimers().setSystemTime(new Date('2024-01-01'));

describe('Data Connection Page test', () => {
  configure({ adapter: new Adapter() });

  beforeEach(() => {
    // Clear the mock implementation before each test
    (coreRefs.http!.get as jest.Mock).mockClear();
  });

  it('Renders Prometheus data connection page with data', async () => {
    const pplService = {
      fetch: jest.fn(),
    };
    const container = document.createElement('div');
    (coreRefs.http!.get as jest.Mock).mockResolvedValue(describePrometheusDataConnection);
    await act(() => {
      ReactDOM.render(<DataConnection pplService={pplService} />, container);
    });
    expect(container).toMatchSnapshot();
  });

  it('Renders S3 data connection page with data', async () => {
    const pplService = {
      fetch: jest.fn(),
    };
    const container = document.createElement('div');
    (coreRefs.http!.get as jest.Mock).mockResolvedValue(describeS3Dataconnection);
    await act(() => {
      ReactDOM.render(<DataConnection pplService={pplService} />, container);
    });
    expect(container).toMatchSnapshot();
  });
});

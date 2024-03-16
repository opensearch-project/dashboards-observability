/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from '@testing-library/react';
import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import ReactDOM from 'react-dom';
import { coreRefs } from '../../../../../public/framework/core_refs';
import { describePrometheusDataConnection } from '../../../../../test/datasources';
import { DatasourceDetails } from '../manage/data_connection';
import { InactiveDataConnectionCallout } from '../manage/inactive_data_connection';

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

describe('Data Connection Inactive Page test', () => {
  configure({ adapter: new Adapter() });

  beforeEach(() => {
    // Clear the mock implementation before each test
    (coreRefs.http!.get as jest.Mock).mockClear();
  });

  it('Renders inactive data connection callout', async () => {
    const mockDatasourceDetails: DatasourceDetails = {
      allowedRoles: [],
      name: '',
      description: '',
      connector: 'PROMETHEUS',
      properties: { 'prometheus.uri': 'placeholder' },
      status: 'DISABLED',
    };

    const container = document.createElement('div');
    (coreRefs.http!.get as jest.Mock).mockResolvedValue(describePrometheusDataConnection);
    await act(() => {
      ReactDOM.render(
        <InactiveDataConnectionCallout
          datasourceDetails={mockDatasourceDetails}
          fetchSelectedDatasource={jest.fn()}
        />,
        container
      );
    });
    expect(container).toMatchSnapshot();
  });
});

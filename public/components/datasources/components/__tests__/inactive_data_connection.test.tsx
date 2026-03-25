/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
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

    (coreRefs.http!.get as jest.Mock).mockResolvedValue(describePrometheusDataConnection);
    render(
      <InactiveDataConnectionCallout
        datasourceDetails={mockDatasourceDetails}
        fetchSelectedDatasource={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

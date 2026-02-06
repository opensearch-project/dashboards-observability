/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import {
  testPrometheusConnectionDetails,
  testS3ConnectionDetails,
} from '../../../../../test/datasources';
import { ConnectionDetails } from '../manage/connection_details';

describe('Connection Details test', () => {
  it('Renders connection details for s3 datasource', async () => {
    render(<ConnectionDetails {...testS3ConnectionDetails} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('Renders connection details for prometheus datasource', async () => {
    render(<ConnectionDetails {...testPrometheusConnectionDetails} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

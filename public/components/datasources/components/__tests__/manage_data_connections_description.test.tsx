/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { DataConnectionsDescription } from '../manage/manage_data_connections_description';

describe('Manage Data Connections Description test', () => {
  it('Renders manage data connections description', async () => {
    render(<DataConnectionsDescription refresh={() => {}} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { FlyoutButton } from '../docViewRow';

describe('Datagrid Doc viewer row component', () => {
  it('Renders Doc viewer row component', async () => {
    const hit = {
      Carrier: 'JetBeats',
      'avg(FlightDelayMin)': '45.957544288332315',
    };
    const selectedCols = [
      {
        name: 'avg(FlightDelayMin)',
        type: 'double',
      },
    ];

    render(<FlyoutButton doc={hit} selectedCols={selectedCols} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

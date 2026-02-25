/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { DocViewer } from '../docViewer';

describe('Datagrid Doc viewer component', () => {
  it('Renders Doc viewer component', async () => {
    const hit = {
      Carrier: 'JetBeats',
      'avg(FlightDelayMin)': '45.957544288332315',
    };

    render(<DocViewer hit={hit} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

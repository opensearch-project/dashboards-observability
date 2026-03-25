/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { JsonCodeBlock } from '../json_code_block';

describe('Doc viewer JSON block component', () => {
  it('Renders JSON block component', async () => {
    const hit = {
      Carrier: 'JetBeats',
      'avg(FlightDelayMin)': '45.957544288332315',
    };

    render(<JsonCodeBlock hit={hit} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

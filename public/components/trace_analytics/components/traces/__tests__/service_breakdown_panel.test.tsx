/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { ServiceBreakdownPanel } from '../service_breakdown_panel';

describe('Service breakdown panel component', () => {
  it('renders empty service breakdown panel', async () => {
    render(<ServiceBreakdownPanel data={[]} />);
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders service breakdown panel', async () => {
    const data = [
      {
        values: [100],
        labels: ['inventory'],
        marker: { colors: ['#7492e7'] },
        type: 'pie',
        textinfo: 'none',
        hovertemplate: '%{label}<br>%{value:.2f}%<extra></extra>',
      },
    ] as Plotly.Data[];
    render(<ServiceBreakdownPanel data={data} />);
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

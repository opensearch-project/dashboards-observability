/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { ErrorRatePlt } from '../error_rate_plt';

describe('Error rate plot component', () => {
  it('renders error rate plot', async () => {
    const setStartTime = jest.fn();
    const setEndTime = jest.fn();
    const items = {
      items: [
        {
          x: [1576800000000],
          y: [22.22],
          marker: {
            color: '#fad963',
          },
          type: 'bar',
          text: ['Dec 19, 2019 16:00:00 - Dec 18, 2020 16:00:00'],
          hoverlabel: {
            align: 'left',
          },
          hovertemplate: '%{text}<br>Error rate: %{y}<extra></extra>',
        },
      ] as Plotly.Data[],
      fixedInterval: '365d',
    };
    render(<ErrorRatePlt items={items} setStartTime={setStartTime} setEndTime={setEndTime} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

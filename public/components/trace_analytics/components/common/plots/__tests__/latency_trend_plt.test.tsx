/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { LatencyPlt, LinePlt } from '../latency_trend_plt';

describe('Latency trend plot component', () => {
  it('renders line plot with multiple points', async () => {
    const data = [
      {
        x: [1605027600000, 1605027700000],
        y: [78.16, 100],
        type: 'scatter',
        mode: 'lines',
        hoverinfo: 'none',
        line: {
          color: '#000000',
          width: 1,
        },
      },
    ] as Plotly.Data[];
    render(<LinePlt data={data} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders line plot with single point', async () => {
    const data = [
      {
        x: [1605027600000],
        y: [78.16],
        type: 'scatter',
        mode: 'lines',
        hoverinfo: 'none',
        line: {
          color: '#000000',
          width: 1,
        },
      },
    ] as Plotly.Data[];
    render(<LinePlt data={data} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders latency plot', async () => {
    const data = [
      {
        x: [1605027600000],
        y: [284.47],
        type: 'scatter',
        mode: 'lines+markers',
        hovertemplate: '%{x}<br>Average latency: %{y}<extra></extra>',
        hoverlabel: {
          bgcolor: '#d7c2ff',
        },
        marker: {
          color: '#987dcb',
          size: 8,
        },
        line: {
          color: '#987dcb',
        },
      },
    ] as Plotly.Data[];
    render(<LatencyPlt data={data} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});

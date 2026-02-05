/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { LatencyTrendCell } from '../latency_trend_cell';

describe('Latency trend cell component', () => {
  it('renders latency trend cell', async () => {
    const item = JSON.parse(
      `{"trendData":[{"x":[1605027600000],"y":[154.71],"type":"scatter","mode":"lines","hoverinfo":"none","line":{"color":"#000000","width":1}}],"popoverData":[{"x":[1605027600000],"y":[154.71],"type":"scatter","mode":"lines+markers","hovertemplate":"%{x}<br>Average latency: %{y}<extra></extra>","hoverlabel":{"bgcolor":"#d7c2ff"},"marker":{"color":"#987dcb","size":8},"line":{"color":"#987dcb","size":2}}]}`
    );
    render(<LatencyTrendCell item={item} traceGroupName="order" />);
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });

    const openButton = screen.getByLabelText('Open popover');
    fireEvent.click(openButton);
    const closeButton = screen.getByLabelText('Close popover');
    fireEvent.click(closeButton);
  });
});

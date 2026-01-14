/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiLoadingChart, EuiText } from '@elastic/eui';
import { Plt } from '../../../visualizations/plotly/plot';

export interface MetricDataPoint {
  timestamp: number;
  value: number;
}

interface MetricSparklineProps {
  data: MetricDataPoint[];
  isLoading?: boolean;
  isError?: boolean;
  color?: string;
  height?: number;
  width?: number;
}

/**
 * MetricSparkline - Lightweight inline sparkline chart for metrics
 *
 * Renders a minimal Plotly chart with no axes or interactivity.
 * Shows loading chart, "-" for errors/empty data, or the sparkline.
 *
 * @param data - Array of metric data points with timestamp and value
 * @param isLoading - Show loading chart
 * @param isError - Show error state ("-")
 * @param color - Line color (default: #54B399 - OUI vis color)
 * @param height - Chart height in pixels (default: 20)
 * @param width - Chart width in pixels (optional, defaults to 100%)
 */
export const MetricSparkline: React.FC<MetricSparklineProps> = ({
  data,
  isLoading = false,
  isError = false,
  color = '#54B399',
  height = 20,
  width,
}) => {
  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height,
    width: width ? `${width}px` : '100%',
  };

  if (isLoading) {
    return (
      <div style={containerStyle}>
        <EuiLoadingChart size="m" mono />
      </div>
    );
  }

  if (isError || !data || data.length === 0) {
    return (
      <div style={containerStyle}>
        <EuiText size="xs" color="subdued">
          -
        </EuiText>
      </div>
    );
  }

  // Transform data for Plotly
  const plotData = [
    {
      x: data.map((d) => new Date(d.timestamp * 1000)),
      y: data.map((d) => d.value),
      type: 'scatter',
      mode: 'lines',
      line: {
        color,
        width: 1.5,
      },
      hoverinfo: 'y',
      showlegend: false,
    },
  ];

  const layout: Record<string, any> = {
    margin: { l: 0, r: 0, t: 0, b: 0 },
    xaxis: {
      visible: false,
      showgrid: false,
    },
    yaxis: {
      visible: false,
      showgrid: false,
    },
    showlegend: false,
    height,
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
  };

  if (width) {
    layout.width = width;
  }

  const config = {
    displayModeBar: false,
    staticPlot: true, // Disable interactivity for performance
  };

  return (
    <div style={{ width: width ? `${width}px` : '100%', height: `${height}px` }}>
      <Plt data={plotData} layout={layout} config={config} />
    </div>
  );
};

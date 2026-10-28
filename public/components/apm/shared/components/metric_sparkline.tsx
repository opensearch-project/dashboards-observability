/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect } from 'react';
import { EuiLoadingChart, EuiText } from '@elastic/eui';
import * as echarts from 'echarts';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { APM_CONSTANTS } from '../../common/constants';

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

// Helper to convert hex color to RGB components
const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
};

/**
 * MetricSparkline - Lightweight inline sparkline chart for metrics
 *
 * Renders a minimal ECharts chart with gradient fill and no axes or interactivity.
 * Shows loading chart, "-" for errors/empty data, or the sparkline (a single point as a dot).
 *
 * @param data - Array of metric data points with timestamp and value
 * @param isLoading - Show loading chart
 * @param isError - Show error state ("-")
 * @param color - Line color (default: euiColorVis0 - theme-aware)
 * @param height - Chart height in pixels (default: 20)
 * @param width - Chart width in pixels (optional, defaults to 100%)
 */
export const MetricSparkline: React.FC<MetricSparklineProps> = ({
  data,
  isLoading = false,
  isError = false,
  color = euiThemeVars.euiColorVis0,
  height = 20,
  width,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    if (!chartRef.current || isLoading || isError || !data || data.length === 0) {
      // The chart div is unmounted in these states; drop the instance bound to it so the next
      // data renders into the new div instead of a detached one.
      chartInstance.current?.dispose();
      chartInstance.current = null;
      return;
    }

    // Initialize chart if not already created
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    const rgb = hexToRgb(color) || { r: 84, g: 179, b: 153 };
    // A line needs two points. A single point (e.g. a long range over a few minutes of data,
    // where one step spans all of it) draws as a centered dot, so "a little data" still looks
    // different from "no data".
    const singlePoint = data.length === 1;

    const option: echarts.EChartsOption = {
      grid: {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
      },
      xAxis: {
        type: 'category',
        show: false,
        data: data.map((d) => d.timestamp),
        boundaryGap: singlePoint,
      },
      yAxis: {
        type: 'value',
        show: false,
      },
      tooltip: {
        show: false, // Add this - disables tooltip
      },
      series: [
        {
          type: 'line',
          data: data.map((d) => d.value),
          smooth: true,
          symbol: singlePoint ? 'circle' : 'none',
          symbolSize: APM_CONSTANTS.SPARKLINE_POINT_SYMBOL_SIZE,
          itemStyle: { color },
          lineStyle: {
            color,
            width: 1.5,
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)` },
              { offset: 1, color: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)` },
            ]),
          },
          emphasis: {
            disabled: true,
          },
          silent: true,
        },
      ],
    };

    chartInstance.current.setOption(option);
  }, [data, color, isLoading, isError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      chartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height,
    width: width ? `${width}px` : '100%',
  };

  // Distinct keys per state: echarts draws its canvas into the chart div outside React, so if
  // React reused that div for the "-" placeholder (e.g. a table row whose service changed after
  // filtering or paging), the previous service's chart would stay visible next to the "-".
  if (isLoading) {
    return (
      <div key="loading" style={containerStyle}>
        <EuiLoadingChart size="m" mono />
      </div>
    );
  }

  if (isError || !data || data.length === 0) {
    return (
      <div key="empty" style={containerStyle}>
        <EuiText size="xs" color="subdued">
          -
        </EuiText>
      </div>
    );
  }

  return (
    <div
      key="chart"
      ref={chartRef}
      style={{ width: width ? `${width}px` : '100%', height: `${height}px` }}
    />
  );
};

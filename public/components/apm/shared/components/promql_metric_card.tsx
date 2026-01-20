/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useMemo, useState } from 'react';
import { EuiLoadingChart, EuiPanel, EuiIcon } from '@elastic/eui';
import * as echarts from 'echarts';
import { usePromQLChartData } from '../hooks/use_promql_chart_data';
import { TimeRange, MetricDataPoint } from '../../common/types/service_details_types';
import { APM_CONSTANTS, SERVICE_DETAILS_CONSTANTS } from '../../common/constants';
import './promql_metric_card.scss';

export interface PromQLMetricCardProps {
  title: string;
  subtitle?: string;
  promqlQuery: string;
  timeRange: TimeRange;
  prometheusConnectionId: string;
  height?: number;
  invertColor?: boolean; // true = increase is bad (red), false = increase is good (green)
  formatValue?: (value: number) => string;
  refreshTrigger?: number;
}

/**
 * PromQLMetricCard - Displays a metric value with background sparkline chart
 *
 * Design:
 * - Title at top (bold)
 * - Subtitle below title (muted)
 * - Background sparkline/area chart
 * - Large metric value in bottom-right corner
 * - Optional trend indicator (up/down arrows)
 *
 * @param title - Card title (e.g., "CPU Usage")
 * @param subtitle - Card subtitle (e.g., "Average")
 * @param promqlQuery - PromQL query to execute
 * @param timeRange - Time range for the query
 * @param prometheusConnectionId - Prometheus data source connection ID
 * @param height - Card height in pixels (default: 120)
 * @param invertColor - If true, increase is bad (red), decrease is good (green)
 * @param formatValue - Custom value formatter function
 * @param refreshTrigger - Increment to trigger data refresh
 */
export const PromQLMetricCard: React.FC<PromQLMetricCardProps> = ({
  title,
  subtitle,
  promqlQuery,
  timeRange,
  prometheusConnectionId,
  height = SERVICE_DETAILS_CONSTANTS.METRIC_CARD_HEIGHT,
  invertColor = false,
  formatValue,
  refreshTrigger,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  // State to preserve previous chart data during refresh
  const [prevChartData, setPrevChartData] = useState<MetricDataPoint[]>([]);

  // Fetch chart data
  const { series, latestValue, isLoading, error } = usePromQLChartData({
    promqlQuery,
    timeRange,
    prometheusConnectionId,
    refreshTrigger,
  });

  // Get chart data from first series
  const chartData = useMemo(() => {
    if (series.length > 0) {
      return series[0].data;
    }
    return [];
  }, [series]);

  // Preserve chart data when new data arrives
  useEffect(() => {
    if (chartData.length > 0) {
      setPrevChartData(chartData);
    }
  }, [chartData]);

  // Use current data if available, otherwise use previous data during refresh
  const displayChartData = chartData.length > 0 ? chartData : prevChartData;

  // Calculate trend (compare latest value to average of previous values)
  const trend = useMemo(() => {
    if (chartData.length < 2) return null;

    const currentValue = chartData[chartData.length - 1].value;
    const previousValues = chartData.slice(0, -1).map((d) => d.value);
    const avgPrevious = previousValues.reduce((a, b) => a + b, 0) / previousValues.length;

    if (avgPrevious === 0) return null;

    const percentChange = ((currentValue - avgPrevious) / avgPrevious) * 100;
    return {
      direction: percentChange > 1 ? 'up' : percentChange < -1 ? 'down' : 'neutral',
      percent: Math.abs(percentChange),
    };
  }, [chartData]);

  // Format the display value
  const displayValue = useMemo(() => {
    if (latestValue === null || latestValue === undefined) {
      return '-';
    }

    if (formatValue) {
      return formatValue(latestValue);
    }

    // Default formatting based on value magnitude
    if (latestValue >= 1000000) {
      return `${(latestValue / 1000000).toFixed(1)}M`;
    }
    if (latestValue >= 1000) {
      return `${(latestValue / 1000).toFixed(1)}K`;
    }
    if (latestValue < 1 && latestValue > 0) {
      return `${(latestValue * 100).toFixed(1)}%`;
    }
    return latestValue.toFixed(1);
  }, [latestValue, formatValue]);

  // Initialize and update chart
  // Use displayChartData to keep showing chart during refresh
  useEffect(() => {
    if (!chartRef.current || error || displayChartData.length === 0) {
      return;
    }

    // Initialize chart if not already created
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    const color = invertColor ? APM_CONSTANTS.COLORS.FAILURE_RATE : APM_CONSTANTS.COLORS.THROUGHPUT;
    const rgb = hexToRgb(color) || { r: 84, g: 179, b: 153 };

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
        data: displayChartData.map((d) => d.timestamp),
        boundaryGap: false,
      },
      yAxis: {
        type: 'value',
        show: false,
      },
      tooltip: {
        show: false,
      },
      series: [
        {
          type: 'line',
          data: displayChartData.map((d) => d.value),
          smooth: true,
          symbol: 'none',
          lineStyle: {
            color,
            width: 1.5,
          },
          areaStyle: {
            color: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`,
          },
          emphasis: {
            disabled: true,
          },
          silent: true,
        },
      ],
    };

    chartInstance.current.setOption(option);
  }, [displayChartData, error, invertColor]);

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

  // Determine trend class
  const getTrendClass = () => {
    if (!trend) return '';
    const directionClass = `promql-metric-card__trend--${trend.direction}`;
    const invertedClass = invertColor ? 'promql-metric-card__trend--inverted' : '';
    return `${directionClass} ${invertedClass}`;
  };

  return (
    <EuiPanel
      className="promql-metric-card"
      paddingSize="none"
      style={{ height }}
      data-test-subj={`metricCard-${title.replace(/\s+/g, '-').toLowerCase()}`}
    >
      {/* Background chart - keep visible during refresh using displayChartData */}
      {!error && displayChartData.length > 0 && (
        <div ref={chartRef} className="promql-metric-card__chart" />
      )}

      {/* Content overlay */}
      <div className="promql-metric-card__content">
        <div className="promql-metric-card__header">
          <h4 className="promql-metric-card__title">{title}</h4>
          {subtitle && <p className="promql-metric-card__subtitle">{subtitle}</p>}
        </div>

        <div className="promql-metric-card__value-container">
          {isLoading ? (
            <EuiLoadingChart size="m" mono />
          ) : error ? (
            <span className="promql-metric-card__value promql-metric-card__value--error">-</span>
          ) : (
            <>
              <span className="promql-metric-card__value">{displayValue}</span>
              {trend && trend.direction !== 'neutral' && (
                <span className={`promql-metric-card__trend ${getTrendClass()}`}>
                  <EuiIcon type={trend.direction === 'up' ? 'sortUp' : 'sortDown'} size="s" />
                  <span className="promql-metric-card__trend-percent">
                    {trend.percent.toFixed(1)}%
                  </span>
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </EuiPanel>
  );
};

/**
 * Helper to convert hex color to RGB components
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

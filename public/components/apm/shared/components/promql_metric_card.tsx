/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useMemo, useState } from 'react';
import { EuiLoadingChart, EuiPanel, EuiIcon, EuiToolTip } from '@elastic/eui';
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
  showTotal?: boolean; // If true, show total as primary value, latest as secondary
  secondaryValue?: number; // Optional external secondary value (e.g., rate)
  secondaryFormatValue?: (value: number) => string; // Formatter for secondary value
  secondaryLabel?: string; // Label for secondary value (e.g., "rate", "latest")
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
  showTotal = false,
  secondaryValue,
  secondaryFormatValue,
  secondaryLabel,
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

  // Calculate trend by comparing two equal time windows (recent half vs earlier half)
  const trend = useMemo(() => {
    if (chartData.length < 4) return null; // Need at least 4 points for meaningful comparison

    const midpoint = Math.floor(chartData.length / 2);
    const earlierHalf = chartData.slice(0, midpoint).map((d) => d.value);
    const recentHalf = chartData.slice(midpoint).map((d) => d.value);

    const earlierAvg = earlierHalf.reduce((a, b) => a + b, 0) / earlierHalf.length;
    const recentAvg = recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length;

    if (earlierAvg === 0) return null;

    const percentChange = ((recentAvg - earlierAvg) / earlierAvg) * 100;
    return {
      direction:
        percentChange > SERVICE_DETAILS_CONSTANTS.TREND_THRESHOLD_PERCENT
          ? 'up'
          : percentChange < -SERVICE_DETAILS_CONSTANTS.TREND_THRESHOLD_PERCENT
          ? 'down'
          : 'neutral',
      percent: Math.abs(percentChange),
    };
  }, [chartData]);

  // Calculate average and latest from chart data (for showTotal mode)
  const { avgValue, latestFromChart } = useMemo(() => {
    if (chartData.length === 0) return { avgValue: 0, latestFromChart: 0 };
    const sum = chartData.reduce((s, point) => s + point.value, 0);
    const avg = sum / chartData.length;
    const latest = chartData[chartData.length - 1].value;
    return { avgValue: avg, latestFromChart: latest };
  }, [chartData]);

  // Determine primary value based on showTotal mode
  // When showTotal is true, display average throughput instead of sum
  const primaryValue = showTotal ? avgValue : latestValue;

  // Format the display value
  const displayValue = useMemo(() => {
    if (primaryValue === null || primaryValue === undefined) {
      return '-';
    }

    if (formatValue) {
      return formatValue(primaryValue);
    }

    // Default formatting based on value magnitude
    if (primaryValue >= 1000000) {
      return `${(primaryValue / 1000000).toFixed(1)}M`;
    }
    if (primaryValue >= 1000) {
      return `${(primaryValue / 1000).toFixed(1)}K`;
    }
    if (primaryValue < 1 && primaryValue > 0) {
      return `${(primaryValue * 100).toFixed(1)}%`;
    }
    return primaryValue.toFixed(1);
  }, [primaryValue, formatValue]);

  // Format the secondary display value
  const secondaryDisplayValue = useMemo(() => {
    // If external secondary value is provided, use it
    if (secondaryValue !== undefined) {
      if (secondaryFormatValue) {
        return secondaryFormatValue(secondaryValue);
      }
      return secondaryValue.toFixed(2);
    }

    // If showTotal mode, show latest value as secondary
    if (showTotal && chartData.length > 0) {
      if (formatValue) {
        return formatValue(latestFromChart);
      }
      // Default formatting
      if (latestFromChart >= 1000000) {
        return `${(latestFromChart / 1000000).toFixed(1)}M`;
      }
      if (latestFromChart >= 1000) {
        return `${(latestFromChart / 1000).toFixed(1)}K`;
      }
      return latestFromChart.toFixed(0);
    }

    return null;
  }, [
    secondaryValue,
    secondaryFormatValue,
    showTotal,
    chartData.length,
    latestFromChart,
    formatValue,
  ]);

  // Determine secondary label
  const computedSecondaryLabel = useMemo(() => {
    if (secondaryLabel) return secondaryLabel;
    if (showTotal && secondaryValue === undefined) return 'latest';
    return '';
  }, [secondaryLabel, showTotal, secondaryValue]);

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
            <div className="promql-metric-card__values-wrapper">
              <div className="promql-metric-card__primary-row">
                {showTotal ? (
                  <EuiToolTip content="Average value over the selected time range" position="top">
                    <span className="promql-metric-card__value">{displayValue}</span>
                  </EuiToolTip>
                ) : (
                  <span className="promql-metric-card__value">{displayValue}</span>
                )}
                {/* Show trend on primary row only when there's no secondary row */}
                {!secondaryDisplayValue && trend && trend.direction !== 'neutral' && (
                  <span className={`promql-metric-card__trend ${getTrendClass()}`}>
                    <EuiIcon type={trend.direction === 'up' ? 'sortUp' : 'sortDown'} size="s" />
                    <span className="promql-metric-card__trend-percent">
                      {trend.percent.toFixed(1)}%
                    </span>
                  </span>
                )}
              </div>
              {secondaryDisplayValue !== null && (
                <div className="promql-metric-card__secondary-row">
                  {showTotal ? (
                    <EuiToolTip content="Most recent data point" position="top">
                      <span className="promql-metric-card__secondary-value">
                        {secondaryDisplayValue}
                      </span>
                    </EuiToolTip>
                  ) : (
                    <span className="promql-metric-card__secondary-value">
                      {secondaryDisplayValue}
                    </span>
                  )}
                  {/* Show label only when not in showTotal mode (external secondary values) */}
                  {!showTotal && computedSecondaryLabel && (
                    <span className="promql-metric-card__secondary-label">
                      {computedSecondaryLabel}
                    </span>
                  )}
                  {/* Show trend on secondary row when secondary value is displayed */}
                  {trend &&
                    trend.direction !== 'neutral' &&
                    (showTotal ? (
                      <EuiToolTip
                        content="Percentage change comparing recent half to earlier half of the time range"
                        position="top"
                      >
                        <span className={`promql-metric-card__trend ${getTrendClass()}`}>
                          <EuiIcon
                            type={trend.direction === 'up' ? 'sortUp' : 'sortDown'}
                            size="s"
                          />
                          <span className="promql-metric-card__trend-percent">
                            {trend.percent.toFixed(1)}%
                          </span>
                        </span>
                      </EuiToolTip>
                    ) : (
                      <span className={`promql-metric-card__trend ${getTrendClass()}`}>
                        <EuiIcon type={trend.direction === 'up' ? 'sortUp' : 'sortDown'} size="s" />
                        <span className="promql-metric-card__trend-percent">
                          {trend.percent.toFixed(1)}%
                        </span>
                      </span>
                    ))}
                </div>
              )}
            </div>
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

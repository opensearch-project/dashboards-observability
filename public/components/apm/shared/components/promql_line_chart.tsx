/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useMemo } from 'react';
import { EuiIcon, EuiText } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import * as echarts from 'echarts';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { usePromQLChartData } from '../hooks/use_promql_chart_data';
import { TimeRange, ChartSeriesData } from '../../common/types/service_details_types';
import { SERVICE_DETAILS_CONSTANTS, CHART_COLORS } from '../../common/constants';
import { parseTimeRange, getTimeAxisConfig } from '../utils/time_utils';
import './promql_line_chart.scss';

export interface PromQLLineChartProps {
  title?: string;
  promqlQuery: string;
  timeRange: TimeRange;
  prometheusConnectionId: string;
  chartType?: 'line' | 'area';
  height?: number;
  refreshTrigger?: number;
  showLegend?: boolean;
  formatValue?: (value: number) => string;
  formatTooltipValue?: (value: number, seriesName: string) => string;
  /** Label field to extract from Prometheus labels (e.g., 'remoteService', 'operation') */
  labelField?: string;
}

/**
 * PromQLLineChart - Multi-series time-series chart for PromQL data
 *
 * Features:
 * - Multi-series line/area chart with ECharts
 * - Interactive tooltip with timestamp and all series values
 * - Legend showing series names with current values
 * - Y-axis with proper formatting
 * - X-axis with time labels
 * - Responsive sizing
 *
 * @param title - Optional chart title
 * @param promqlQuery - PromQL query to execute
 * @param timeRange - Time range for the query
 * @param prometheusConnectionId - Prometheus data source connection ID
 * @param chartType - 'line' or 'area' (default: 'line')
 * @param height - Chart height in pixels (default: 300)
 * @param refreshTrigger - Increment to trigger data refresh
 * @param showLegend - Show legend (default: true)
 * @param formatValue - Custom Y-axis value formatter
 * @param formatTooltipValue - Custom tooltip value formatter
 */
export const PromQLLineChart: React.FC<PromQLLineChartProps> = ({
  title,
  promqlQuery,
  timeRange,
  prometheusConnectionId,
  chartType = 'line',
  height = SERVICE_DETAILS_CONSTANTS.LINE_CHART_HEIGHT,
  refreshTrigger,
  showLegend = true,
  formatValue,
  formatTooltipValue,
  labelField,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  // Calculate time axis configuration based on time range
  const timeAxisConfig = useMemo(() => {
    try {
      const { startTime, endTime } = parseTimeRange(timeRange);
      return getTimeAxisConfig(startTime, endTime);
    } catch {
      // Fallback config for invalid time ranges
      return {
        minInterval: 30 * 60 * 1000, // 30 minutes
        labelFormat: '{HH}:{mm}',
      };
    }
  }, [timeRange]);

  // Fetch chart data
  const { series, isLoading, error } = usePromQLChartData({
    promqlQuery,
    timeRange,
    prometheusConnectionId,
    refreshTrigger,
    labelField,
  });

  // Default value formatter
  const defaultFormatValue = (value: number): string => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    if (value < 1 && value > 0) return `${(value * 100).toFixed(1)}%`;
    if (value === 0) return '0';
    return value.toFixed(2);
  };

  // Initialize chart and handle loading/data updates
  useEffect(() => {
    if (!chartRef.current || error) {
      // Dispose chart when ref is null (empty state) or on error
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
      return;
    }

    // Initialize chart if not already created
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    // Show loading state using ECharts built-in loading
    if (isLoading) {
      chartInstance.current.showLoading({
        text: '',
        spinnerRadius: 10,
        color: euiThemeVars.euiColorPrimary,
        maskColor: 'rgba(255, 255, 255, 0.1)',
      });
      return;
    }

    // Hide loading
    chartInstance.current.hideLoading();

    // Don't set options if no data
    if (series.length === 0) {
      return;
    }

    const option: echarts.EChartsOption = {
      grid: {
        left: 60,
        right: 20,
        top: showLegend ? 40 : 20,
        bottom: 40,
        containLabel: false,
      },
      legend: showLegend
        ? {
            show: true,
            type: 'scroll',
            top: 0,
            left: 0,
            right: 0,
            textStyle: {
              fontSize: 11,
              color: euiThemeVars.euiColorDarkShade,
            },
            icon: 'roundRect',
            itemWidth: 14,
            itemHeight: 3,
          }
        : undefined,
      tooltip: {
        trigger: 'axis',
        backgroundColor: euiThemeVars.euiColorEmptyShade,
        borderColor: euiThemeVars.euiColorLightShade,
        borderWidth: 1,
        textStyle: {
          fontSize: 12,
          color: euiThemeVars.euiTextColor,
        },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';

          // For time axis, axisValue is the timestamp
          const timestamp = params[0].axisValue;
          const date = new Date(timestamp);
          const timeStr = date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          const dateStr = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });

          let tooltip = `<div style="font-weight: 600; margin-bottom: 8px;">${timeStr}<br/>${dateStr}</div>`;

          params.forEach((param: any) => {
            // For time axis, value is [timestamp, actualValue]
            const value = Array.isArray(param.value) ? param.value[1] : param.value;
            const formattedValue = formatTooltipValue
              ? formatTooltipValue(value, param.seriesName)
              : formatValue
              ? formatValue(value)
              : defaultFormatValue(value);

            tooltip += `
              <div style="display: flex; align-items: center; justify-content: space-between; margin: 4px 0; min-width: 200px;">
                <span style="display: flex; align-items: center;">
                  <span style="display: inline-block; width: 10px; height: 10px; border-radius: 2px; background-color: ${param.color}; margin-right: 8px;"></span>
                  <span style="color: #69707d;">${param.seriesName}</span>
                </span>
                <span style="font-weight: 600; margin-left: 16px;">${formattedValue}</span>
              </div>
            `;
          });

          return tooltip;
        },
        axisPointer: {
          type: 'cross',
          label: {
            show: false,
          },
          lineStyle: {
            color: euiThemeVars.euiColorMediumShade,
            type: 'dashed',
          },
          crossStyle: {
            color: euiThemeVars.euiColorMediumShade,
          },
        },
      },
      xAxis: {
        type: 'time',
        minInterval: timeAxisConfig.minInterval,
        axisLine: {
          lineStyle: {
            color: euiThemeVars.euiColorLightShade,
          },
        },
        axisTick: {
          lineStyle: {
            color: euiThemeVars.euiColorLightShade,
          },
        },
        axisLabel: {
          color: euiThemeVars.euiColorDarkShade,
          fontSize: 11,
          formatter: timeAxisConfig.labelFormat,
        },
        splitLine: {
          show: false,
        },
      },
      yAxis: {
        type: 'value',
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: euiThemeVars.euiColorDarkShade,
          fontSize: 11,
          formatter: formatValue || defaultFormatValue,
        },
        splitLine: {
          lineStyle: {
            color: euiThemeVars.euiColorLightestShade,
            type: 'dashed',
          },
        },
      },
      series: series.map((s, index) => createSeriesConfig(s, index, chartType)),
    };

    chartInstance.current.setOption(option, true);
  }, [
    series,
    isLoading,
    error,
    chartType,
    showLegend,
    formatValue,
    formatTooltipValue,
    timeAxisConfig,
  ]);

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

  // Render error state
  if (error) {
    return (
      <div className="promql-line-chart" style={{ height }}>
        {title && <h4 className="promql-line-chart__title">{title}</h4>}
        <div className="promql-line-chart__error">
          <EuiIcon type="alert" size="l" color="danger" className="promql-line-chart__error-icon" />
          <EuiText size="s" className="promql-line-chart__error-message">
            {i18n.translate('observability.apm.promqlLineChart.errorMessage', {
              defaultMessage: 'Failed to load chart data',
            })}
          </EuiText>
        </div>
      </div>
    );
  }

  // Render empty state (only when not loading and no data)
  if (!isLoading && series.length === 0) {
    return (
      <div className="promql-line-chart" style={{ height }}>
        {title && <h4 className="promql-line-chart__title">{title}</h4>}
        <div className="promql-line-chart__empty">
          <EuiIcon
            type="visLine"
            size="l"
            color="subdued"
            className="promql-line-chart__empty-icon"
          />
          <EuiText size="s" color="subdued" className="promql-line-chart__empty-message">
            {i18n.translate('observability.apm.promqlLineChart.noDataMessage', {
              defaultMessage: 'No data available',
            })}
          </EuiText>
        </div>
      </div>
    );
  }

  return (
    <div
      className="promql-line-chart"
      style={{ height }}
      data-test-subj={`lineChart-${title?.replace(/\s+/g, '-').toLowerCase() || 'unnamed'}`}
    >
      {title && <h4 className="promql-line-chart__title">{title}</h4>}
      <div
        ref={chartRef}
        className="promql-line-chart__chart"
        style={{ height: title ? height - 24 : height }}
      />
    </div>
  );
};

/**
 * Create ECharts series configuration for a data series
 */
function createSeriesConfig(
  seriesData: ChartSeriesData,
  index: number,
  chartType: 'line' | 'area'
): echarts.SeriesOption {
  const color = seriesData.color || CHART_COLORS[index % CHART_COLORS.length];
  const rgb = hexToRgb(color) || { r: 84, g: 179, b: 153 };

  return {
    name: seriesData.name,
    type: 'line',
    data: seriesData.data.map((d) => [d.timestamp, d.value]),
    smooth: false,
    symbol: 'none',
    // Set itemStyle.color for legend to use the same color as the line
    itemStyle: {
      color,
    },
    lineStyle: {
      color,
      width: 2,
    },
    areaStyle:
      chartType === 'area'
        ? {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)` },
              { offset: 1, color: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)` },
            ]),
          }
        : undefined,
    emphasis: {
      focus: 'series',
      lineStyle: {
        width: 3,
      },
    },
  };
}

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

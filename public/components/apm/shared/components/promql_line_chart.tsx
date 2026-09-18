/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useMemo, useState } from 'react';
import { EuiButtonIcon, EuiIcon, EuiText, EuiToolTip } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import * as echarts from 'echarts';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { usePromQLChartData } from '../hooks/use_promql_chart_data';
import { TimeRange, ChartSeriesData } from '../../common/types/service_details_types';
import { SERVICE_DETAILS_CONSTANTS, CHART_COLORS } from '../../common/constants';
import { parseTimeRange, getTimeAxisConfig } from '../utils/time_utils';
import { isResolutionExceededError } from '../hooks/use_promql_chart_data';
import { useApmCursorBus } from '../hooks/apm_cursor_context';
import { navigateToExploreMetrics } from '../utils/navigation_utils';
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
  /** Override color for single-series charts */
  color?: string;
  /** Override series name for single-series charts (e.g., to replace empty `{}` labels) */
  seriesLabel?: string;
  /** Number of data points for the chart resolution (default: RESOLUTION_MEDIUM) */
  resolution?: number;
  /**
   * When provided, enables drag-to-select (brush) on the x-axis. The selected
   * window is reported as ISO-8601 start/end strings. Wire this to the page's
   * time-range setter so brushing zooms the whole page.
   */
  onTimeRangeChange?: (from: string, to: string) => void;
  /**
   * Show the "Open in Discover metrics" button (top-right) that deep-links to
   * the Explore metrics query view with this chart's PromQL, data source, and
   * time range pre-loaded. Default true.
   */
  showOpenInMetrics?: boolean;
}

/**
 * PromQLLineChart - Multi-series time-series chart for PromQL data
 *
 * Features:
 * - Multi-series line/area chart with ECharts
 * - Interactive tooltip with timestamp and all series values
 * - Synced crosshair across sibling charts (via ApmCursorContext)
 * - Drag-to-select time brushing (when onTimeRangeChange is provided)
 * - Legend click to isolate a single series (multi-series only)
 * - "Open in Discover metrics" deep link
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
  color,
  seriesLabel,
  resolution,
  onTimeRangeChange,
  showOpenInMetrics = true,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [showChart, setShowChart] = useState(false);

  // Cross-chart cursor sync bus (null when this chart is not inside a provider).
  const cursorBus = useApmCursorBus();
  // True while THIS chart is the one being hovered — so its own bus-subscribe
  // callback ignores the broadcast (the native tooltip/axisPointer handles it).
  const isLocalHoverRef = useRef(false);

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
    resolution,
  });

  const isResolutionExceeded = isResolutionExceededError(error);

  // Default value formatter
  const defaultFormatValue = (value: number): string => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    if (value < 1 && value > 0) return `${(value * 100).toFixed(1)}%`;
    if (value === 0) return '0';
    return value.toFixed(2);
  };

  const chartHeight = title ? height - 24 : height;

  // Initialize chart and handle loading/data updates
  // The chartRef div is always in the DOM to avoid React/ECharts DOM reconciliation conflicts
  useEffect(() => {
    if (!chartRef.current) {
      return;
    }

    // When error or empty: dispose chart and hide
    if (error || (!isLoading && series.length === 0)) {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
      setShowChart(false);
      return;
    }

    // Initialize chart if not already created
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    // Show loading state using ECharts built-in loading
    if (isLoading) {
      setShowChart(true);
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
      setShowChart(false);
      return;
    }

    setShowChart(true);

    const option: echarts.EChartsOption = {
      grid: {
        left: 10,
        right: 20,
        top: 20,
        bottom: showLegend ? 35 : 30,
        containLabel: true,
      },
      legend: showLegend
        ? {
            show: true,
            type: 'scroll',
            bottom: 0,
            left: 0,
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
          // Drop colliding labels on long ranges instead of overprinting them.
          hideOverlap: true,
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
      // Drag-to-select time brushing. `lineX` = a vertical band across the x-axis.
      ...(onTimeRangeChange
        ? {
            brush: { toolbox: ['lineX'], xAxisIndex: 0 },
            toolbox: { show: false },
          }
        : {}),
      series: series.map((s, index) =>
        createSeriesConfig(
          seriesLabel && series.length === 1 ? { ...s, name: seriesLabel } : s,
          index,
          chartType,
          color
        )
      ),
    };

    chartInstance.current.setOption(option, true);

    // Put the chart into brush mode immediately so a drag selects without a toolbar.
    if (onTimeRangeChange) {
      chartInstance.current.dispatchAction({
        type: 'takeGlobalCursor',
        key: 'brush',
        brushOption: { brushType: 'lineX', brushMode: 'single' },
      });
    }
  }, [
    series,
    isLoading,
    error,
    chartType,
    showLegend,
    formatValue,
    formatTooltipValue,
    timeAxisConfig,
    color,
    seriesLabel,
    onTimeRangeChange,
  ]);

  // Interaction wiring: brush → onTimeRangeChange, legend isolate, and synced
  // crosshair. Re-binds whenever the chart is (re)built. The zrender overlay
  // shapes survive setOption but not dispose, so they are recreated here.
  useEffect(() => {
    const inst = chartInstance.current;
    if (!inst || !showChart || isLoading || error || series.length === 0) {
      return;
    }
    const zr = inst.getZr();

    // ---- Brush → time range (#2) ----
    const onBrushEnd = (params: any) => {
      const range = params?.areas?.[0]?.coordRange;
      if (
        range &&
        range.length === 2 &&
        range[0] != null &&
        range[1] != null &&
        onTimeRangeChange
      ) {
        onTimeRangeChange(new Date(range[0]).toISOString(), new Date(range[1]).toISOString());
      }
    };
    if (onTimeRangeChange) {
      inst.off('brushEnd');
      inst.on('brushEnd', onBrushEnd);
    }

    // ---- Legend isolate on click (#7): hide others; re-click restores all ----
    let isolated: string | null = null;
    let applyingLegend = false;
    const seriesNames = series.map((s, i) =>
      seriesLabel && series.length === 1 ? seriesLabel : s.name || `series-${i}`
    );
    const onLegendChange = (params: any) => {
      if (applyingLegend) return;
      const clicked = params?.name;
      if (!clicked) return;
      applyingLegend = true;
      if (isolated === clicked) {
        // Re-clicked the isolated series → restore all.
        seriesNames.forEach((n) => inst.dispatchAction({ type: 'legendSelect', name: n }));
        isolated = null;
      } else {
        // Isolate the clicked series (hide every other).
        seriesNames.forEach((n) =>
          inst.dispatchAction({ type: n === clicked ? 'legendSelect' : 'legendUnSelect', name: n })
        );
        isolated = clicked;
      }
      applyingLegend = false;
    };
    if (showLegend && series.length > 1) {
      inst.off('legendselectchanged');
      inst.on('legendselectchanged', onLegendChange);
    }

    // ---- Synced crosshair (#3) ----
    let unsubscribe: (() => void) | undefined;
    let vLine: any;
    let hLine: any;
    let dots: any[] = [];

    if (cursorBus) {
      const lineColor = euiThemeVars.euiColorMediumShade;
      vLine = new echarts.graphic.Line({
        z: 100,
        silent: true,
        invisible: true,
        style: { stroke: lineColor, lineWidth: 1, lineDash: [3, 3] },
      });
      hLine = new echarts.graphic.Line({
        z: 100,
        silent: true,
        invisible: true,
        style: { stroke: lineColor, lineWidth: 1, lineDash: [3, 3] },
      });
      zr.add(vLine);
      zr.add(hLine);
      dots = series.map((s, i) => {
        const dot = new echarts.graphic.Circle({
          z: 101,
          silent: true,
          invisible: true,
          shape: { r: 3 },
          style: {
            fill: color || s.color || CHART_COLORS[i % CHART_COLORS.length],
            stroke: euiThemeVars.euiColorEmptyShade,
            lineWidth: 1,
          },
        });
        zr.add(dot);
        return dot;
      });

      const getGridRect = () => {
        try {
          // Grid coordinate rect handles containLabel:true automatically.
          return (inst.getModel() as any).getComponent('grid', 0)?.coordinateSystem?.getRect();
        } catch {
          return undefined;
        }
      };

      const hideOverlay = () => {
        vLine.attr({ invisible: true });
        hLine.attr({ invisible: true });
        dots.forEach((d) => d.attr({ invisible: true }));
      };

      const showOverlay = (time: number, yRatio: number) => {
        const rect = getGridRect();
        if (!rect) return;
        const x = inst.convertToPixel({ xAxisIndex: 0 }, time);
        if (x == null || isNaN(x as number)) {
          hideOverlay();
          return;
        }
        vLine.attr({
          invisible: false,
          shape: { x1: x, y1: rect.y, x2: x, y2: rect.y + rect.height },
        });
        const hy = rect.y + Math.max(0, Math.min(1, yRatio)) * rect.height;
        hLine.attr({
          invisible: false,
          shape: { x1: rect.x, y1: hy, x2: rect.x + rect.width, y2: hy },
        });
        // Place each series' dot at its nearest data point to `time`.
        series.forEach((s, i) => {
          const pts = s.data;
          if (!pts || pts.length === 0) {
            dots[i].attr({ invisible: true });
            return;
          }
          let nearest = pts[0];
          let best = Math.abs(pts[0].timestamp - time);
          for (let k = 1; k < pts.length; k++) {
            const diff = Math.abs(pts[k].timestamp - time);
            if (diff < best) {
              best = diff;
              nearest = pts[k];
            }
          }
          const px = inst.convertToPixel({ gridIndex: 0 }, [nearest.timestamp, nearest.value]) as
            number[] | null;
          if (px && !isNaN(px[0]) && !isNaN(px[1])) {
            dots[i].attr({ invisible: false, shape: { cx: px[0], cy: px[1], r: 3 } });
          } else {
            dots[i].attr({ invisible: true });
          }
        });
      };

      // Publish this chart's hovered position; the native tooltip/axisPointer
      // renders locally, so remote charts get only the overlay.
      const onZrMouseMove = (e: any) => {
        const rect = getGridRect();
        if (!rect) return;
        const x = e.offsetX;
        const y = e.offsetY;
        if (x < rect.x || x > rect.x + rect.width || y < rect.y || y > rect.y + rect.height) {
          return;
        }
        const time = inst.convertFromPixel({ xAxisIndex: 0 }, x) as number;
        const yRatio = (y - rect.y) / rect.height;
        isLocalHoverRef.current = true;
        cursorBus.publish({ time, yRatio });
      };
      const onGlobalOut = () => {
        isLocalHoverRef.current = false;
        cursorBus.publish(null);
      };
      zr.on('mousemove', onZrMouseMove);
      zr.on('globalout', onGlobalOut);

      unsubscribe = cursorBus.subscribe((state) => {
        if (isLocalHoverRef.current) return; // hovered chart: native tooltip handles it
        if (!state) {
          hideOverlay();
          if (!inst.isDisposed()) inst.dispatchAction({ type: 'hideTip' });
          return;
        }
        if (!inst.isDisposed()) inst.dispatchAction({ type: 'hideTip' });
        showOverlay(state.time, state.yRatio);
      });
    }

    return () => {
      if (inst.isDisposed()) return;
      if (onTimeRangeChange) inst.off('brushEnd');
      if (showLegend && series.length > 1) inst.off('legendselectchanged');
      if (cursorBus) {
        unsubscribe?.();
        zr.off('mousemove');
        zr.off('globalout');
        if (vLine) zr.remove(vLine);
        if (hLine) zr.remove(hLine);
        dots.forEach((d) => zr.remove(d));
      }
    };
  }, [
    series,
    showChart,
    isLoading,
    error,
    cursorBus,
    onTimeRangeChange,
    showLegend,
    seriesLabel,
    color,
  ]);

  // Resize chart after it becomes visible (display: none → block transition)
  // ECharts needs the container to have dimensions when rendering
  useEffect(() => {
    if (showChart && chartInstance.current) {
      requestAnimationFrame(() => {
        chartInstance.current?.resize();
      });
    }
  }, [showChart]);

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

  const canOpenInMetrics =
    showOpenInMetrics && Boolean(promqlQuery) && Boolean(prometheusConnectionId);
  const openInMetricsLabel = i18n.translate('observability.apm.promqlLineChart.openInMetrics', {
    defaultMessage: 'Open in Discover metrics',
  });

  // Always render the same DOM structure to avoid React/ECharts DOM reconciliation conflicts
  return (
    <div
      className="promql-line-chart"
      style={{ height, position: 'relative' }}
      data-test-subj={`lineChart-${title?.replace(/\s+/g, '-').toLowerCase() || 'unnamed'}`}
    >
      {title && <h4 className="promql-line-chart__title">{title}</h4>}
      {canOpenInMetrics && (
        <EuiToolTip content={openInMetricsLabel} position="top">
          <EuiButtonIcon
            className="promql-line-chart__open-metrics"
            style={{ position: 'absolute', top: 0, right: 0, zIndex: 1 }}
            iconType="lineChart"
            size="xs"
            aria-label={openInMetricsLabel}
            data-test-subj={`openInMetrics-${title?.replace(/\s+/g, '-').toLowerCase() || 'unnamed'}`}
            onClick={() => navigateToExploreMetrics(promqlQuery, prometheusConnectionId, timeRange)}
          />
        </EuiToolTip>
      )}
      <div
        ref={chartRef}
        className="promql-line-chart__chart"
        style={{ display: showChart ? 'block' : 'none', height: chartHeight }}
      />
      {error && (
        <div className="promql-line-chart__error">
          <EuiIcon
            type={isResolutionExceeded ? 'iInCircle' : 'alert'}
            size="l"
            color={isResolutionExceeded ? 'primary' : 'danger'}
            className="promql-line-chart__error-icon"
          />
          <EuiText
            size="s"
            color={isResolutionExceeded ? 'default' : undefined}
            className="promql-line-chart__error-message"
          >
            {isResolutionExceeded
              ? i18n.translate('observability.apm.promqlLineChart.resolutionExceededMessage', {
                  defaultMessage:
                    'Too many data points for the selected time range. Try selecting a shorter time range.',
                })
              : i18n.translate('observability.apm.promqlLineChart.errorMessage', {
                  defaultMessage: 'Failed to load chart data',
                })}
          </EuiText>
        </div>
      )}
      {!isLoading && !error && series.length === 0 && (
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
      )}
    </div>
  );
};

/**
 * Create ECharts series configuration for a data series
 */
function createSeriesConfig(
  seriesData: ChartSeriesData,
  index: number,
  chartType: 'line' | 'area',
  overrideColor?: string
): echarts.SeriesOption {
  const color = overrideColor || seriesData.color || CHART_COLORS[index % CHART_COLORS.length];
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

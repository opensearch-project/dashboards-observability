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

/** Brushes narrower than this are ignored (plain clicks, sub-second slivers). */
const MIN_BRUSH_MS = 1000;

/** Payload of the ECharts `brushEnd` event (only the fields we read). */
interface BrushEndParams {
  areas?: Array<{ coordRange?: number[] }>;
}

/** Payload of the ECharts `legendselectchanged` event (only the fields we read). */
interface LegendSelectChangedParams {
  name?: string;
}

/** zrender mouse event carrying canvas-relative offsets. */
interface ZRenderMouseEvent {
  offsetX: number;
  offsetY: number;
}

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
  /**
   * Custom header row content (e.g. a title with a help tip and a percentile
   * toggle). Rendered left of the "Open in Discover metrics" button so the
   * chart's actions sit on the title line. Takes precedence over `title` for
   * the visible header; `height` then covers the chart area only.
   */
  header?: React.ReactNode;
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
  header,
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

  // Resolve one stable display name per series, used BOTH for the ECharts series
  // config and the legend-isolate handler. ECharts auto-generates names like
  // `series0` for unnamed series, which would never match a `series-${i}` guess —
  // so we assign these names explicitly on setOption to keep the two in lockstep.
  const seriesNames = useMemo(
    () =>
      series.map((s, i) =>
        seriesLabel && series.length === 1 ? seriesLabel : s.name || `series-${i}`
      ),
    [series, seriesLabel]
  );

  // Default value formatter
  const defaultFormatValue = (value: number): string => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    if (value < 1 && value > 0) return `${(value * 100).toFixed(1)}%`;
    if (value === 0) return '0';
    return value.toFixed(2);
  };

  // Pin the time axis to the page time range so every chart shares one x extent
  // (keeps brush and synced crosshair aligned). Without this, a chart with a single
  // point gets ECharts' ~1 day auto-padding and a brush lands hours away. Union with
  // the data extent so points just past a relative `now` are never clipped.
  // Re-derived on each fetch (`series` dep) so relative ranges track `now`.
  const xExtent = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    try {
      const { startTime, endTime } = parseTimeRange(timeRange);
      min = startTime.getTime();
      max = endTime.getTime();
    } catch {
      // Invalid range: fall back to the data extent below.
    }
    series.forEach((s) => {
      if (s.data && s.data.length > 0) {
        min = Math.min(min, s.data[0].timestamp);
        max = Math.max(max, s.data[s.data.length - 1].timestamp);
      }
    });
    return isFinite(min) && isFinite(max) && min < max ? { min, max } : undefined;
  }, [timeRange, series]);

  // A built-in `title` shares the fixed `height`; a custom `header` sits on top of it.
  const chartHeight = title && !header ? height - 24 : height;

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
        min: xExtent?.min,
        max: xExtent?.max,
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
        createSeriesConfig({ ...s, name: seriesNames[index] }, index, chartType, color)
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
    seriesNames,
    onTimeRangeChange,
    xExtent,
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
    const onBrushEnd = (params: BrushEndParams) => {
      const range = params?.areas?.[0]?.coordRange;
      if (
        range &&
        range.length === 2 &&
        range[0] != null &&
        range[1] != null &&
        // A plain click (no drag) yields a zero-width [t, t] range; applying it
        // would collapse the page's time range to an instant with no data.
        range[0] !== range[1] &&
        onTimeRangeChange
      ) {
        // ECharts reports coordRange in drag order, so a right-to-left drag yields
        // range[0] > range[1]. Sort before converting so `from` is always <= `to`.
        let [start, end] = range[0] <= range[1] ? range : [range[1], range[0]];
        // Clamp to the axis extent so a brush can never escape the visible window.
        if (xExtent) {
          start = Math.max(start, xExtent.min);
          end = Math.min(end, xExtent.max);
        }
        if (end - start < MIN_BRUSH_MS) return;
        onTimeRangeChange(new Date(start).toISOString(), new Date(end).toISOString());
      }
    };
    if (onTimeRangeChange) {
      inst.on('brushEnd', onBrushEnd);
    }

    // ---- Legend isolate on click (#7): hide others; re-click restores all ----
    let isolated: string | null = null;
    let applyingLegend = false;
    const onLegendChange = (params: LegendSelectChangedParams) => {
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
      inst.on('legendselectchanged', onLegendChange);
    }

    // ---- Synced crosshair (#3) ----
    let unsubscribe: (() => void) | undefined;
    let onZrMouseMove: ((e: ZRenderMouseEvent) => void) | undefined;
    let onGlobalOut: (() => void) | undefined;
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
        const x = inst.convertToPixel({ xAxisIndex: 0 }, time) as number;
        // Each chart's axis is pinned to the page range, but a sibling's hovered time
        // can still fall outside it (e.g. relative `now` parsed at a different
        // instant). Hide rather than draw into the axis gutter.
        if (
          x == null ||
          isNaN(x) ||
          (xExtent && (time < xExtent.min || time > xExtent.max)) ||
          x < rect.x ||
          x > rect.x + rect.width
        ) {
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
        // Place each series' dot at its nearest data point to `time`, skipping
        // series hidden via the legend and points too far from the guide line.
        const selected: Record<string, boolean> =
          (inst.getOption() as any)?.legend?.[0]?.selected ?? {};
        series.forEach((s, i) => {
          const pts = s.data;
          if (!pts || pts.length === 0 || selected[seriesNames[i]] === false) {
            dots[i].attr({ invisible: true });
            return;
          }
          const nearest = findNearestPoint(pts, time);
          // Tolerance of one average step: a series with a gap (or one that starts
          // late / ends early) shouldn't snap a dot away from the guide line.
          const stepMs =
            pts.length > 1
              ? (pts[pts.length - 1].timestamp - pts[0].timestamp) / (pts.length - 1)
              : 0;
          if (pts.length > 1 && Math.abs(nearest.timestamp - time) > stepMs) {
            dots[i].attr({ invisible: true });
            return;
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
      onZrMouseMove = (e: ZRenderMouseEvent) => {
        const rect = getGridRect();
        if (!rect) return;
        const x = e.offsetX;
        const y = e.offsetY;
        if (x < rect.x || x > rect.x + rect.width || y < rect.y || y > rect.y + rect.height) {
          // Pointer is on the canvas but outside the plot rect (legend/axis gutter).
          // Clear our own hover so sibling broadcasts can drive this chart again, and
          // tell siblings to drop their stale crosshair.
          if (isLocalHoverRef.current) {
            isLocalHoverRef.current = false;
            cursorBus.publish(null);
          }
          return;
        }
        const time = inst.convertFromPixel({ xAxisIndex: 0 }, x) as number;
        const yRatio = (y - rect.y) / rect.height;
        isLocalHoverRef.current = true;
        cursorBus.publish({ time, yRatio });
      };
      onGlobalOut = () => {
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
      // Always pass the handler to off(): a bare off(event) removes EVERY listener
      // for that event — including ECharts' own zrender mouse dispatch, which is
      // bound once at init and never re-added on setOption, killing the native
      // tooltip/axisPointer after the first refresh.
      if (onTimeRangeChange) inst.off('brushEnd', onBrushEnd);
      if (showLegend && series.length > 1) inst.off('legendselectchanged', onLegendChange);
      if (cursorBus) {
        unsubscribe?.();
        if (onZrMouseMove) zr.off('mousemove', onZrMouseMove);
        if (onGlobalOut) zr.off('globalout', onGlobalOut);
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
    seriesNames,
    color,
    xExtent,
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

  const hasData = showChart && !isLoading && !error && series.length > 0;
  const hasOpenInMetrics =
    showOpenInMetrics && Boolean(promqlQuery) && Boolean(prometheusConnectionId);
  const openInMetricsLabel = i18n.translate('observability.apm.promqlLineChart.openInMetrics', {
    defaultMessage: 'Open in Discover metrics',
  });
  const testSubjSuffix = title?.replace(/\s+/g, '-').toLowerCase() || 'unnamed';
  const headerContent =
    header ?? (title ? <h4 className="promql-line-chart__title">{title}</h4> : null);

  const renderOpenInMetricsButton = (isDisabled: boolean) => (
    <EuiToolTip content={openInMetricsLabel} position="top">
      <EuiButtonIcon
        iconType="visAreaStacked"
        size="xs"
        aria-label={openInMetricsLabel}
        isDisabled={isDisabled}
        data-test-subj={`openInMetrics-${testSubjSuffix}`}
        onClick={() => navigateToExploreMetrics(promqlQuery, prometheusConnectionId, timeRange)}
      />
    </EuiToolTip>
  );

  // Always render the same DOM structure to avoid React/ECharts DOM reconciliation conflicts
  return (
    <div
      className="promql-line-chart"
      style={{ height: header ? undefined : height, position: 'relative' }}
      data-test-subj={`lineChart-${testSubjSuffix}`}
    >
      {headerContent && (
        // Chart actions live on the title line. The button is disabled (not hidden)
        // until data loads so sibling header controls don't shift when it appears.
        <div className="promql-line-chart__header">
          <div className="promql-line-chart__header-content">{headerContent}</div>
          {hasOpenInMetrics && (
            <div className="promql-line-chart__header-actions">
              {renderOpenInMetricsButton(!hasData)}
            </div>
          )}
        </div>
      )}
      {!headerContent && hasOpenInMetrics && hasData && (
        // No header row: overlay top-right, shown only with data so it never covers
        // the error/empty placeholder. Position the wrapper (not the button) so
        // EuiToolTip's anchor span stays co-located with the icon.
        <div className="promql-line-chart__open-metrics">{renderOpenInMetricsButton(false)}</div>
      )}
      <div
        ref={chartRef}
        className="promql-line-chart__chart"
        style={{ display: showChart ? 'block' : 'none', height: chartHeight }}
      />
      {error && (
        <div
          className="promql-line-chart__error"
          style={header ? { height: chartHeight } : undefined}
        >
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
        <div
          className="promql-line-chart__empty"
          style={header ? { height: chartHeight } : undefined}
        >
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
 * Binary-search the point nearest to `time`. Prometheus range results are sorted
 * by timestamp, so this keeps the per-mousemove crosshair cost at O(log n).
 */
export function findNearestPoint<T extends { timestamp: number }>(pts: T[], time: number): T {
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (pts[mid].timestamp < time) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  // `lo` is the first point at/after `time`; its predecessor may be closer.
  if (lo > 0 && Math.abs(pts[lo - 1].timestamp - time) <= Math.abs(pts[lo].timestamp - time)) {
    return pts[lo - 1];
  }
  return pts[lo];
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

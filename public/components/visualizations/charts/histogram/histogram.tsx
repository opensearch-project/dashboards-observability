/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { forEach, isEmpty, take, last } from 'lodash';
import React, { useEffect, useMemo } from 'react';
import {
  AGGREGATIONS,
  GROUPBY,
  DEFAULT_BAR_CHART_STYLES,
} from '../../../../../common/constants/explorer';
import {
  DEFAULT_CHART_STYLES,
  FILLOPACITY_DIV_FACTOR,
  PLOTLY_COLOR,
  VIS_CHART_TYPES,
  PLOT_MARGIN,
  THRESHOLD_LINE_OPACITY,
  THRESHOLD_LINE_WIDTH,
} from '../../../../../common/constants/shared';
import { IVisualizationContainerProps } from '../../../../../common/types/explorer';
import { hexToRgb } from '../../../../components/event_analytics/utils/utils';
import { Plt } from '../../plotly/plot';
import { AvailabilityUnitType } from '../../../event_analytics/explorer/visualizations/config_panel/config_panes/config_controls/config_availability';
import { ThresholdUnitType } from '../../../event_analytics/explorer/visualizations/config_panel/config_panes/config_controls/config_thresholds';

export const Histogram = ({ visualizations, layout, config }: any) => {
  const { LineWidth, FillOpacity, LegendPosition, ShowLegend } = DEFAULT_CHART_STYLES;
  const {
    data: {
      defaultAxes,
      indexFields,
      query,
      rawVizData: {
        data: queriedVizData,
        // metadata: { fields },
      },
      explorer: { explorerData },
      userConfigs: {
        dataConfig: {
          chartStyles = {},
          legend = {},
          span = {},
          tooltipOptions = {},
          colorTheme = [],
          panelOptions = {},
          thresholds = [],
          [GROUPBY]: dimensions = [],
          [AGGREGATIONS]: series = [],
          breakdowns = [],
        },
        layoutConfig = {},
        availabilityConfig = {},
      } = {},
    },
    vis: {
      type,
      icontype,
      fillopacity,
      orientation,
      labelangle,
      linewidth,
      histogramwidth,
      groupwidth,
      showlegend,
      legendposition,
    },
  }: IVisualizationContainerProps = visualizations;

  // const lastIndex = fields.length - 1;
  const lineWidth = chartStyles.lineWidth || LineWidth;
  const showLegend = legend.showLegend && legend.showLegend !== ShowLegend ? false : true;
  const legendPosition = legend.position || LegendPosition;
  const fillOpacity = (chartStyles.fillOpacity || FillOpacity) / FILLOPACITY_DIV_FACTOR;
  const tooltipMode =
    tooltipOptions.tooltipMode !== undefined ? tooltipOptions.tooltipMode : 'show';
  const tooltipText = tooltipOptions.tooltipText !== undefined ? tooltipOptions.tooltipText : 'all';
  // const valueSeries = defaultAxes?.yaxis || take(fields, lastIndex > 0 ? lastIndex : 1);

  const histogramOrientation = chartStyles.orientation || orientation;
  const labelSize = chartStyles.labelSize || DEFAULT_BAR_CHART_STYLES.LabelSize;
  const barWidth = 1 - (chartStyles.barWidth || histogramwidth);
  const groupWidth = 1 - (chartStyles.groupWidth || groupwidth);
  const legendSize = legend.legendSize;

  const xbins: any = {};
  if (dimensions && dimensions[0]?.bucketSize) {
    xbins.size = dimensions[0]?.bucketSize;
  }
  if (dimensions && dimensions[0]?.bucketOffset) {
    xbins.start = dimensions[0]?.bucketOffset;
  }

  const selectedColorTheme = (field: string, index: number, opacity?: number) => {
    let newColor;
    if (colorTheme && colorTheme.length !== 0) {
      newColor = colorTheme.find((colorSelected) => colorSelected.name.name === field);
    }
    return hexToRgb(newColor ? newColor.color : PLOTLY_COLOR[index % PLOTLY_COLOR.length], opacity);
  };

  // const hisValues = useMemo(
  //   () =>
  //     valueSeries.map((field: any, index: number) => ({
  //       x: queriedVizData[field.name],
  //       type: VIS_CHART_TYPES.Histogram,
  //       name: field.name,
  //       hoverinfo: tooltipMode === 'hidden' ? 'none' : tooltipText,
  //       marker: {
  //         color: selectedColorTheme(field.name, index, fillOpacity),
  //         line: {
  //           color: selectedColorTheme(field.name, index),
  //           width: lineWidth,
  //         },
  //       },
  //       xbins: !isEmpty(xbins) ? xbins : undefined,
  //     })),
  //   [valueSeries, queriedVizData, fillOpacity, lineWidth, xbins, selectedColorTheme]
  // );

  // const hisValues = useMemo(
  //   () =>
  //     explorerData.map((value: any) => ({
  //       x: value.xAxis,
  //       y: value.count,
  //       type: VIS_CHART_TYPES.Histogram,
  //       name: 'count',
  //       histfunc: 'sum',
  //       hoverinfo: tooltipMode === 'hidden' ? 'none' : tooltipText,
  //       marker: {
  //         color: selectedColorTheme(field.name, index, fillOpacity),
  //         line: {
  //           color: selectedColorTheme(field.name, index),
  //           width: lineWidth,
  //         },
  //       },
  //     })),
  //   [explorerData, fillOpacity, lineWidth, xbins, selectedColorTheme]
  // );

  // const mergedLayout = {
  //   ...layout,
  //   ...(layoutConfig.layout && layoutConfig.layout),
  //   title: panelOptions.title || layoutConfig.layout?.title || '',
  //   barmode: 'group',
  //   legend: {
  //     ...layout.legend,
  //     orientation: legendPosition,
  //   },
  //   showlegend: showLegend,
  //   margin: PLOT_MARGIN,
  // };

  const addStylesToTraces = (traces, traceStyles) => {
    const {
      histogramOrientation: histogramOrient,
      fillOpacity: opac,
      tooltipMode: tltpMode,
      tooltipText: tltpText,
      lineWidth: lwidth,
    } = traceStyles;
    return traces.map((trace, idx: number) => {
      const selectedColor = selectedColorTheme(trace.aggName, idx);
      return {
        ...trace,
        type: 'histogram',
        orientation: histogramOrient,
        hoverinfo: tltpMode === 'hidden' ? 'none' : tltpText,
        ...{
          marker: {
            color: hexToRgb(selectedColor, opac),
            line: {
              color: selectedColor,
              width: lwidth,
            },
          },
        },
      };
    });
  };

  let histogram = useMemo(() => {
    const visPanelConfig = {
      dimensions,
      series,
      breakdowns,
      span,
    };
    const traceStyles = {
      // histogramOrientation,
      fillOpacity,
      tooltipMode,
      tooltipText,
      lineWidth,
    };
    const histogramSpecficMetaData = {
      x_coordinate: 'x',
      y_coordinate: 'y',
    };
    console.log('jsonData: ', explorerData);
    return addStylesToTraces(
      explorerData.jsonData.map(
        (value: any) => ({
          ...value,
          x: value.xAxis,
          y: value.count,
          type: VIS_CHART_TYPES.Histogram,
          name: 'count',
          histfunc: 'sum',
        }),
        visPanelConfig,
        histogramSpecficMetaData
      ),
      { ...traceStyles }
    );
  }, [chartStyles, explorerData, dimensions, series, breakdowns, span, tooltipOptions]);

  const mergedLayout = useMemo(() => {
    return {
      colorway: PLOTLY_COLOR,
      ...layout,
      title: panelOptions.title || layoutConfig.layout?.title || '',
      barmode: chartStyles.mode || visualizations.vis.mode,
      xaxis: {
        // ...(isVertical && { tickangle: tickAngle }),
        automargin: true,
        tickfont: {
          ...(labelSize && {
            size: labelSize,
          }),
        },
      },
      yaxis: {
        // ...(!isVertical && { tickangle: tickAngle }),
        automargin: true,
        tickfont: {
          ...(labelSize && {
            size: labelSize,
          }),
        },
      },
      histogramgap: groupWidth,
      histogramgroupgap: barWidth,
      legend: {
        ...layout.legend,
        orientation: legendPosition,
        ...(legendSize && {
          font: {
            size: legendSize,
          },
        }),
      },
      showlegend: showLegend,
      hovermode: 'closest',
      margin: PLOT_MARGIN,
    };
  }, [visualizations, layout, panelOptions, showLegend, chartStyles]);

  if (thresholds || availabilityConfig.level) {
    const thresholdTraces = {
      x: [],
      y: [],
      mode: 'text',
      text: [],
    };
    const levels = availabilityConfig.level ? availabilityConfig.level : [];
    const mapToLine = (list: ThresholdUnitType[] | AvailabilityUnitType[], lineStyle: any) => {
      return list.map((thr: ThresholdUnitType) => {
        console.log('histogram[0]: ', histogram[0]);
        console.log('histogram[0]?.x[0]: ', histogram[0]?.x[0]);
        thresholdTraces.x.push(histogram[0]?.x[0] || '');
        thresholdTraces.y.push(thr.value * (1 + 0.06));
        thresholdTraces.text.push(thr.name);
        return {
          type: 'histogram',
          x0: histogram[0]?.x[0] || 0,
          y0: thr.value,
          x1: last(last(histogram)?.x) || 1,
          y1: thr.value,
          name: thr.name || '',
          opacity: THRESHOLD_LINE_OPACITY,
          line: {
            color: thr.color,
            width: THRESHOLD_LINE_WIDTH,
            ...lineStyle,
          },
        };
      });
    };

    mergedLayout.shapes = [...mapToLine(thresholds, { dash: 'dashdot' }), ...mapToLine(levels, {})];
    histogram = [...histogram, thresholdTraces];
  }

  // const mergedConfigs = {
  //   ...config,
  //   ...(layoutConfig.config && layoutConfig.config),
  // };

  const mergedConfigs = useMemo(
    () => ({
      ...config,
      ...(layoutConfig.config && layoutConfig.config),
    }),
    [config, layoutConfig.config]
  );
  const data: any[] = [];
  console.log('mergedLayout: ', mergedLayout);
  return <Plt data={histogram} layout={mergedLayout} config={mergedConfigs} />;
};

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import last from 'lodash/last';
import {
  AGGREGATIONS,
  BREAKDOWNS,
  DEFAULT_BAR_CHART_STYLES,
  GROUPBY,
} from '../../../../../common/constants/explorer';
import {
  BarOrientation,
  FILLOPACITY_DIV_FACTOR,
  PLOTLY_COLOR,
  THRESHOLD_LINE_OPACITY,
  THRESHOLD_LINE_WIDTH,
  PLOT_MARGIN,
} from '../../../../../common/constants/shared';
import { IVisualizationContainerProps } from '../../../../../common/types/explorer';
import { AvailabilityUnitType } from '../../../event_analytics/explorer/visualizations/config_panel/config_panes/config_controls/config_availability';
import { ThresholdUnitType } from '../../../event_analytics/explorer/visualizations/config_panel/config_panes/config_controls/config_thresholds';
import { hexToRgb } from '../../../event_analytics/utils/utils';
import { Plt } from '../../plotly/plot';
import { transformPreprocessedDataToTraces, preprocessJsonData } from '../shared/common';

export const Bar = ({ visualizations, layout, config }: any) => {
  const {
    data: {
      explorer: {
        explorerData: { jsonData },
      },
      userConfigs: {
        dataConfig: {
          colorTheme = [],
          chartStyles = {},
          span = {},
          legend = {},
          panelOptions = {},
          tooltipOptions = {},
          thresholds = [],
          [GROUPBY]: dimensions = [],
          [AGGREGATIONS]: series = [],
          [BREAKDOWNS]: breakdowns = [],
        } = {},
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
      barwidth,
      groupwidth,
      showlegend,
      legendposition,
    },
  }: IVisualizationContainerProps = visualizations;

  /**
   * determine stylings
   */
  const barOrientation = chartStyles.orientation || orientation;
  const isVertical = barOrientation === BarOrientation.vertical;
  const tickAngle = chartStyles.rotateBarLabels || labelangle;
  const lineWidth = chartStyles.lineWidth || linewidth;
  const fillOpacity =
    chartStyles.fillOpacity !== undefined
      ? chartStyles.fillOpacity / FILLOPACITY_DIV_FACTOR
      : fillopacity / FILLOPACITY_DIV_FACTOR;
  const tooltipMode =
    tooltipOptions.tooltipMode !== undefined ? tooltipOptions.tooltipMode : 'show';
  const tooltipText = tooltipOptions.tooltipText !== undefined ? tooltipOptions.tooltipText : 'all';
  const barWidth = 1 - (chartStyles.barWidth || barwidth);
  const groupWidth = 1 - (chartStyles.groupWidth || groupwidth);
  const showLegend = legend.showLegend === 'hidden' ? false : showlegend;
  const legendPosition = legend.position || legendposition;
  const labelSize = chartStyles.labelSize || DEFAULT_BAR_CHART_STYLES.LabelSize;
  const legendSize = legend.legendSize;
  const getSelectedColorTheme = (field: any, index: number) =>
    (colorTheme.length > 0 &&
      colorTheme.find((colorSelected) => colorSelected.name.label === field)?.color) ||
    PLOTLY_COLOR[index % PLOTLY_COLOR.length];

  const addStylesToTraces = (traces, traceStyles) => {
    const {
      barOrientation: barOrient,
      fillOpacity: opac,
      tooltipMode: tltpMode,
      tooltipText: tltpText,
      lineWidth: lwidth,
    } = traceStyles;
    return traces.map((trace, idx: number) => {
      const selectedColor = getSelectedColorTheme(trace.aggName, idx);
      return {
        ...trace,
        type,
        orientation: barOrient,
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

  let bars = useMemo(() => {
    const visPanelConfig = {
      dimensions,
      series,
      breakdowns,
      span,
      isVertical,
    };
    const traceStyles = {
      barOrientation,
      fillOpacity,
      tooltipMode,
      tooltipText,
      lineWidth,
    };
    const barSpecficMetaData = {
      x_coordinate: 'x',
      y_coordinate: 'y',
    };

    return addStylesToTraces(
      transformPreprocessedDataToTraces(
        preprocessJsonData(jsonData, visPanelConfig),
        visPanelConfig,
        barSpecficMetaData
      ),
      { ...traceStyles }
    );
  }, [chartStyles, jsonData, dimensions, series, breakdowns, span, tooltipOptions]);

  const mergedLayout = useMemo(() => {
    return {
      colorway: PLOTLY_COLOR,
      ...layout,
      title: panelOptions.title || layoutConfig.layout?.title || '',
      barmode: chartStyles.mode || visualizations.vis.mode,
      xaxis: {
        ...(isVertical && { tickangle: tickAngle }),
        automargin: true,
        tickfont: {
          ...(labelSize && {
            size: labelSize,
          }),
        },
      },
      yaxis: {
        ...(!isVertical && { tickangle: tickAngle }),
        automargin: true,
        tickfont: {
          ...(labelSize && {
            size: labelSize,
          }),
        },
      },
      bargap: groupWidth,
      bargroupgap: barWidth,
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
        thresholdTraces.x.push(bars[0]?.x[0] || '');
        thresholdTraces.y.push(thr.value * (1 + 0.06));
        thresholdTraces.text.push(thr.name);
        return {
          type: 'line',
          x0: bars[0]?.x[0] || 0,
          y0: thr.value,
          x1: last(last(bars)?.x) || 1,
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
    bars = [...bars, thresholdTraces];
  }

  const mergedConfigs = {
    ...config,
    ...(layoutConfig.config && layoutConfig.config),
  };

  return <Plt data={bars} layout={mergedLayout} config={mergedConfigs} />;
};

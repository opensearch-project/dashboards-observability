/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { DEFAULT_PALETTE } from '../../../../../common/constants/colors';
import {
  AGGREGATIONS,
  GROUPBY,
  PIE_XAXIS_GAP,
  PIE_YAXIS_GAP,
  PLOTLY_PIE_COLUMN_NUMBER,
} from '../../../../../common/constants/explorer';
import { PLOT_MARGIN, PLOTLY_COLOR } from '../../../../../common/constants/shared';
import { IVisualizationContainerProps } from '../../../../../common/types/explorer';
import { getTooltipHoverInfo } from '../../../event_analytics/utils/utils';
import { Plt } from '../../plotly/plot';
import { transformPreprocessedDataToTraces, preprocessJsonData } from '../shared/common';

export const Pie = ({ visualizations, layout, config }: any) => {
  const {
    data: {
      explorer: {
        explorerData: { jsonData: fieldValueMapList },
      },
      userConfigs: {
        dataConfig: {
          chartStyles = {},
          span = {},
          legend = {},
          panelOptions = {},
          tooltipOptions = {},
          [GROUPBY]: dimensions = [],
          [AGGREGATIONS]: series = [],
        } = {},
        layoutConfig = {},
      } = {},
    } = {},
    vis: { mode, showlegend, legendSize, labelSize, legendposition },
  }: IVisualizationContainerProps = visualizations;

  const type = chartStyles.mode || mode;
  const colorTheme = chartStyles.colorTheme ? chartStyles.colorTheme : { name: DEFAULT_PALETTE };
  const showLegend = legend.showLegend === 'hidden' ? false : showlegend;
  const chartLegendSize = legend.size || legendSize;
  const chartLabelSize = chartStyles.labelSize || labelSize;
  const title = panelOptions.title || layoutConfig.layout?.title || '';

  const pieTreaces = useMemo(() => {
    const chartConfigs = {
      dimensions,
      series,
      breakdowns: [], // pie doesn't support breakdowns
      span,
      isVertical: true,
    };
    const pieSpecificMetaData = {
      x_coordinate: 'labels',
      y_coordinate: 'values',
    };

    return transformPreprocessedDataToTraces(
      preprocessJsonData(fieldValueMapList, chartConfigs),
      chartConfigs,
      pieSpecificMetaData
    );
  }, [chartStyles, fieldValueMapList, dimensions, series, [], span, tooltipOptions]);

  const pies = useMemo(
    () =>
      pieTreaces.map((pieTrace: any, index: number) => {
        return {
          labels: pieTrace.labels,
          values: pieTrace.values,
          type: 'pie',
          name: pieTrace.name,
          hole: type === 'pie' ? 0 : 0.5,
          text: pieTrace.name,
          textinfo: 'percent',
          hoverinfo: getTooltipHoverInfo({
            tooltipMode: tooltipOptions.tooltipMode,
            tooltipText: tooltipOptions.tooltipText,
          }),
          automargin: true,
          textposition: 'outside',
          title: { text: pieTrace.name },
          domain: {
            row: Math.floor(index / PLOTLY_PIE_COLUMN_NUMBER),
            column: index % PLOTLY_PIE_COLUMN_NUMBER,
          },
          marker: {
            colors: [...PLOTLY_COLOR],
          },
          outsidetextfont: {
            size: chartLabelSize,
          },
        };
      }),
    [chartLabelSize, colorTheme]
  );

  const mergedLayout = useMemo(() => {
    const isAtleastOneFullRow = Math.floor(pieTreaces.length / PLOTLY_PIE_COLUMN_NUMBER) > 0;
    return {
      grid: {
        xgap: PIE_XAXIS_GAP,
        ygap: PIE_YAXIS_GAP,
        rows: Math.floor(pieTreaces.length / PLOTLY_PIE_COLUMN_NUMBER) + 1,
        columns: isAtleastOneFullRow ? PLOTLY_PIE_COLUMN_NUMBER : pieTreaces.length,
        pattern: 'independent',
      },
      ...layout,
      ...(layoutConfig.layout && layoutConfig.layout),
      legend: {
        ...layout.legend,
        orientation: legend.position || legendposition,
        ...(chartLegendSize && {
          font: { size: chartLegendSize },
        }),
      },
      showlegend: showLegend,
      margin: {
        ...PLOT_MARGIN,
        t: 100,
      },
      title: {
        text: title,
        xanchor: 'right',
        yanchor: 'top',
        x: 1,
        y: 1,
        xref: 'paper',
        yref: 'container',
      },
    };
  }, [layoutConfig.layout, title, layout.legend]);

  const mergedConfigs = useMemo(
    () => ({
      ...config,
      ...(layoutConfig.config && layoutConfig.config),
    }),
    [config, layoutConfig.config]
  );

  return <Plt data={pies} layout={mergedLayout} config={mergedConfigs} />;
};

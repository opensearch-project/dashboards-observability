/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useMemo } from 'react';
import { colorPalette } from '@elastic/eui';
import forEach from 'lodash/forEach';
import isEmpty from 'lodash/isEmpty';
import map from 'lodash/map';
import Plotly from 'plotly.js-dist';
import {
  HEATMAP_PALETTE_COLOR,
  HEATMAP_SINGLE_COLOR,
  OPACITY,
  SINGLE_COLOR_PALETTE,
} from '../../../../../common/constants/colors';
import {
  hexToRgb,
  lightenColor,
  getPropName,
} from '../../../../components/event_analytics/utils/utils';
import { IVisualizationContainerProps } from '../../../../../common/types/explorer';
import { Plt } from '../../plotly/plot';
import { AGGREGATIONS, GROUPBY } from '../../../../../common/constants/explorer';
import { PLOT_MARGIN } from '../../../../../common/constants/shared';
import {
  getCompleteTimespanKey,
  removeBackTick,
} from '../../../visualizations/charts/shared/common';
import { removeBacktick } from '../../../../../common/utils';

export const HeatMap = ({ visualizations, layout, config }: any) => {
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
          tooltipOptions = {},
          panelOptions = {},
          [GROUPBY]: dimensions = [],
          [AGGREGATIONS]: series = [],
        } = {},
        layoutConfig = {},
      } = {},
    } = {},
    vis: { icontype },
  }: IVisualizationContainerProps = visualizations;

  const combinedDemensions = [
    ...(!isEmpty(span) ? [getCompleteTimespanKey(span)] : []),
    ...dimensions,
  ];

  const xaxisField = { ...combinedDemensions[0] };
  const yaxisField = { ...combinedDemensions[1] };
  const zMetrics = { ...series[0] };
  const tooltipMode =
    tooltipOptions.tooltipMode !== undefined ? tooltipOptions.tooltipMode : 'show';
  const tooltipText = tooltipOptions.tooltipText !== undefined ? tooltipOptions.tooltipText : 'all';

  const colorField = chartStyles
    ? chartStyles.colorMode && chartStyles.colorMode[0].name === OPACITY
      ? chartStyles.color ?? HEATMAP_SINGLE_COLOR
      : chartStyles.scheme ?? HEATMAP_PALETTE_COLOR
    : HEATMAP_PALETTE_COLOR;
  const showColorscale = legend.showLegend ?? 'show';

  const traceColor: any = [];
  if (colorField.name === SINGLE_COLOR_PALETTE) {
    const colorsArray = colorPalette([lightenColor(colorField.color, 50), colorField.color], 10);
    colorsArray.map((hexCode, index) => {
      traceColor.push([
        (index !== colorsArray.length - 1 ? index : 10) / 10,
        hexToRgb(hexCode, 1, false),
      ]);
    });
  }

  const heatMapAxes = useMemo(() => {
    const dmaps = new Map<string, any>(); // key: values of 1st and 2nd group-by fields combined
    const uniqueXaxisVals = new Set<any>(); // any value for a field
    const uniqueYaxisVals = new Set<any>(); // any value for a field
    const zKey = getPropName(zMetrics);

    forEach(fieldValueMapList, (entry) => {
      const backtickRemovedEntry = removeBackTick(entry);
      const xKey = removeBacktick(xaxisField.label);
      const yKey = removeBacktick(yaxisField.label);

      // collect unique values from all values of 1st and 2nd group-by fields
      // for later composing 2 dimensional heatmap x, y axes
      uniqueXaxisVals.add(backtickRemovedEntry[xKey]);
      uniqueYaxisVals.add(backtickRemovedEntry[yKey]);

      // establish 1st,2nd -> data entry mapping for later filling in
      // corresponding aggregations to 2 dimensional heatmap zaxis
      dmaps.set(
        `${backtickRemovedEntry[xKey]},${backtickRemovedEntry[yKey]}`,
        backtickRemovedEntry
      );
    });

    const xAxis = [...uniqueXaxisVals];
    const yAxis = [...uniqueYaxisVals];
    const zaxis = map(yAxis, (yvalue) => {
      return map(xAxis, (xvalue) => {
        return dmaps.get(`${xvalue},${yvalue}`) ? dmaps.get(`${xvalue},${yvalue}`)[zKey] : null;
      });
    });

    return {
      z: zaxis,
      x: xAxis,
      y: yAxis,
    };
  }, [fieldValueMapList]);

  const heapMapData: Plotly.Data[] = [
    {
      ...heatMapAxes,
      hoverinfo: tooltipMode === 'hidden' ? 'none' : tooltipText,
      colorscale: colorField.name === SINGLE_COLOR_PALETTE ? traceColor : colorField.name,
      type: 'heatmap',
      showscale: showColorscale === 'show',
    },
  ];

  layout.yaxis = { autosize: true, automargin: true };
  const mergedLayout = {
    ...layout,
    ...(layoutConfig.layout && layoutConfig.layout),
    title: panelOptions.title || layoutConfig.layout?.title || '',
    margin: PLOT_MARGIN,
  };

  const mergedConfigs = useMemo(
    () => ({
      ...config,
      ...(layoutConfig.config && layoutConfig.config),
    }),
    [config, layoutConfig.config]
  );

  return <Plt data={heapMapData} layout={mergedLayout} config={mergedConfigs} />;
};

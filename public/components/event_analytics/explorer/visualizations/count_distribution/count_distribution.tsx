/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiPanel } from '@elastic/eui';
import { BarOrientation, LONG_CHART_COLOR } from '../../../../../../common/constants/shared';
import { Plt } from '../../../../visualizations/plotly/plot';
import { fillTimeDataWithEmpty } from '../../../utils/utils';

export const CountDistribution = ({
  countDistribution,
  selectedInterval,
  startTime,
  endTime,
}: any) => {
  if (
    !countDistribution ||
    !countDistribution.data ||
    !countDistribution.metadata ||
    !countDistribution.metadata.fields ||
    !selectedInterval
  )
    return null;

  const {
    data,
    metadata: { fields },
  } = countDistribution;

  const finalData = [
    {
      x: [...data[fields[1].name]],
      y: [...data[fields[0].name]],
      type: 'bar',
      name: fields[0],
      orientation: BarOrientation.vertical,
    },
  ];

  // fill the final data with the exact right amount of empty buckets
  function fillWithEmpty(processedData: any) {
    // original x and y fields
    const xVals = processedData[0].x;
    const yVals = processedData[0].y;

    const { buckets, values } = fillTimeDataWithEmpty(
      xVals,
      yVals,
      selectedInterval.replace(/^auto_/, ''),
      startTime,
      endTime
    );

    // replace old x and y values with new
    processedData[0].x = buckets;
    processedData[0].y = values;

    // // at the end, return the new object
    return processedData;
  }

  return (
    <Plt
      data={fillWithEmpty(finalData)}
      layout={{
        showlegend: true,
        margin: {
          l: 60,
          r: 10,
          b: 15,
          t: 30,
          pad: 0,
        },
        height: 220,
        colorway: [LONG_CHART_COLOR],
      }}
    />
  );
};

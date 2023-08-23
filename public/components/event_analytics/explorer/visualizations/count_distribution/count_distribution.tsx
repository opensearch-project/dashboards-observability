/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import moment from 'moment';
import { BarOrientation, LONG_CHART_COLOR } from '../../../../../../common/constants/shared';
import { Plt } from '../../../../visualizations/plotly/plot';

export const CountDistribution = ({ countDistribution, selectedInterval }: any) => {
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

  // fill the final data with the exact right amount of empty x plot points
  function fillWithEmpty(processedData: any) {
    console.log(selectedInterval.replace(/^auto_/, '')); // to delete

    // TODO: derive a start date
    const startDate = moment('2023-01-01 00:00:00');
    // TODO: derive end date
    const endDate = moment('2023-12-01 00:00:00');

    // create new x and y arrays
    const x = [];
    const y = [];

    // current x values
    const xVals = processedData[0].x;
    const yVals = processedData[0].y;
    let currxIndex = 0;

    // have a current date variable
    const currentDate = startDate;

    // from start -> end, iterate
    while (currentDate < endDate) {
      // TODO: make invariant check to see that no x value would be getting skipped over
      // if this date already exists in the x field, continue
      if (currentDate.isSame(xVals[currxIndex])) {
        // TODO: add invariant checking that currxIndex is never over the max num of old values
        x.push(xVals[currxIndex]);
        y.push(yVals[currxIndex]);
        currxIndex++; // advance the pointer for old x values, we've used this last value
      } else {
        // if we cannot find current date in old x values, add it in
        x.push(currentDate.format('YYYY-MM-DD HH:mm:ss'));
        y.push(0);
      }

      // Note: moments are mutable. the below function will create a new moment. should this still be done?
      currentDate.add(1, selectedInterval.replace(/^auto_/, ''));
    }

    // replace x and y with the new arrays
    processedData[0].x = x;
    processedData[0].y = y;

    // at the end, return the new object
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

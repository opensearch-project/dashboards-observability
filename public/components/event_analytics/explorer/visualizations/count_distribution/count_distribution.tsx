/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import moment from 'moment';
import datemath from '@elastic/datemath';
import { BarOrientation, LONG_CHART_COLOR } from '../../../../../../common/constants/shared';
import { Plt } from '../../../../visualizations/plotly/plot';
import { DATE_PICKER_FORMAT } from '../../../../../../common/constants/explorer';

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

    const intervalPeriod = selectedInterval.replace(/^auto_/, '');

    // parses out datetime for start and end, then reformats
    const startDate = datemath
      .parse(startTime)
      ?.startOf(intervalPeriod === 'w' ? 'isoWeek' : intervalPeriod);
    const endDate = datemath
      .parse(endTime)
      ?.startOf(intervalPeriod === 'w' ? 'isoWeek' : intervalPeriod);
    // TODO: figure out how to handle an error here - which would happen if start/endTime were
    // to somehow be invalid for datemath.parse, but that would be a flaw in the datepicker
    // component if that happens
    if (startDate === undefined || endDate === undefined) {
      return null;
    }

    // find the number of buckets
    // below essentially does ((end - start) / interval_period) + 1
    const numBuckets = endDate.diff(startDate, intervalPeriod) + 1;

    // populate buckets as x values in the graph
    const buckets = [startDate.format(DATE_PICKER_FORMAT)];
    const currentDate = startDate;
    for (let i = 1; i < numBuckets; i++) {
      const nextBucket = currentDate.add(1, intervalPeriod);
      buckets.push(nextBucket.format(DATE_PICKER_FORMAT));
    }

    // create y values, use old y values if they exist
    const values: number[] = [];
    buckets.forEach((bucket) => {
      const bucketIndex = xVals.findIndex((x: string) => x === bucket);
      if (bucketIndex !== undefined) {
        values.push(yVals[bucketIndex]);
      } else {
        values.push(0);
      }
    });

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

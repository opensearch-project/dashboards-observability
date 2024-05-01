/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { selectCountDistribution } from '../../redux/slices/count_distribution_slice';

export const getTimeRangeFromCountDistribution = (
  countDistribution: ReturnType<typeof selectCountDistribution>[string]
): { startTime?: string; endTime?: string } => {
  const {
    data,
    metadata: { fields },
  } = countDistribution;
  // fields[1] is the x-axis (time buckets) in count distribution
  return { startTime: data[fields[1].name].at(0), endTime: data[fields[1].name].at(-1) };
};

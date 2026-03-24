/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { parseTimeRange, getTimeInSeconds } from '../utils/time_utils';
import { calculateStep, formatPrometheusDuration } from '../utils/step_utils';

/**
 * Compute the chart step window for sum_over_time aggregation in count charts.
 * Returns a Prometheus duration string (e.g., "1m", "5m") or undefined on error.
 */
export const useChartStepWindow = (timeRange: { from: string; to: string }): string | undefined => {
  return useMemo(() => {
    try {
      const { startTime, endTime } = parseTimeRange(timeRange);
      const step = calculateStep(getTimeInSeconds(startTime), getTimeInSeconds(endTime));
      return formatPrometheusDuration(step);
    } catch {
      return undefined;
    }
  }, [timeRange]);
};

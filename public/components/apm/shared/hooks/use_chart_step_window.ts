/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { parseTimeRange, getTimeInSeconds } from '../utils/time_utils';
import { calculateStep, formatPrometheusDuration } from '../utils/step_utils';

interface ChartStepWindow {
  /** Prometheus duration string for sum_over_time (e.g., "1m", "5m"), or undefined on error */
  window: string | undefined;
  /** Step size in seconds */
  stepSeconds: number | undefined;
  /** Total time range in seconds, used as divisor for per-second rate calculation */
  timeRangeSeconds: number | undefined;
}

/**
 * Compute the chart step window for sum_over_time aggregation in count charts.
 * Returns both the formatted Prometheus duration string and the raw step in seconds.
 *
 * IMPORTANT: The resolution parameter must match the resolution used by the chart
 * consumer (e.g., RESOLUTION_LOW for PromQLMetricCard, RESOLUTION_MEDIUM for PromQLLineChart).
 * A mismatch causes the sum_over_time window to differ from the range query step,
 * leading to gaps (undercounting) or overlaps (overcounting) in the data.
 *
 * @param timeRange - Time range with from/to strings
 * @param resolution - Target number of data points (must match the chart's resolution)
 */
export const useChartStepWindow = (
  timeRange: { from: string; to: string },
  resolution?: number
): ChartStepWindow => {
  return useMemo(() => {
    try {
      const { startTime, endTime } = parseTimeRange(timeRange);
      const startSec = getTimeInSeconds(startTime);
      const endSec = getTimeInSeconds(endTime);
      const step = calculateStep(startSec, endSec, resolution);
      return {
        window: formatPrometheusDuration(step),
        stepSeconds: step,
        timeRangeSeconds: endSec - startSec,
      };
    } catch {
      return { window: undefined, stepSeconds: undefined, timeRangeSeconds: undefined };
    }
  }, [timeRange, resolution]);
};

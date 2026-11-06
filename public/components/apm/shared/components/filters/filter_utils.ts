/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import {
  AvailabilityThreshold,
  ErrorRateThreshold,
  THRESHOLD_LABELS,
  AVAILABILITY_THRESHOLD_OPTIONS,
  ERROR_RATE_THRESHOLD_OPTIONS,
} from '../../../common/constants';
import { SEVERITY_HEX } from '../../../../alerting/alert_colors';

// Re-export for convenience (consumers can import from filter_utils or constants)
export {
  AvailabilityThreshold,
  ErrorRateThreshold,
  THRESHOLD_LABELS,
  AVAILABILITY_THRESHOLD_OPTIONS,
  ERROR_RATE_THRESHOLD_OPTIONS,
};

/**
 * Color for a threshold filter option, from the Alert Manager severity palette
 * (`SEVERITY_HEX`) so topology thresholds don't introduce a third palette: the
 * worst bucket uses the Critical slot, the middle one Medium, the best one Low.
 *
 * @param threshold - The semantic threshold enum value (e.g., AvailabilityThreshold.LOW)
 * @param type - The type of threshold ('availability' or 'errorRate')
 * @returns The severity-palette color for that bucket
 */
export const getThemeAwareThresholdColor = (
  threshold: AvailabilityThreshold | ErrorRateThreshold,
  type: 'availability' | 'errorRate'
): string => {
  if (type === 'availability') {
    // For availability, low is the worst bucket.
    if (threshold === AvailabilityThreshold.LOW) return SEVERITY_HEX.critical;
    if (threshold === AvailabilityThreshold.MEDIUM) return SEVERITY_HEX.medium;
    if (threshold === AvailabilityThreshold.HIGH) return SEVERITY_HEX.low;
  } else {
    // For error rates, high is the worst bucket.
    if (threshold === ErrorRateThreshold.HIGH) return SEVERITY_HEX.critical;
    if (threshold === ErrorRateThreshold.MEDIUM) return SEVERITY_HEX.medium;
    if (threshold === ErrorRateThreshold.LOW) return SEVERITY_HEX.low;
  }
  return euiThemeVars.euiColorMediumShade;
};

/**
 * Check if value matches availability threshold using semantic enum key
 */
export const matchesAvailabilityThreshold = (
  availability: number,
  threshold: AvailabilityThreshold
): boolean => {
  switch (threshold) {
    case AvailabilityThreshold.LOW:
      return availability < 95;
    case AvailabilityThreshold.MEDIUM:
      return availability >= 95 && availability < 99;
    case AvailabilityThreshold.HIGH:
      return availability >= 99;
    default:
      return false;
  }
};

/**
 * Check if value matches error rate threshold using semantic enum key
 */
export const matchesErrorRateThreshold = (rate: number, threshold: ErrorRateThreshold): boolean => {
  switch (threshold) {
    case ErrorRateThreshold.LOW:
      return rate < 1;
    case ErrorRateThreshold.MEDIUM:
      return rate >= 1 && rate <= 5;
    case ErrorRateThreshold.HIGH:
      return rate > 5;
    default:
      return false;
  }
};

/**
 * Get display label for a threshold
 */
export const getThresholdLabel = (
  threshold: AvailabilityThreshold | ErrorRateThreshold,
  type: 'availability' | 'errorRate'
): string => {
  if (type === 'availability') {
    return THRESHOLD_LABELS.availability[threshold as AvailabilityThreshold];
  }
  return THRESHOLD_LABELS.errorRate[threshold as ErrorRateThreshold];
};

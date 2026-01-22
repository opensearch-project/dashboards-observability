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

// Re-export for convenience (consumers can import from filter_utils or constants)
export {
  AvailabilityThreshold,
  ErrorRateThreshold,
  THRESHOLD_LABELS,
  AVAILABILITY_THRESHOLD_OPTIONS,
  ERROR_RATE_THRESHOLD_OPTIONS,
};

/**
 * Get theme-aware color for threshold filters using semantic enum keys
 * Supports both availability and error rate thresholds with proper dark/light mode colors
 * Uses euiThemeVars which automatically adapts to the current theme
 *
 * @param threshold - The semantic threshold enum value (e.g., AvailabilityThreshold.LOW)
 * @param type - The type of threshold ('availability' or 'errorRate')
 * @returns The appropriate color from the theme
 */
export const getThemeAwareThresholdColor = (
  threshold: AvailabilityThreshold | ErrorRateThreshold,
  type: 'availability' | 'errorRate'
): string => {
  if (type === 'availability') {
    // For availability, high is good (green), low is bad (red)
    if (threshold === AvailabilityThreshold.LOW) return euiThemeVars.euiColorDanger;
    if (threshold === AvailabilityThreshold.MEDIUM) return euiThemeVars.euiColorWarning;
    if (threshold === AvailabilityThreshold.HIGH) return euiThemeVars.euiColorSuccess;
  } else {
    // For error rates, low is good (green), high is bad (red)
    if (threshold === ErrorRateThreshold.HIGH) return euiThemeVars.euiColorDanger;
    if (threshold === ErrorRateThreshold.MEDIUM) return euiThemeVars.euiColorWarning;
    if (threshold === ErrorRateThreshold.LOW) return euiThemeVars.euiColorSuccess;
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

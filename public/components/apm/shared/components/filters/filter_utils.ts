/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { euiThemeVars } from '@osd/ui-shared-deps/theme';

/**
 * Available failure rate threshold options
 */
export const FAILURE_RATE_THRESHOLDS = ['< 1%', '1-5%', '> 5%'] as const;
export type FailureRateThreshold = typeof FAILURE_RATE_THRESHOLDS[number];

/**
 * Available availability threshold options
 */
export const AVAILABILITY_THRESHOLDS = ['< 95%', '95-99%', '≥ 99%'] as const;
export type AvailabilityThreshold = typeof AVAILABILITY_THRESHOLDS[number];

/**
 * Get theme-aware color for threshold filters
 * Supports both availability and error rate thresholds with proper dark/light mode colors
 * Uses euiThemeVars which automatically adapts to the current theme
 *
 * @param threshold - The threshold string (e.g., '< 95%', '> 5%')
 * @param type - The type of threshold ('availability' or 'errorRate')
 * @returns The appropriate color from the theme
 */
export const getThemeAwareThresholdColor = (
  threshold: string,
  type: 'availability' | 'errorRate'
): string => {
  if (type === 'availability') {
    // For availability, high is good (green), low is bad (red)
    if (threshold === '< 95%') return euiThemeVars.euiColorDanger;
    if (threshold === '95-99%') return euiThemeVars.euiColorWarning;
    if (threshold === '≥ 99%') return euiThemeVars.euiColorSuccess;
  } else {
    // For error rates, low is good (green), high is bad (red)
    if (threshold === '> 5%') return euiThemeVars.euiColorDanger;
    if (threshold === '1-5%') return euiThemeVars.euiColorWarning;
    if (threshold === '< 1%') return euiThemeVars.euiColorSuccess;
  }
  return euiThemeVars.euiColorMediumShade;
};

/**
 * Check if a failure ratio matches the given threshold
 * @param failureRatio - The failure ratio as a percentage (5.0 = 5%)
 * @param threshold - The threshold string to check against
 * @returns boolean indicating if the ratio matches the threshold
 */
export const matchesFailureRateThreshold = (
  failureRatio: number,
  threshold: FailureRateThreshold
): boolean => {
  // failureRatio comes as percentage (5.0 = 5%)
  if (threshold === '< 1%') return failureRatio < 1;
  if (threshold === '1-5%') return failureRatio >= 1 && failureRatio <= 5;
  if (threshold === '> 5%') return failureRatio > 5;
  return false;
};

/**
 * Check if a failure ratio matches ANY of the selected thresholds (OR logic)
 * @param failureRatio - The failure ratio as a percentage
 * @param selectedThresholds - Array of selected threshold strings
 * @returns boolean - true if matches any threshold, or if no thresholds selected (show all)
 */
export const matchesAnyFailureRateThreshold = (
  failureRatio: number,
  selectedThresholds: string[]
): boolean => {
  if (selectedThresholds.length === 0) return true; // No filter = show all
  return selectedThresholds.some((threshold) =>
    matchesFailureRateThreshold(failureRatio, threshold as FailureRateThreshold)
  );
};

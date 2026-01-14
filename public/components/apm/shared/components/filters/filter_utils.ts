/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Available failure rate threshold options
 */
export const FAILURE_RATE_THRESHOLDS = ['< 1%', '1-5%', '> 5%'] as const;
export type FailureRateThreshold = typeof FAILURE_RATE_THRESHOLDS[number];

/**
 * Get color for failure rate threshold (SLO-style coloring)
 * - Low failure rate (< 1%) = green (success)
 * - Medium failure rate (1-5%) = yellow (warning)
 * - High failure rate (> 5%) = red (danger)
 */
export const getThresholdColor = (threshold: string): string => {
  if (threshold === '> 5%') return '#BD271E'; // danger
  if (threshold === '1-5%') return '#F5A700'; // warning
  if (threshold === '< 1%') return '#017D73'; // success
  return '#69707D'; // default subdued gray
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

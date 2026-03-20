/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Resolution constants matching Prometheus UI conventions
// See: https://github.com/prometheus/prometheus/blob/5b96e611dcc847e58cd3871bd741cbbdbac47b08/web/ui/mantine-ui/src/state/queryPageSlice.ts#L30
// RESOLUTION_LOW targets ~100 data points (sparklines), RESOLUTION_MEDIUM targets ~250 (full charts)
export const RESOLUTION_LOW = 101; // sparklines
export const RESOLUTION_MEDIUM = 258; // full charts
const MIN_STEP_INTERVAL = 15; // seconds

function roundInterval(intervalMs: number): number {
  if (intervalMs <= 1) return 1;

  const magnitude = Math.pow(10, Math.floor(Math.log10(intervalMs)));
  const normalized = intervalMs / magnitude;

  let nice: number;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 5) nice = 5;
  else nice = 10;

  return Math.round(nice * magnitude);
}

export function calculateStep(
  startTimeSec: number,
  endTimeSec: number,
  resolution: number = RESOLUTION_MEDIUM,
  minIntervalSec: number = MIN_STEP_INTERVAL
): number {
  const durationMs = (endTimeSec - startTimeSec) * 1000;
  const rawIntervalMs = durationMs / resolution;
  const roundedIntervalMs = roundInterval(rawIntervalMs);
  const stepSec = roundedIntervalMs / 1000;
  return Math.max(stepSec, minIntervalSec);
}

/**
 * Format seconds as a human-readable Prometheus duration string.
 * Uses the largest clean unit: 86400 → "1d", 3600 → "1h", 1800 → "30m", 45 → "45s"
 */
export function formatPrometheusDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

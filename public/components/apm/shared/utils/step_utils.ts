/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Resolution constants matching Prometheus UI conventions
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

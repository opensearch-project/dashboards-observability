/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared formatting utilities for APM metric values.
 * These formatters ensure consistent display of numbers across all APM tables and components.
 */

/**
 * Format large numbers with K/M suffix
 * 1000 → 1K, 1000000 → 1M
 */
export const formatCount = (value: number | undefined): string => {
  if (value === undefined || isNaN(value)) return '-';
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(0);
};

/**
 * Format percentage values for axis labels (1 decimal)
 * Note: The second parameter is ignored to prevent ECharts axis formatter
 * from passing the tick index as decimals
 */
export const formatPercentage = (value: number | undefined, _decimals?: number): string => {
  if (value === undefined || isNaN(value)) return '-';
  return `${value.toFixed(1)}%`;
};

/**
 * Format percentage values for tooltip/data display (2 decimals for precision)
 */
export const formatPercentageValue = (value: number | undefined): string => {
  if (value === undefined || isNaN(value)) return '-';
  return `${value.toFixed(2)}%`;
};

/**
 * Format latency in ms, converting to seconds if >= 1000ms
 */
export const formatLatency = (valueMs: number | undefined): string => {
  if (valueMs === undefined || isNaN(valueMs)) return '-';
  if (valueMs >= 1000) return `${(valueMs / 1000).toFixed(2)}s`;
  return `${valueMs.toFixed(0)} ms`;
};

/**
 * Format latency from seconds (PromQL returns seconds)
 */
export const formatLatencyFromSeconds = (valueSec: number | undefined): string => {
  if (valueSec === undefined || isNaN(valueSec)) return '-';
  const ms = valueSec * 1000;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(0)} ms`;
};

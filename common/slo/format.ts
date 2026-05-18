/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface FormatPctOptions {
  decimals?: number;
  fallback?: string;
}

export function formatPct(value: number, options: FormatPctOptions = {}): string {
  const { decimals = 1, fallback = '—' } = options;
  if (!Number.isFinite(value)) return fallback;
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Tabular-number CSS. Apply to any rendered percentage / count that sits in a
 * column or row where digits need to line up between cells. `tnum` OpenType
 * feature is the modern way; `fontFeatureSettings` is kept as a fallback for
 * older Safari that doesn't yet honor `font-variant-numeric: tabular-nums`.
 *
 * Typed as plain property literals so the object is importable from server
 * code without pulling in React — client callers spread it into a `style`
 * prop and React accepts the literal types.
 */
export const TABULAR_NUMS_STYLE = {
  fontVariantNumeric: 'tabular-nums' as const,
  fontFeatureSettings: '"tnum"' as const,
};

/**
 * SLO numeric precision policy (audit P1 #12). Render contexts share a
 * precision so decimals line up column-to-column — a budget card mixing
 * `100%` / `100.0%` / `100.00%` was the original offender.
 */
export const SLO_PRECISION = {
  /** Attainment and target percentages in grids/tables. */
  attainment: 2,
  /** Target when it sits beside attainment (decimals must match). */
  target: 2,
  /** Budget remaining / consumed in the bar + tile. */
  budget: 2,
  /** Events (1h) ratio tile subtitle. */
  eventsRatio: 1,
  /** Burn-rate multiplier ("3.2×"). */
  burnRate: 1,
};

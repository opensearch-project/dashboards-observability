/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';

export interface FormatPctOptions {
  decimals?: number;
  fallback?: string;
}

/**
 * Localized empty-value glyph, shown when a percentage cannot be computed
 * (non-finite input). Exposed as the default `fallback` for {@link formatPct}
 * and as a named constant so translators can swap the em dash for a
 * locale-appropriate indicator instead of a hardcoded latin glyph (audit
 * CLAR10). `@osd/i18n` is server-safe in `common/` — already used by sibling
 * modules such as `slo_templates.ts` at module load.
 */
export const EMPTY_VALUE_FALLBACK = i18n.translate('observability.slo.format.emptyValue', {
  defaultMessage: '—',
});

export function formatPct(value: number, options: FormatPctOptions = {}): string {
  const { decimals = 1, fallback = EMPTY_VALUE_FALLBACK } = options;
  if (!Number.isFinite(value)) return fallback;
  // `Intl.NumberFormat` percent style places the `%` sign (and any grouping)
  // per locale and multiplies by 100 itself, so we pass the raw ratio — NOT
  // `value * 100` — and pin both fraction-digit bounds to `decimals` for a
  // fixed number of decimals.
  //
  // Rounding note: `Intl` uses half-expand (round half away from zero), which
  // can differ in the last digit from the old `(value*100).toFixed(decimals)`
  // at exact half-way inputs (e.g. `0.99985`/2 → `99.99%` here vs `99.98%`
  // from `toFixed`, whose result is driven by the IEEE-754 representation).
  // This is intentional — standard rounding, and no caller parses the string
  // back to a number — so display may shift by one unit in the last decimal
  // versus the pre-i18n formatter.
  return new Intl.NumberFormat(i18n.getLocale(), {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
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
 * SLO numeric precision policy (audit P1 #12, CLAR3). THE single source of
 * truth for how many decimal places each SLO surface renders — pass the
 * relevant key as `formatPct`'s `decimals` so the same value reads identically
 * across the listing, overview panel, detail page, and charts. Budget-remaining
 * was previously rendered at four different precisions; every surface must read
 * from this map (callers migrate to it) rather than hardcoding a `decimals`.
 *
 * One key per render context — pick by WHERE the number is shown, not what it
 * means, so co-located numbers keep matching decimals:
 *   - `attainment` — attainment % in the listing grid, overview panel, detail.
 *   - `target`     — target % wherever it sits beside attainment (must match it).
 *   - `budget`     — error-budget remaining / consumed in the budget bar + tile.
 *   - `eventsRatio`— good/total events (1h) ratio tile subtitle.
 *   - `burnRate`   — burn-rate multiplier ("3.2×").
 *
 * NOTE: `formatPct`'s default `decimals = 1` intentionally differs from the
 * `2`-place policy keys above; it is left unchanged to avoid altering every
 * existing caller's output — SLO surfaces should pass an explicit key.
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

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PPL look-back window helpers for logs (PPL) alerting rules.
 *
 * A PPL monitor runs its query on a schedule. Without a time bound the query
 * scans the whole index every run, so the same old rows keep matching and the
 * rule re-fires forever. The look-back window bounds each run to "the last N
 * units" by injecting a sliding-window `where` filter into the query:
 *
 *     | where <timestampField> > DATE_SUB(NOW(), INTERVAL <n> <UNIT>)
 *
 * The window is evaluated dynamically at each execution (`NOW()`), unlike an
 * absolute `TIMESTAMP('…')` literal which would freeze the range at save time.
 *
 * Ported from the alerting-dashboards-plugin PPL monitor implementation
 * (`pplAlertingHelpers.js`) so the two surfaces stay wire-compatible. Pure
 * functions with no React / Node dependencies — safe to import from `public/`,
 * `server/`, and unit tests.
 */

/** Cluster-side hard cap the alerting backend enforces: 7 days. */
export const LOOKBACK_WINDOW_MAX_MINUTES = 10080;

export type LookBackUnit = 'minutes' | 'hours' | 'days';

/** Form fields that describe a look-back window. */
export interface LookBackFields {
  useLookBackWindow?: boolean;
  lookBackAmount?: number;
  lookBackUnit?: LookBackUnit | string;
  /** Field the sliding `where` filter is applied to. Required to inject. */
  lookbackTimestampField?: string;
}

/**
 * Total look-back window in minutes, or `0` when disabled / invalid.
 * `0` is the "no window" sentinel every caller checks with `> 0`.
 */
export function computeLookBackMinutes(fields: LookBackFields): number {
  if (!fields?.useLookBackWindow) return 0;
  const amount = Number(fields.lookBackAmount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const unit = String(fields.lookBackUnit || 'hours').toLowerCase();
  if (unit.startsWith('minute')) return Math.floor(amount);
  if (unit.startsWith('hour')) return Math.floor(amount * 60);
  if (unit.startsWith('day')) return Math.floor(amount * 1440);
  return Math.floor(amount);
}

const escapeRegExp = (s: string): string => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Format minutes as a PPL `INTERVAL` expression, picking the coarsest exact
 * unit (e.g. 1440 -> `1 DAY`, 120 -> `2 HOUR`, 30 -> `30 MINUTE`).
 */
export function formatPplInterval(lookBackMinutes: number): string {
  if (lookBackMinutes % 1440 === 0) return `${lookBackMinutes / 1440} DAY`;
  if (lookBackMinutes % 60 === 0) return `${lookBackMinutes / 60} HOUR`;
  return `${lookBackMinutes} MINUTE`;
}

/**
 * Remove a previously injected look-back filter for `timestampField`. Handles
 * both the current sliding-window form (`DATE_SUB(NOW(), INTERVAL …)`) and the
 * legacy absolute-timestamp form (`> TIMESTAMP('…') and < TIMESTAMP('…')`) that
 * older monitors may have persisted, so injection is idempotent — editing or
 * re-saving never stacks stale filters.
 */
export function stripTimeFilterFromQuery(query: string, timestampField: string): string {
  if (!query || !timestampField) return query;
  const field = escapeRegExp(timestampField);
  const legacyAbsoluteClause = new RegExp(
    `\\s*\\|\\s*where\\s+${field}\\s*>\\s*TIMESTAMP\\('[^']*'\\)\\s+and\\s+${field}\\s*<\\s*TIMESTAMP\\('[^']*'\\)`,
    'gi'
  );
  const slidingWindowClause = new RegExp(
    `\\s*\\|\\s*where\\s+${field}\\s*>\\s*DATE_SUB\\(NOW\\(\\),\\s*INTERVAL\\s+\\d+\\s+(?:MINUTE|HOUR|DAY)S?\\)`,
    'gi'
  );
  return query.replace(legacyAbsoluteClause, '').replace(slidingWindowClause, '').trim();
}

/**
 * Inject a sliding time-window filter into a PPL query. Any previously injected
 * filter (either form) is stripped first, so calling this on an already
 * filtered query replaces the filter rather than stacking it. The clause is
 * placed before the first pipe so it runs ahead of aggregations.
 */
export function addTimeFilterToQuery(
  query: string,
  lookBackMinutes: number,
  timestampField: string
): string {
  if (!query || !timestampField || !lookBackMinutes || lookBackMinutes <= 0) return query;

  const cleanQuery = stripTimeFilterFromQuery(query, timestampField);
  const timeFilterClause = `| where ${timestampField} > DATE_SUB(NOW(), INTERVAL ${formatPplInterval(
    lookBackMinutes
  )})`;

  if (cleanQuery.includes('|')) {
    // Function replacer inserts the clause literally ($-patterns not interpreted).
    return cleanQuery.replace('|', () => `${timeFilterClause} |`);
  }
  // No pipes — append at the end.
  return `${cleanQuery} ${timeFilterClause}`;
}

/**
 * Apply the look-back window to a query for persistence: inject the sliding
 * filter when the window is enabled and a timestamp field is set, or strip any
 * previously injected filter when it is disabled. Returns the query unchanged
 * when there is no timestamp field to anchor on.
 */
export function applyLookBackToQuery(query: string, fields: LookBackFields): string {
  const timestampField = fields.lookbackTimestampField;
  if (!timestampField) return query;
  const minutes = computeLookBackMinutes(fields);
  if (minutes > 0) return addTimeFilterToQuery(query, minutes, timestampField);
  return stripTimeFilterFromQuery(query, timestampField);
}

const UNIT_BY_PPL: Record<string, LookBackUnit> = {
  MINUTE: 'minutes',
  HOUR: 'hours',
  DAY: 'days',
};

export interface ParsedLookBack {
  lookbackTimestampField: string;
  lookBackAmount: number;
  lookBackUnit: LookBackUnit;
  minutes: number;
}

/**
 * Recover the look-back window from an injected sliding filter. The alerting
 * `ppl_monitor` type does NOT persist `ui_metadata` (or any custom field), so
 * the injected `| where <field> > DATE_SUB(NOW(), INTERVAL n UNIT)` clause is
 * the only durable record of the window — this parses it back so the edit
 * flyout can restore the toggle/amount/unit/field. Returns `null` when no
 * recognizable window clause is present.
 */
export function parseLookBackFromQuery(query: string): ParsedLookBack | null {
  if (!query) return null;
  const re =
    /\|\s*where\s+([\w@.\-]+)\s*>\s*DATE_SUB\(NOW\(\),\s*INTERVAL\s+(\d+)\s+(MINUTE|HOUR|DAY)S?\)/i;
  const m = query.match(re);
  if (!m) return null;
  const lookbackTimestampField = m[1];
  const lookBackAmount = Number(m[2]);
  const lookBackUnit = UNIT_BY_PPL[m[3].toUpperCase()] || 'minutes';
  const minutes = computeLookBackMinutes({
    useLookBackWindow: true,
    lookBackAmount,
    lookBackUnit,
  });
  return { lookbackTimestampField, lookBackAmount, lookBackUnit, minutes };
}

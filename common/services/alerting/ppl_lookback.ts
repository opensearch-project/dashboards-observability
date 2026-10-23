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
 * units" by adding a sliding-window `where` clause to the query:
 *
 *     source = <indices> | where <timeField> > DATE_SUB(NOW(), INTERVAL <n> <UNIT>) | ...
 *
 * `ppl_monitor` persists no metadata alongside the query, so the clause itself
 * is the only record of the window. To keep that safe for queries users write
 * by hand, the plugin OWNS EXACTLY ONE CLAUSE AT ONE POSITION:
 *
 *   - Save inserts the clause at the first pipe (quote-aware) and never removes
 *     or rewrites anything the user wrote — including time filters of their own.
 *   - Edit recognises the clause only when it is the whole first pipe segment
 *     in the exact shape the plugin writes, and removes it losslessly. A
 *     hand-written time filter anywhere else (or compound, `>=`, absolute
 *     timestamps, …) is left verbatim in the query.
 *
 * A user time filter and the look-back window both apply (their intersection);
 * `hasUserTimeFilter` lets the UI warn about that.
 *
 * Pure functions with no React / Node dependencies — safe to import from
 * `public/`, `server/`, and unit tests.
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

/**
 * Format minutes as a PPL `INTERVAL` expression, picking the coarsest exact
 * unit (e.g. 1440 -> `1 DAY`, 120 -> `2 HOUR`, 30 -> `30 MINUTE`).
 */
export function formatPplInterval(lookBackMinutes: number): string {
  if (lookBackMinutes % 1440 === 0) return `${lookBackMinutes / 1440} DAY`;
  if (lookBackMinutes % 60 === 0) return `${lookBackMinutes / 60} HOUR`;
  return `${lookBackMinutes} MINUTE`;
}

// Identifiers PPL accepts without quoting (e.g. `@timestamp`, `event.time`).
const PLAIN_FIELD_RE = /^[A-Za-z_@][\w@.]*$/;

/**
 * Field reference for a PPL expression: bare when plain, else backtick-quoted.
 * A literal backtick in the name is dropped (`a`b` -> `ab`), so such a field
 * can't be targeted. Accepted: these names are vanishingly rare, and the
 * mismatch fails loudly — the backend rejects the unknown field on save.
 */
export function formatPplField(field: string): string {
  return PLAIN_FIELD_RE.test(field) ? field : `\`${field.replace(/`/g, '')}\``;
}

/**
 * Indices of the top-level pipe characters in a PPL query — pipes inside
 * single, double, or backtick quotes (e.g. `where msg = 'a|b'`) are skipped.
 */
export function findPipeIndices(query: string): number[] {
  const out: number[] = [];
  let quote: string | null = null;
  for (let i = 0; i < query.length; i++) {
    const ch = query[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
    } else if (ch === '|') {
      out.push(i);
    }
  }
  return out;
}

function buildClause(lookBackMinutes: number, timestampField: string): string {
  return `| where ${formatPplField(timestampField)} > DATE_SUB(NOW(), INTERVAL ${formatPplInterval(
    lookBackMinutes
  )})`;
}

/**
 * Insert the sliding time-window clause at the first top-level pipe so it runs
 * ahead of any aggregation. Pure insertion: nothing in the user's query is
 * removed or rewritten.
 */
export function addTimeFilterToQuery(
  query: string,
  lookBackMinutes: number,
  timestampField: string
): string {
  if (!query || !timestampField || !lookBackMinutes || lookBackMinutes <= 0) return query;
  const clause = buildClause(lookBackMinutes, timestampField);
  const [firstPipe] = findPipeIndices(query);
  if (firstPipe === undefined) return `${query.replace(/\s+$/, '')} ${clause}`;
  // `head + clause + ' ' + tail` — exactly reversible by parseLookBackFromQuery.
  return `${query.slice(0, firstPipe)}${clause} ${query.slice(firstPipe)}`;
}

/**
 * The query to persist: the user's query plus the look-back clause when the
 * window is enabled and anchored on a field; otherwise the query unchanged.
 */
export function applyLookBackToQuery(query: string, fields: LookBackFields): string {
  const timestampField = fields.lookbackTimestampField;
  const minutes = computeLookBackMinutes(fields);
  if (!timestampField || minutes <= 0) return query;
  return addTimeFilterToQuery(query, minutes, timestampField);
}

const UNIT_BY_PPL: Record<string, LookBackUnit> = {
  MINUTE: 'minutes',
  HOUR: 'hours',
  DAY: 'days',
};

// The exact shape `buildClause` writes (plural units and extra whitespace
// tolerated), as a whole pipe segment.
const INJECTED_SEGMENT_RE =
  /^\|\s*where\s+(`[^`]+`|[A-Za-z_@][\w@.]*)\s*>\s*DATE_SUB\(\s*NOW\(\s*\)\s*,\s*INTERVAL\s+(\d+)\s+(MINUTE|HOUR|DAY)S?\s*\)\s*$/i;

export interface ParsedLookBack {
  lookbackTimestampField: string;
  lookBackAmount: number;
  lookBackUnit: LookBackUnit;
  minutes: number;
  /** The stored query with the look-back clause removed (what the user wrote). */
  queryWithoutLookBack: string;
}

/**
 * Recover the look-back window from a stored query. Matches ONLY the clause
 * `addTimeFilterToQuery` writes, in the position it writes it (the whole first
 * pipe segment). Anything else — including hand-written time filters — is not
 * a look-back window and stays in the query. Returns `null` when absent.
 */
export function parseLookBackFromQuery(query: string): ParsedLookBack | null {
  if (!query) return null;
  const pipes = findPipeIndices(query);
  if (pipes.length === 0) return null;
  const start = pipes[0];
  const end = pipes.length > 1 ? pipes[1] : query.length;
  const m = query.slice(start, end).match(INJECTED_SEGMENT_RE);
  if (!m) return null;
  const lookBackAmount = Number(m[2]);
  if (!(lookBackAmount > 0)) return null;
  const lookbackTimestampField = m[1].startsWith('`') ? m[1].slice(1, -1) : m[1];
  const lookBackUnit = UNIT_BY_PPL[m[3].toUpperCase()];
  const queryWithoutLookBack =
    pipes.length > 1
      ? `${query.slice(0, start)}${query.slice(end)}`
      : query.slice(0, start).replace(/\s+$/, '');
  return {
    lookbackTimestampField,
    lookBackAmount,
    lookBackUnit,
    minutes: computeLookBackMinutes({ useLookBackWindow: true, lookBackAmount, lookBackUnit }),
    queryWithoutLookBack,
  };
}

const escapeRegExp = (s: string): string => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * True when the user's query already filters on `timestampField` in a `where`
 * clause (any operator, `BETWEEN`, absolute or relative times). Such a filter
 * and the look-back window both apply, so a row must satisfy both — worth
 * surfacing, e.g. an absolute past range means the rule can never fire.
 * Mentions inside string literals don't count.
 */
export function hasUserTimeFilter(query: string, timestampField: string): boolean {
  if (!query || !timestampField) return false;
  const pipes = findPipeIndices(query);
  const bounds = [-1, ...pipes, query.length];
  const field = escapeRegExp(timestampField);
  const ref = new RegExp(`(^|[^\\w@.\`])(${field}|\`${field}\`)(?![\\w@.])`);
  for (let i = 0; i < bounds.length - 1; i++) {
    const segment = query.slice(bounds[i] + 1, bounds[i + 1]).trim();
    if (!/^where\b/i.test(segment)) continue;
    const withoutStrings = segment.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, "''");
    if (ref.test(withoutStrings)) return true;
  }
  return false;
}

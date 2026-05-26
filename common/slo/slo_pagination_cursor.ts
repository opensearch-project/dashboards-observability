/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Opaque cursor for the SLO listing endpoint.
 *
 * Encodes the synthetic position over the underlying SO `find()` page+perPage
 * surface. The shape is base64url-encoded JSON; clients treat it as opaque
 * and round-trip it via the URL. Using base64url (not base64) keeps the
 * cursor URL-safe so it can ride a query string without further escaping.
 *
 * The `fh` (filter-hash) field detects mid-cursor filter drift: if a client
 * pages forward, then changes a filter, then sends the old cursor, the
 * server resets to page 1 instead of returning misleading rows from a
 * different filter context. Workspace state is intentionally NOT carried —
 * the saved-objects WorkspaceIdConsumerWrapper handles workspace scoping
 * on every request, so encoding workspace into the cursor would be both
 * redundant and brittle if the client switched workspaces mid-cursor.
 */

const CURSOR_VERSION = 1;

export interface PaginationCursorState {
  v: 1;
  /** 1-indexed page; matches what `SavedObjectsClientContract.find()` accepts. */
  p: number;
  /** Page size at the time of encoding. */
  ps: number;
  /** Sort field (passed through to find()). Empty string => default. */
  sf: string;
  /** Sort order. */
  so: 'asc' | 'desc';
  /** Filter-hash; empty when no filters set. */
  fh: string;
}

function toBase64Url(s: string): string {
  return Buffer.from(s, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(s: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  try {
    return Buffer.from(padded, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

export function encodeCursor(state: PaginationCursorState): string {
  return toBase64Url(JSON.stringify(state));
}

export function decodeCursor(input: string | undefined | null): PaginationCursorState | null {
  if (!input) return null;
  const json = fromBase64Url(input);
  if (json === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const c = parsed as Partial<PaginationCursorState>;
  if (c.v !== CURSOR_VERSION) return null;
  if (typeof c.p !== 'number' || c.p < 1 || !Number.isInteger(c.p)) return null;
  if (typeof c.ps !== 'number' || c.ps < 1 || !Number.isInteger(c.ps)) return null;
  if (typeof c.sf !== 'string') return null;
  if (c.so !== 'asc' && c.so !== 'desc') return null;
  if (typeof c.fh !== 'string') return null;
  return { v: 1, p: c.p, ps: c.ps, sf: c.sf, so: c.so, fh: c.fh };
}

/**
 * Stable hash over the keyword-filter inputs that affect pagination shape.
 * Order-insensitive within an array (sort before joining) so a UI that emits
 * ['a','b'] and one that emits ['b','a'] don't burn the cursor.
 *
 * Lightweight DJB2-style — collisions are tolerable: a hash collision just
 * means "looks like the same filter" and pagination continues, which is the
 * safe fallback (worst case the user sees one slightly stale page until they
 * page again). No security boundary lives on this value.
 */
export function hashFilters(parts: Record<string, unknown>): string {
  // Drop undefined and null values so that an explicit `b: undefined` and a
  // missing `b` hash to the same value. Empty arrays are likewise dropped —
  // the listing serializer omits empty filter arrays from the wire format,
  // so cursor stability requires they don't move the hash either.
  const keys = Object.keys(parts)
    .filter((k) => {
      const v = parts[k];
      if (v === undefined || v === null) return false;
      if (Array.isArray(v) && v.length === 0) return false;
      return true;
    })
    .sort();
  const canonical: Array<[string, unknown]> = keys.map((k) => {
    const v = parts[k];
    if (Array.isArray(v))
      return [
        k,
        [...v]
          .map((x) => String(x))
          .sort()
          .join(','),
      ];
    return [k, String(v)];
  });
  const s = canonical.map(([k, v]) => `${k}=${v}`).join('|');
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    // eslint-disable-next-line no-bitwise
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  // Encode as unsigned hex to keep the string short and sortable.
  // eslint-disable-next-line no-bitwise
  return (h >>> 0).toString(16);
}

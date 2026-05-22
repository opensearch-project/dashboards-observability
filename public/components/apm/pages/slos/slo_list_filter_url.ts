/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * URL ↔ SloListFilters serialization for the listing page. Kept in its own
 * module so the component tests can round-trip without importing React.
 *
 * Format: comma-joined arrays (`?state=breached,warning&tier=tier-1`). Comma
 * join matches what `SloApiClient.serializeFilters` sends to the server, so a
 * copy-pasted URL fragment lands on the wire in exactly the same shape it
 * came off in.
 */

import type {
  SloHealthState,
  SloListFilters,
  SuggestionKind,
} from '../../../../../common/slo/slo_types';

const SLI_BACKENDS = new Set(['prometheus', 'opensearch']);
const MODES = new Set(['active', 'shadow']);
const STATES = new Set<SloHealthState>([
  'breached',
  'warning',
  'ok',
  'no_data',
  'source_idle',
  'stale',
  'disabled',
  'rules_missing',
]);
const CANONICAL_KINDS = new Set<SuggestionKind>([
  'apm-availability',
  'apm-latency',
  'http-availability',
  'http-latency',
  'rpc-availability',
  'rpc-latency',
  'db-latency',
  'messaging-latency',
  'genai-availability',
]);

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Parse a hash-query string (the part after `?`) into SloListFilters. */
export function deserializeFiltersFromSearch(search: string): SloListFilters {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const out: SloListFilters = {};

  const datasourceId = parseList(params.get('datasourceId'));
  if (datasourceId.length) out.datasourceId = datasourceId;

  const state = parseList(params.get('state')).filter((s): s is SloHealthState =>
    STATES.has(s as SloHealthState)
  );
  if (state.length) out.state = state;

  const sliBackend = parseList(params.get('sliBackend')).filter((s) =>
    SLI_BACKENDS.has(s)
  ) as Array<'prometheus' | 'opensearch'>;
  if (sliBackend.length) out.sliBackend = sliBackend;

  const sliLeafType = parseList(params.get('sliLeafType'));
  if (sliLeafType.length) out.sliLeafType = sliLeafType;

  const service = parseList(params.get('service'));
  if (service.length) out.service = service;

  const team = parseList(params.get('team'));
  if (team.length) out.team = team;

  const tier = parseList(params.get('tier'));
  if (tier.length) out.tier = tier;

  const canonicalKind = parseList(params.get('canonicalKind')).filter((s): s is SuggestionKind =>
    CANONICAL_KINDS.has(s as SuggestionKind)
  );
  if (canonicalKind.length) out.canonicalKind = canonicalKind;

  const mode = parseList(params.get('mode')).filter((s) => MODES.has(s)) as Array<
    'active' | 'shadow'
  >;
  if (mode.length) out.mode = mode;

  const enabled = params.get('enabled');
  if (enabled === 'true') out.enabled = true;
  else if (enabled === 'false') out.enabled = false;

  const search_ = params.get('search');
  if (search_ && search_.length > 0) out.search = search_;

  const pageSizeRaw = params.get('pageSize');
  if (pageSizeRaw) {
    const n = parseInt(pageSizeRaw, 10);
    if (Number.isFinite(n) && n > 0) out.pageSize = n;
  }

  return out;
}

/**
 * Read the opaque cursor from a hash-query string. Cursors live alongside
 * filters but are not part of `SloListFilters` itself — the listing page
 * holds the cursor in component state and threads it to `SloApiClient.list`
 * separately so that page-state stays out of the filter object's identity.
 */
export function deserializeCursorFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const c = params.get('cursor');
  return c && c.length > 0 ? c : null;
}

/**
 * Serialize listing filters + cursor into a stable URL query string (no
 * leading ?). The cursor rides alongside filters so a copy-pasted URL
 * lands on the same page — but it's emitted last so the filter portion
 * round-trips identically with or without an active cursor.
 */
export function serializeFiltersToSearch(
  filters: SloListFilters,
  cursor: string | null = null
): string {
  const params = new URLSearchParams();
  if (filters.datasourceId?.length) params.set('datasourceId', filters.datasourceId.join(','));
  if (filters.state?.length) params.set('state', filters.state.join(','));
  if (filters.sliBackend?.length) params.set('sliBackend', filters.sliBackend.join(','));
  if (filters.sliLeafType?.length) params.set('sliLeafType', filters.sliLeafType.join(','));
  if (filters.service?.length) params.set('service', filters.service.join(','));
  if (filters.team?.length) params.set('team', filters.team.join(','));
  if (filters.tier?.length) params.set('tier', filters.tier.join(','));
  if (filters.canonicalKind?.length) {
    params.set('canonicalKind', filters.canonicalKind.join(','));
  }
  if (filters.mode?.length) params.set('mode', filters.mode.join(','));
  if (filters.enabled !== undefined) params.set('enabled', String(filters.enabled));
  if (filters.search && filters.search.trim().length > 0) params.set('search', filters.search);
  if (filters.pageSize !== undefined) params.set('pageSize', String(filters.pageSize));
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

/** True when two filter objects would produce identical serialized strings. */
export function filtersEqual(a: SloListFilters, b: SloListFilters): boolean {
  return serializeFiltersToSearch(a) === serializeFiltersToSearch(b);
}

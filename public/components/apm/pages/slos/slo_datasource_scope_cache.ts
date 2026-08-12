/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Per-tab memory (sessionStorage) of the SLO listing's datasource scope, keyed
 * by OSD workspace.
 *
 * On first landing in a workspace, the listing auto-selects the (up to 5)
 * datasources with the most SLOs. Thereafter this cache restores whatever the
 * user last had, for the remainder of the tab session.
 *
 * There are three meaningful runtime states, so the cache is a tri-state (plus
 * "absent"):
 *   - absent (`null`)          → nothing remembered yet → run the auto-select.
 *   - `{ kind: 'all' }`        → no datasource constraint → show every SLO.
 *   - `{ kind: 'scope', ids }` → scope to these datasources. An empty `ids`
 *                                means the user unchecked everything → show
 *                                nothing (an explicit empty scope, distinct
 *                                from `all`).
 *
 * sessionStorage (not localStorage) so the memory is scoped to the tab session,
 * matching the product decision that this is a per-visit convenience rather
 * than a durable preference.
 */

const KEY_PREFIX = 'slo:dsScope:';

export type DatasourceScope = { kind: 'all' } | { kind: 'scope'; ids: string[] };

/**
 * OSD workspace id parsed from the URL path (`/w/<id>/…`). Falls back to
 * `default` when workspaces are disabled or the path can't be read.
 */
export function currentWorkspaceId(): string {
  try {
    const match = /\/w\/([^/]+)\//.exec(window.location.pathname);
    return match?.[1] ?? 'default';
  } catch {
    return 'default';
  }
}

/** sessionStorage key for the current (or supplied) workspace's datasource scope. */
export function datasourceScopeCacheKey(workspaceId: string = currentWorkspaceId()): string {
  return `${KEY_PREFIX}${workspaceId}`;
}

/**
 * Read the remembered scope for this tab/workspace. Returns `null` when
 * nothing is stored (or storage is unavailable/corrupt), otherwise the
 * normalized {@link DatasourceScope}.
 */
export function readDatasourceScope(key: string): DatasourceScope | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.kind === 'all') return { kind: 'all' };
    if (parsed && parsed.kind === 'scope' && Array.isArray(parsed.ids)) {
      return {
        kind: 'scope',
        ids: parsed.ids.filter((v: unknown): v is string => typeof v === 'string'),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist the datasource scope for this tab/workspace. Silent no-op on failure. */
export function writeDatasourceScope(key: string, scope: DatasourceScope): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(scope));
  } catch {
    // sessionStorage unavailable (private mode / SSR / quota) — degrade silently.
  }
}

/**
 * Map the listing's `filters.datasourceId` (undefined = no constraint, array =
 * explicit scope) to the persisted scope shape.
 */
export function scopeFromFilter(datasourceId: string[] | undefined): DatasourceScope {
  return datasourceId === undefined ? { kind: 'all' } : { kind: 'scope', ids: datasourceId };
}

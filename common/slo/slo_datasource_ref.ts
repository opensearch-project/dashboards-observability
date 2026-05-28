/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared id-vs-name datasource resolution for SLO admin surfaces.
 *
 * Callers accept a datasource identifier in any of three equivalent forms:
 *   - the internal registry id (`ds-N`, stamped by `InMemoryDatasourceService`)
 *   - the SQL-plugin `connectionId` (captured as `directQueryName`)
 *   - the user-facing display `name`
 *
 * The registry already normalizes reads via `InMemoryDatasourceService.get`
 * (see `server/services/alerting/datasource_service.ts`), but callers sometimes
 * need the *normalized envelope* (both canonical id and the persisted-form
 * name) rather than the full Datasource record. The listing filter is the
 * primary consumer today; the resolver is injected (not registry-bound) so
 * this file can live in `common/` — importable from both common SLO code and
 * server routes without reaching across layers.
 */

import type { Datasource } from '../types/alerting';

/**
 * Resolver contract. Structural on purpose so both the server-side
 * `InMemoryDatasourceService.get` (returns `Datasource | null`) and the
 * per-request `SloStatusAggregationContext.resolveDatasource` (returns
 * `Datasource | undefined`) satisfy it without a wrapper.
 */
export type DatasourceResolver = (raw: string) => Promise<Datasource | null | undefined>;

/**
 * Normalized envelope. `forms` is the set of strings that any of this
 * datasource's three identifier flavors produce — used by callers that match
 * stored values (e.g. `spec.datasourceId`, `provenance.datasourceId`) against
 * caller-supplied input regardless of which form either side chose.
 *
 * `id` is always the internal `ds-N` id (the registry primary key). `name` is
 * the persisted form that `spec.datasourceId` carries. `connectionId` is
 * optional because user-managed datasources (created via the alerting POST
 * route, not discovered from the SQL plugin) don't have one.
 *
 * The full `Datasource` is passed through for callers that also need
 * `directQueryName` / `mdsId` / other fields.
 */
export interface DatasourceRef {
  id: string;
  name: string;
  connectionId?: string;
  forms: string[];
  datasource: Datasource;
}

/**
 * Resolve a raw identifier (id, connectionId, or name) to a normalized
 * envelope. Returns `null` when the resolver can't find a match or the
 * resolver rejects; callers decide whether that's a hard error or a
 * silent-drop. Resolver exceptions are re-thrown (not swallowed) so callers
 * can distinguish transport failures from "not registered".
 */
export async function resolveDatasourceRef(
  raw: string,
  resolver: DatasourceResolver
): Promise<DatasourceRef | null> {
  const ds = await resolver(raw);
  if (!ds) return null;
  return refFromDatasource(ds);
}

/**
 * Build a `DatasourceRef` envelope from an already-resolved `Datasource`.
 * Exposed for callers (like the SLO recover path) that hold the resolved
 * record in a deploy context and only need the envelope's `forms` surface
 * for equality checks against caller input / persisted provenance.
 */
export function refFromDatasource(ds: Datasource): DatasourceRef {
  const forms: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | undefined) => {
    if (!value) return;
    if (seen.has(value)) return;
    seen.add(value);
    forms.push(value);
  };
  push(ds.id);
  push(ds.name);
  push(ds.directQueryName);

  return {
    id: ds.id,
    name: ds.name,
    connectionId: ds.directQueryName,
    forms,
    datasource: ds,
  };
}

/**
 * Batch variant. Resolves each raw input; unresolved entries drop out of the
 * output list (and their raw values are reported via the `unresolved`
 * callback, when supplied) so callers can decide whether to treat them as
 * hard errors or silent drops.
 *
 * Preserves input order for matched entries — the reconciler relies on this
 * for deterministic error-entry ordering in its reconcile result.
 */
export async function resolveDatasourceRefs(
  raw: readonly string[],
  resolver: DatasourceResolver,
  onUnresolved?: (raw: string, error?: unknown) => void
): Promise<DatasourceRef[]> {
  const out: DatasourceRef[] = [];
  for (const entry of raw) {
    let ref: DatasourceRef | null;
    try {
      ref = await resolveDatasourceRef(entry, resolver);
    } catch (err) {
      if (onUnresolved) onUnresolved(entry, err);
      continue;
    }
    if (!ref) {
      if (onUnresolved) onUnresolved(entry);
      continue;
    }
    out.push(ref);
  }
  return out;
}

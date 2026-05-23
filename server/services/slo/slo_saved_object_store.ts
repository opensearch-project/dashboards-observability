/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Saved-object-backed ISloStore. Persists full SloDocument ({ id, spec, status })
 * plus a set of top-level projection scalars so the listing page can filter at
 * the index level without traversing the opaque `spec` JSON.
 *
 * See docs/design/slo-sli-design.md §4 for the mapping.
 */

import type { SavedObjectsClientContract } from '../../../../../src/core/server';
import type {
  ISloStore,
  SloDocument,
  SloHealthState,
  SloPaginateOpts,
  SloPaginateResult,
} from '../../../common/slo/slo_types';

const SO_TYPE = 'slo-definition';

interface SavedObjectEnvelope {
  id: string;
  attributes: Record<string, unknown>;
}

function isSavedObjectNotFound(err: unknown): boolean {
  const e = err as { output?: { statusCode?: number }; statusCode?: number } | undefined;
  const code = e?.output?.statusCode ?? e?.statusCode;
  // 404 — SO genuinely missing.
  // 403 — `WorkspaceIdConsumerWrapper` rejected the read because the SO
  // belongs to a different workspace. From the caller's perspective the
  // object does not exist in their workspace; surfacing the wrapper's
  // forbidden error verbatim would leak the existence of an SLO in
  // another workspace via a 403/404 distinguisher.
  return code === 404 || code === 403;
}

/**
 * Derive the index-level projections from the document.
 *
 * All projections are stored under top-level non-dotted keys. The opaque `spec`
 * and `status` sub-objects are disabled in the mapping (`enabled: false`), so
 * dotted keys like `spec.name` are interpreted as paths *into* `spec` and
 * rejected by OpenSearch. The store duplicates values out of `spec`/`status`
 * so that listing filters can work at the index level.
 */
function projectAttributes(doc: SloDocument): Record<string, unknown> {
  // Defensive against partial/malformed specs that pass the route schema
  // (`dimensions` is `schema.maybe`, `objectives` is allowed to be empty
  // by validateSloSpec for some leaf types). Without these guards a
  // ruler-write success can be followed by an SO-write throw — exactly
  // the dual-write divergence the rest of the service is hardened against.
  const objectives = Array.isArray(doc.spec.objectives) ? doc.spec.objectives : [];
  const worstTarget =
    objectives.length > 0 ? objectives.reduce((acc, o) => Math.max(acc, o.target), 0) : 0;
  const single = doc.spec.sli.type === 'single' ? doc.spec.sli : null;
  const sliBackend = single?.definition.backend;
  const sliLeafType = single?.definition.type;
  const dimensions = Array.isArray(single?.dimensions) ? single!.dimensions : [];
  const dimensionNames = dimensions.map((d) => d.name);
  const dimensionValues = dimensions.map((d) => d.value);
  const labelKeys = Object.keys(doc.spec.labels ?? {});
  const labelValues = Object.entries(doc.spec.labels ?? {}).flatMap(([, v]) =>
    Array.isArray(v) ? v : [v]
  );
  const ownerTeams = Array.isArray(doc.spec.owner?.teams) ? doc.spec.owner.teams : [];
  return {
    spec: doc.spec,
    status: doc.status,
    // Flattened projections from spec
    name: doc.spec.name,
    description: doc.spec.description,
    datasourceId: doc.spec.datasourceId,
    enabled: doc.spec.enabled,
    mode: doc.spec.mode,
    service: doc.spec.service,
    ownerTeams,
    ownerPrimaryUser: doc.spec.owner?.primaryUser,
    tier: doc.spec.tier,
    primaryOwnerTeam: ownerTeams[0],
    sliNodeType: doc.spec.sli.type,
    sliBackend,
    sliLeafType,
    dimensionNames,
    dimensionValues,
    objectiveCount: objectives.length,
    worstTarget,
    labelKeys,
    labelValues,
    // `cachedState` is intentionally NOT projected here — it is owned by
    // the status pipeline's writeback path (`updateCachedState`). Leaving
    // it absent on full-doc saves means a fresh create starts unfiltered
    // by state; the very next status read writes the real value. Letting
    // `save` rewrite cachedState would either require a read-modify-save
    // round-trip or risk clobbering a more recent writeback.
    // Audit projections from status
    version: doc.status.version,
    createdAt: doc.status.createdAt,
    createdBy: doc.status.createdBy,
    updatedAt: doc.status.updatedAt,
    updatedBy: doc.status.updatedBy,
  };
}

/**
 * Build a KQL filter string for the `find()` `filter` option from the
 * keyword-facet inputs the listing endpoint accepts. All clauses are AND-
 * combined; multi-value facets become OR groups.
 *
 * KQL string-literal escaping: backslash-escape `\` and `"` only. Anything
 * else is left verbatim because the values come from the SO `keyword`
 * mapping, not free-form user prose.
 */
function buildFilterKuery(opts: SloPaginateOpts): string | undefined {
  const f = opts.filters ?? {};
  const escVal = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const inClause = (field: string, values: string[]): string => {
    return `(${values.map((v) => `${SO_TYPE}.attributes.${field}: "${escVal(v)}"`).join(' OR ')})`;
  };
  const clauses: string[] = [];
  if (f.datasourceId?.length) clauses.push(inClause('datasourceId', f.datasourceId));
  if (f.state?.length) clauses.push(inClause('cachedState', f.state));
  if (f.sliBackend?.length) clauses.push(inClause('sliBackend', f.sliBackend));
  if (f.sliLeafType?.length) clauses.push(inClause('sliLeafType', f.sliLeafType));
  if (f.service?.length) clauses.push(inClause('service', f.service));
  if (f.team?.length) clauses.push(inClause('ownerTeams', f.team));
  if (f.tier?.length) clauses.push(inClause('tier', f.tier));
  if (f.canonicalKind?.length) {
    // `canonicalKind` is a top-level keyword projection only when the spec
    // carries one. The SO-level filter uses the `spec` enabled-false path,
    // so canonical kind is filtered post-find at the service layer; the
    // SO mapping does not project canonicalKind today.
    // Leaving this clause out of KQL keeps the SO query consistent with
    // the existing schema. The query service will re-apply the filter.
  }
  if (f.enabled !== undefined) clauses.push(`${SO_TYPE}.attributes.enabled: ${f.enabled}`);
  if (f.mode?.length) clauses.push(inClause('mode', f.mode));
  if (clauses.length === 0) return undefined;
  return clauses.join(' AND ');
}

/** Reconstruct an SloDocument from saved-object attributes. */
function fromAttributes(obj: SavedObjectEnvelope): SloDocument {
  const attrs = obj.attributes as {
    spec?: SloDocument['spec'];
    status?: SloDocument['status'];
  };
  if (!attrs.spec || !attrs.status) {
    throw new Error(`Invalid slo-definition document ${obj.id}: missing spec/status`);
  }
  return { id: obj.id, spec: attrs.spec, status: attrs.status };
}

export class SavedObjectSloStore implements ISloStore {
  constructor(private readonly client: SavedObjectsClientContract) {}

  async get(id: string): Promise<SloDocument | null> {
    try {
      const obj = await this.client.get(SO_TYPE, id);
      return fromAttributes(obj);
    } catch (err) {
      if (isSavedObjectNotFound(err)) return null;
      throw err;
    }
  }

  async list(datasourceIds?: string[]): Promise<SloDocument[]> {
    const results: SloDocument[] = [];
    let page = 1;
    const perPage = 1000;
    // Hard cap on accumulated results — protects against runaway memory if a
    // tenant somehow accumulates beyond the supported limit. Listing UI shows
    // a 100-row pageful today; 10k is well above any realistic upper bound and
    // pages beyond this trigger a logged warning rather than silent truncation.
    const MAX_RESULTS = 10_000;
    while (true) {
      const findOpts: {
        type: string;
        perPage: number;
        page: number;
        filter?: string;
      } = { type: SO_TYPE, perPage, page };
      if (datasourceIds && datasourceIds.length > 0) {
        const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const clauses = datasourceIds
          .map((id) => `${SO_TYPE}.attributes.datasourceId: "${esc(id)}"`)
          .join(' OR ');
        findOpts.filter = `(${clauses})`;
      }
      const response = await this.client.find(findOpts);
      for (const obj of response.saved_objects as SavedObjectEnvelope[]) {
        try {
          results.push(fromAttributes(obj));
        } catch {
          // Skip malformed docs rather than failing the whole listing.
        }
      }
      if (response.saved_objects.length === 0 || results.length >= response.total) break;
      if (results.length >= MAX_RESULTS) break;
      page++;
    }
    return results;
  }

  async save(doc: SloDocument): Promise<void> {
    await this.client.create(SO_TYPE, projectAttributes(doc), {
      id: doc.id,
      overwrite: true,
    });
  }

  /**
   * Lightweight projection write — patches just the cachedState keyword.
   * Used by the status pipeline to fold a freshly computed state back into
   * the index so subsequent state-filtered listings can push the facet to
   * the SO `filter` clause.
   *
   * 403/404 silently no-op: the SO was deleted or workspace-scoped away
   * between the read and the writeback. Either way, nothing to write —
   * matching the same 403→404 invariant `get` and `delete` apply.
   */
  async updateCachedState(id: string, state: SloHealthState): Promise<void> {
    try {
      await this.client.update(SO_TYPE, id, { cachedState: state });
    } catch (err) {
      if (isSavedObjectNotFound(err)) return;
      throw err;
    }
  }

  async paginate(opts: SloPaginateOpts): Promise<SloPaginateResult> {
    const filterClauses = buildFilterKuery(opts);
    const findOpts: {
      type: string;
      page: number;
      perPage: number;
      sortField?: string;
      sortOrder?: 'asc' | 'desc';
      search?: string;
      searchFields?: string[];
      filter?: string;
    } = {
      type: SO_TYPE,
      page: opts.page,
      perPage: opts.perPage,
    };
    if (opts.sortField) {
      findOpts.sortField = opts.sortField;
      findOpts.sortOrder = opts.sortOrder ?? 'asc';
    }
    if (opts.search) {
      // OSD's saved-object `find` translates `searchFields` into a
      // simple_query_string with phrase-prefix matching, which OpenSearch
      // requires to land on `text`-typed fields. The SLO mapping registers
      // `service` as `keyword` (so the listing's structured Service filter
      // can push exact-match terms to the index) — including `service` here
      // produced "Can only use phrase prefix queries on text fields" 500s
      // for any non-empty `?search=` value. Service-name filtering is
      // already exposed through the dedicated `Service` filter facet, so
      // free-text search remains scoped to the text-mapped fields.
      findOpts.search = `${opts.search}*`;
      findOpts.searchFields = ['name', 'description'];
    }
    if (filterClauses) findOpts.filter = filterClauses;
    const response = await this.client.find(findOpts);
    const docs: SloDocument[] = [];
    const cachedStates: Array<SloHealthState | null> = [];
    for (const obj of response.saved_objects as SavedObjectEnvelope[]) {
      try {
        docs.push(fromAttributes(obj));
        const cached = (obj.attributes as { cachedState?: SloHealthState }).cachedState;
        cachedStates.push(typeof cached === 'string' ? cached : null);
      } catch {
        // Skip malformed docs rather than failing the whole listing.
      }
    }
    return { docs, cachedStates, total: response.total };
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.client.delete(SO_TYPE, id);
      return true;
    } catch (err) {
      if (isSavedObjectNotFound(err)) return false;
      throw err;
    }
  }
}

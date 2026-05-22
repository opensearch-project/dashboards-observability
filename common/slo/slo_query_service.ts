/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLO read-side: filtered listing, pagination, and the per-row summary
 * projection the listing page renders. Status lookup is delegated to
 * `SloStatusService` so this service stays purely concerned with filter
 * normalization and field projection.
 *
 * Split out of the original `slo_service.ts` during the H5 decomposition.
 */

import type { PaginatedResponse } from '../types/alerting';
import type {
  Dimension,
  SloDocument,
  SloHealthState,
  SloListFilters,
  SloLiveStatus,
  SloSummary,
} from './slo_types';
import { resolveDatasourceRefs } from './slo_datasource_ref';
import type { SloStatusAggregationContext } from './slo_service_types';
import type { SloServiceCore } from './slo_service_core';
import type { SloStatusService } from './slo_status_service';
import { decodeCursor, encodeCursor, hashFilters } from './slo_pagination_cursor';
import type { PaginationCursorState } from './slo_pagination_cursor';
import { writeBackChangedStates } from './slo_status_cached_writeback';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
/**
 * Hard ceiling for synthetic cursor pagination. The OSD saved-objects layer
 * sits on top of the standard OpenSearch `from + size` window
 * (`index.max_result_window`, default 10K). Past the ceiling, deep
 * pagination starts to fail with a search-context error rather than degrade
 * gracefully. A workspace tenant fleet of 5K SLOs is well above any
 * realistic upper bound; once we approach it the right answer is to either
 * narrow filters or invest in true searchAfter (requires an OSD core
 * change). Stop early with a clear message rather than passing the
 * underlying error through.
 */
const MAX_CURSOR_PAGE = 500;

export interface PaginatedListResult {
  results: SloSummary[];
  total: number;
  pageSize: number;
  hasMore: boolean;
  /** Opaque cursor for the next page; null on the final page. */
  nextCursor: string | null;
  /** Opaque cursor for the previous page; null on page 1. */
  prevCursor: string | null;
}

export class SloQueryService {
  constructor(
    private readonly core: SloServiceCore,
    private readonly statusService: SloStatusService
  ) {}

  async list(
    filters?: SloListFilters,
    ctx?: SloStatusAggregationContext,
    request?: unknown
  ): Promise<SloSummary[]> {
    const { sloStore } = this.core.resolveStores(request);
    // Filter input arrives as either the internal ds-N id (from URL params)
    // or the user-facing datasource name (from some legacy chip-paste paths).
    // `spec.datasourceId` is persisted as the name, so resolve ids → names
    // through `ctx.resolveDatasource` before hitting the store. See
    // `common/slo/slo_datasource_ref.ts` for the shared resolution contract.
    const normalizedDsIds = await this.normalizeDatasourceFilter(filters?.datasourceId, ctx);
    // If the caller asked for specific datasources but none resolved, short-
    // circuit — an empty array at the store layer is read as "no filter".
    if (filters?.datasourceId && filters.datasourceId.length > 0 && normalizedDsIds?.length === 0) {
      return [];
    }
    const all = await sloStore.list(normalizedDsIds);
    // `store.list` already OR-filtered by normalizedDsIds — if for any reason
    // the store ignored it (test doubles, future backends), belt-and-braces
    // filter again in memory so the contract stays consistent.
    const dsFiltered =
      normalizedDsIds && normalizedDsIds.length > 0
        ? all.filter((d) => normalizedDsIds.includes(d.spec.datasourceId))
        : all;

    let filtered = dsFiltered;

    if (filters?.enabled !== undefined) {
      filtered = filtered.filter((d) => d.spec.enabled === filters.enabled);
    }
    if (filters?.mode && filters.mode.length > 0) {
      filtered = filtered.filter((d) => filters.mode!.includes(d.spec.mode));
    }
    if (filters?.service && filters.service.length > 0) {
      filtered = filtered.filter((d) => filters.service!.includes(d.spec.service));
    }
    if (filters?.team && filters.team.length > 0) {
      filtered = filtered.filter((d) => d.spec.owner.teams.some((t) => filters.team!.includes(t)));
    }
    if (filters?.tier && filters.tier.length > 0) {
      filtered = filtered.filter((d) => d.spec.tier && filters.tier!.includes(d.spec.tier));
    }
    // Match on the stored `canonicalKind` tag only — no heuristic inference
    // at the filter layer, so untagged legacy SLOs simply fall outside the
    // filter. Users explicitly asking "show me APM-availability SLOs" don't
    // want prometheus/availability-leaf SLOs they never labelled with an
    // APM intent swept in by accident.
    if (filters?.canonicalKind && filters.canonicalKind.length > 0) {
      filtered = filtered.filter(
        (d) => d.spec.canonicalKind && filters.canonicalKind!.includes(d.spec.canonicalKind)
      );
    }
    if (filters?.sliBackend && filters.sliBackend.length > 0) {
      filtered = filtered.filter(
        (d) =>
          d.spec.sli.type === 'single' &&
          filters.sliBackend!.includes(d.spec.sli.definition.backend)
      );
    }
    if (filters?.sliLeafType && filters.sliLeafType.length > 0) {
      filtered = filtered.filter(
        (d) =>
          d.spec.sli.type === 'single' && filters.sliLeafType!.includes(d.spec.sli.definition.type)
      );
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.spec.name.toLowerCase().includes(q) ||
          d.spec.service.toLowerCase().includes(q) ||
          (d.spec.description?.toLowerCase().includes(q) ?? false)
      );
    }

    // Get statuses for all filtered SLOs
    const ids = filtered.map((d) => d.id);
    const statuses = await this.statusService.getStatuses(ids, ctx, request);
    const statusMap = new Map(statuses.map((s) => [s.sloId, s]));

    // State filter applied last so we don't pay for status computation on filtered-out rows.
    if (filters?.state && filters.state.length > 0) {
      filtered = filtered.filter((d) => {
        const s = statusMap.get(d.id);
        return s && filters.state!.includes(s.state);
      });
    }

    return filtered.map((d) =>
      this.toSummary(d, statusMap.get(d.id) ?? this.statusService.noDataStatus(d))
    );
  }

  /**
   * Legacy offset-based pagination. Materializes every matching SLO before
   * slicing, so it pays the variable-cardinality cost on state-filtered
   * listings. Kept as a thin compatibility wrapper for clients that still
   * send `page=N` instead of an opaque cursor; routes prefer `paginate`.
   *
   * @deprecated Prefer `paginate` for new callers.
   */
  async getPaginated(
    filters?: SloListFilters,
    ctx?: SloStatusAggregationContext,
    request?: unknown
  ): Promise<PaginatedResponse<SloSummary>> {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const all = await this.list(filters, ctx, request);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return {
      results: all.slice(start, end),
      total: all.length,
      page,
      pageSize,
      hasMore: end < all.length,
    };
  }

  /**
   * Cursor-based pagination. Pushes facet filters (including `state`, via
   * the persisted `cachedState` projection) into the SO `filter` clause so
   * a state-filtered listing doesn't need to materialize every matching
   * SLO before slicing. Status fold-in then runs only over the visible
   * page. Diffs in computed-vs-cached state trigger a best-effort
   * writeback so the next request's filter pushdown stays honest.
   *
   * Falls back to the legacy `list()` path when the underlying store does
   * not implement `paginate` (in-memory bootstrap stores in tests can opt
   * out by leaving the method undefined; the bundled `InMemorySloStore`
   * implements it).
   */
  async paginate(
    filters: SloListFilters | undefined,
    cursor: string | null,
    ctx?: SloStatusAggregationContext,
    request?: unknown
  ): Promise<PaginatedListResult> {
    const { sloStore } = this.core.resolveStores(request);

    // Build the filter signature once. Used both for the cursor's drift
    // detection and the SO-layer filter clause.
    const normalizedDsIds = await this.normalizeDatasourceFilter(filters?.datasourceId, ctx);
    if (filters?.datasourceId && filters.datasourceId.length > 0 && normalizedDsIds?.length === 0) {
      return this.emptyResult(filters?.pageSize);
    }
    const filterFingerprint = hashFilters({
      datasourceId: normalizedDsIds,
      state: filters?.state,
      sliBackend: filters?.sliBackend,
      sliLeafType: filters?.sliLeafType,
      service: filters?.service,
      team: filters?.team,
      tier: filters?.tier,
      canonicalKind: filters?.canonicalKind,
      enabled: filters?.enabled,
      mode: filters?.mode,
      search: filters?.search,
    });

    const requestedSize = filters?.pageSize ?? DEFAULT_PAGE_SIZE;
    const pageSize = Math.max(1, Math.min(requestedSize, MAX_PAGE_SIZE));
    const decoded = decodeCursor(cursor);
    // Reset to page 1 when the cursor was malformed, missing, or its
    // filter-fingerprint disagrees with the current request. Treating
    // a stale cursor as an explicit reset is safer than silently
    // returning rows that don't match the active filters.
    const effectivePage =
      decoded && decoded.fh === filterFingerprint ? Math.min(decoded.p, MAX_CURSOR_PAGE) : 1;
    // Default to `_id` for stable cursor pagination. The visible row order is
    // re-derived client-side over the page slice (worst-budget first); the
    // server-side order only needs to be stable across cursor steps. Sorting
    // by `name` directly fails on the existing text-typed mapping, and adding
    // a keyword subfield would require a mapping migration the listing
    // change shouldn't be coupled to. `_id` is a top-level keyword the OSD
    // saved-objects layer always allows for sort.
    const sortField = decoded?.sf || '_id';
    const sortOrder = decoded?.so ?? 'asc';

    if (!sloStore.paginate) {
      // Bootstrap / test path: fall back to the materialize-and-slice
      // approach. Cursor still drives the page index; filter pushdown
      // is unavailable in this branch.
      return this.legacyPaginate({
        page: effectivePage,
        pageSize,
        sortField,
        sortOrder,
        filterFingerprint,
        filters,
        ctx,
        request,
      });
    }

    const paginated = await sloStore.paginate({
      page: effectivePage,
      perPage: pageSize,
      sortField,
      sortOrder,
      search: filters?.search,
      filters: {
        datasourceId: normalizedDsIds,
        state: filters?.state,
        sliBackend: filters?.sliBackend,
        sliLeafType: filters?.sliLeafType,
        service: filters?.service,
        team: filters?.team,
        tier: filters?.tier,
        canonicalKind: filters?.canonicalKind,
        enabled: filters?.enabled,
        mode: filters?.mode,
      },
    });

    // canonicalKind is not projected on the SO yet (see slo_saved_object_store.buildFilterKuery)
    // — re-apply post-fetch so the contract remains complete.
    let docs = paginated.docs;
    let cachedStates = paginated.cachedStates;
    if (filters?.canonicalKind && filters.canonicalKind.length > 0) {
      const kept: SloDocument[] = [];
      const keptStates: Array<SloHealthState | null> = [];
      for (let i = 0; i < docs.length; i++) {
        const d = docs[i];
        if (d.spec.canonicalKind && filters.canonicalKind.includes(d.spec.canonicalKind)) {
          kept.push(d);
          keptStates.push(cachedStates[i]);
        }
      }
      docs = kept;
      cachedStates = keptStates;
    }

    // Fold in live status only over the page slice.
    const ids = docs.map((d) => d.id);
    const statuses = ids.length ? await this.statusService.getStatuses(ids, ctx, request) : [];
    const statusMap = new Map(statuses.map((s) => [s.sloId, s]));

    // Best-effort writeback. Don't await — the writeback is idempotent and
    // can land any time before the next read; we'd rather return the page
    // sooner. Caught and logged inside the helper.
    const writebackInputs = docs.map((d, i) => ({
      sloId: d.id,
      newState: (statusMap.get(d.id) ?? this.statusService.noDataStatus(d)).state,
      oldState: cachedStates[i],
    }));
    void writeBackChangedStates(sloStore, writebackInputs, this.core.logger);

    const results = docs.map((d) =>
      this.toSummary(d, statusMap.get(d.id) ?? this.statusService.noDataStatus(d))
    );

    const total = paginated.total;
    const hasMore = effectivePage * pageSize < total;
    return {
      results,
      total,
      pageSize,
      hasMore,
      nextCursor: hasMore
        ? this.encodeCursorForPage({
            page: effectivePage + 1,
            pageSize,
            sortField,
            sortOrder,
            filterFingerprint,
          })
        : null,
      prevCursor:
        effectivePage > 1
          ? this.encodeCursorForPage({
              page: effectivePage - 1,
              pageSize,
              sortField,
              sortOrder,
              filterFingerprint,
            })
          : null,
    };
  }

  private encodeCursorForPage(args: {
    page: number;
    pageSize: number;
    sortField: string;
    sortOrder: 'asc' | 'desc';
    filterFingerprint: string;
  }): string {
    const cursor: PaginationCursorState = {
      v: 1,
      p: args.page,
      ps: args.pageSize,
      sf: args.sortField,
      so: args.sortOrder,
      fh: args.filterFingerprint,
    };
    return encodeCursor(cursor);
  }

  private emptyResult(pageSize?: number): PaginatedListResult {
    return {
      results: [],
      total: 0,
      pageSize: Math.max(1, Math.min(pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)),
      hasMore: false,
      nextCursor: null,
      prevCursor: null,
    };
  }

  private async legacyPaginate(args: {
    page: number;
    pageSize: number;
    sortField: string;
    sortOrder: 'asc' | 'desc';
    filterFingerprint: string;
    filters?: SloListFilters;
    ctx?: SloStatusAggregationContext;
    request?: unknown;
  }): Promise<PaginatedListResult> {
    const all = await this.list(args.filters, args.ctx, args.request);
    const total = all.length;
    const start = (args.page - 1) * args.pageSize;
    const end = start + args.pageSize;
    const results = all.slice(start, end);
    const hasMore = end < total;
    return {
      results,
      total,
      pageSize: args.pageSize,
      hasMore,
      nextCursor: hasMore
        ? this.encodeCursorForPage({
            page: args.page + 1,
            pageSize: args.pageSize,
            sortField: args.sortField,
            sortOrder: args.sortOrder,
            filterFingerprint: args.filterFingerprint,
          })
        : null,
      prevCursor:
        args.page > 1
          ? this.encodeCursorForPage({
              page: args.page - 1,
              pageSize: args.pageSize,
              sortField: args.sortField,
              sortOrder: args.sortOrder,
              filterFingerprint: args.filterFingerprint,
            })
          : null,
    };
  }

  /**
   * Resolve the caller's datasource filter list (mixed ds-N ids and names) to
   * the canonical `name` form that `spec.datasourceId` is persisted as.
   *
   * Missing resolver (offline dev, tests without a ctx) — pass the input
   * through; store-level filtering may still match if the caller already gave
   * names. Missing datasource — drop that entry; the fallback alternative
   * would silently broaden the filter to all datasources.
   */
  private async normalizeDatasourceFilter(
    datasourceIds: string[] | undefined,
    ctx?: SloStatusAggregationContext
  ): Promise<string[] | undefined> {
    if (!datasourceIds || datasourceIds.length === 0) return datasourceIds;
    if (!ctx?.resolveDatasource) return datasourceIds;
    const refs = await resolveDatasourceRefs(datasourceIds, ctx.resolveDatasource);
    return refs.map((ref) => ref.name);
  }

  private toSummary(doc: SloDocument, status: SloLiveStatus): SloSummary {
    const single = doc.spec.sli.type === 'single' ? doc.spec.sli : null;
    const worstTarget =
      doc.spec.objectives.length > 0
        ? doc.spec.objectives.reduce((acc, o) => Math.max(acc, o.target), 0)
        : 0;
    const dims: Dimension[] | undefined = single?.dimensions;
    return {
      id: doc.id,
      datasourceId: doc.spec.datasourceId,
      // datasourceType is a registry lookup; default to prometheus in P0.
      datasourceType: 'prometheus',
      name: doc.spec.name,
      description: doc.spec.description,
      enabled: doc.spec.enabled,
      mode: doc.spec.mode,
      service: doc.spec.service,
      owner: doc.spec.owner,
      tier: doc.spec.tier,
      canonicalKind: doc.spec.canonicalKind,
      sliNodeType: doc.spec.sli.type,
      sliBackend: single?.definition.backend,
      sliLeafType:
        single?.definition.backend === 'prometheus'
          ? single.definition.type
          : single?.definition.type,
      dimensions: dims,
      objectiveCount: doc.spec.objectives.length,
      worstTarget,
      window: doc.spec.window,
      labels: doc.spec.labels,
      status,
    };
  }
}

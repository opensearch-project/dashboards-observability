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
  SloListFilters,
  SloLiveStatus,
  SloSummary,
} from './slo_types';
import { resolveDatasourceRefs } from './slo_datasource_ref';
import type { SloStatusAggregationContext } from './slo_service_types';
import type { SloServiceCore } from './slo_service_core';
import type { SloStatusService } from './slo_status_service';

export class SloQueryService {
  constructor(
    private readonly core: SloServiceCore,
    private readonly statusService: SloStatusService
  ) {}

  async list(filters?: SloListFilters, ctx?: SloStatusAggregationContext): Promise<SloSummary[]> {
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
    const all = await this.core.store.list(normalizedDsIds);
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
    const statuses = await this.statusService.getStatuses(ids, ctx);
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

  async getPaginated(
    filters?: SloListFilters,
    ctx?: SloStatusAggregationContext
  ): Promise<PaginatedResponse<SloSummary>> {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 20, 100);
    const all = await this.list(filters, ctx);
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

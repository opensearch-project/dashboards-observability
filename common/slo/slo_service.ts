/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLO service facade. Composes three single-purpose sub-services over a
 * shared mutable core:
 *
 *   - `SloLifecycleService` — create / update / delete / repair / preview /
 *     enable-disable, plus the dedup refcount lookup the detail page
 *     consumes.
 *   - `SloStatusService` — live status (cache + aggregator orchestration +
 *     stub fallback).
 *   - `SloQueryService`  — list / paginate / filter / project to summary.
 *
 * The facade exists so the route adapters, plugin wiring, and ~9 cross-tree
 * test files that import `SloService` continue to compile unchanged. Method
 * bodies forward 1:1 to the sub-service that owns the logic; the facade
 * holds no behavior of its own.
 *
 * Decomposition motivation (PR #2689 H5): the original 1,965-line
 * `slo_service.ts` mixed 8 responsibilities (CRUD, dedup bookkeeping,
 * repair, preview, status cache, status aggregator orchestration,
 * listing/filtering, summary projection) into one class. Splitting them
 * lets each module describe a single concern. See PR description for the
 * cut-line rationale.
 *
 * Public surface (re-exported from this module): unchanged. Types and
 * helpers that used to live here as inline `export`s now live in dedicated
 * `slo_service_types.ts` / `slo_service_internals.ts` modules; the
 * re-exports below preserve every name existing callers consume.
 */

import type { Logger, PaginatedResponse } from '../types/alerting';
import type {
  SloCreateInput,
  SloDocument,
  SloLiveStatus,
  SloListFilters,
  SloSummary,
  SloUpdateInput,
  ISloStore,
  GeneratedRuleGroup,
} from './slo_types';
import type { Datasource } from '../types/alerting';
import {
  SloDeployContext,
  SloRepairContext,
  SloRepairResult,
  SloRuleRefStoreLite,
  SloStatusAggregationContext,
  SloStatusAggregator,
  SloStoreFactoryLite,
} from './slo_service_types';
import { SloServiceCore } from './slo_service_core';
import { SloLifecycleService } from './slo_lifecycle_service';
import { SloStatusService } from './slo_status_service';
import { SloQueryService } from './slo_query_service';

// ---------- Re-exports: errors ----------

export {
  SloNotFoundError,
  SloRulerError,
  SloRulerTeardownRequiredError,
  SloValidationError,
  SloVersionConflictError,
} from './slo_errors';

// ---------- Re-exports: types + namespace helper ----------

export { WORKSPACE_ID_RE, sloRulerNamespaceFor } from './slo_service_types';

export type {
  RuleHealthCheckInputLite,
  RuleHealthReportLite,
  SloDeployContext,
  SloRepairContext,
  SloRepairResult,
  SloRuleHealthProbe,
  SloRuleHealthState,
  SloRuleHealthStateLite,
  SloRuleRefStoreLite,
  SloRulerClient,
  SloStatusAggregationContext,
  SloStatusAggregator,
} from './slo_service_types';

// ---------- Re-exports: pure helpers ----------

export { deriveExpectedGroups, deriveRuleCount, normalizeSloSpec } from './slo_service_internals';

// ============================================================================
// Service facade
// ============================================================================

export class SloService {
  private readonly core: SloServiceCore;
  private readonly lifecycle: SloLifecycleService;
  private readonly statusService: SloStatusService;
  private readonly queryService: SloQueryService;

  constructor(logger: Logger, store?: ISloStore) {
    this.core = new SloServiceCore(logger, store);
    this.statusService = new SloStatusService(this.core);
    this.lifecycle = new SloLifecycleService(this.core, this.statusService);
    this.queryService = new SloQueryService(this.core, this.statusService);
  }

  // ---------- configuration / wiring ----------

  /** Update the dedup flag at runtime. See `plugin.ts`. */
  setDedupEnabled(enabled: boolean): void {
    this.core.dedupEnabled = enabled;
    this.core.logger.info(`SloService: ruleDedup ${enabled ? 'enabled' : 'disabled'}`);
  }

  isDedupEnabled(): boolean {
    return this.core.dedupEnabled;
  }

  /** Wire the refcount registry. */
  setRuleRefStore(refStore: SloRuleRefStoreLite | undefined): void {
    this.core.refStore = refStore;
    this.core.logger.info(
      refStore ? 'SloService: rule-ref store configured' : 'SloService: rule-ref store cleared'
    );
  }

  /** Set plugin version stamped on provenance annotations. */
  setPluginVersion(version: string): void {
    this.core.pluginVersion = version;
  }

  setStore(store: ISloStore): void {
    this.core.store = store;
    this.core.statusCache.clear();
    this.core.loggedAggregatorFailures.clear();
    this.core.logger.info('SloService: storage backend replaced');
  }

  /**
   * Wire a per-request store factory. When set, lifecycle / query / status
   * methods that receive a `request` route SO operations through the
   * factory's `forRequest(request)` so the saved-objects workspace wrapper
   * engages. When unset, all methods use the singleton `store` /
   * `refStore` configured via `setStore` / `setRuleRefStore` (test path).
   */
  setStoreFactory(factory: SloStoreFactoryLite | undefined): void {
    this.core.storeFactory = factory;
    this.core.logger.info(
      factory
        ? 'SloService: per-request store factory configured'
        : 'SloService: per-request store factory cleared'
    );
  }

  setStatusAggregator(aggregator: SloStatusAggregator | undefined): void {
    this.core.aggregator = aggregator;
    this.core.statusCache.clear();
    this.core.loggedAggregatorFailures.clear();
    this.core.logger.info(
      aggregator
        ? 'SloService: live status aggregator configured'
        : 'SloService: live status aggregator cleared — falling back to stub'
    );
  }

  // ---------- lifecycle ----------

  create(
    input: SloCreateInput,
    createdBy: string = 'system',
    deploy?: SloDeployContext,
    request?: unknown
  ): Promise<SloDocument> {
    return this.lifecycle.create(input, createdBy, deploy, request);
  }

  get(id: string, request?: unknown): Promise<SloDocument | null> {
    return this.lifecycle.get(id, request);
  }

  update(
    id: string,
    input: SloUpdateInput,
    updatedBy: string = 'system',
    deploy?: SloDeployContext,
    request?: unknown
  ): Promise<SloDocument> {
    return this.lifecycle.update(id, input, updatedBy, deploy, request);
  }

  delete(id: string, deploy?: SloDeployContext, request?: unknown): Promise<{ deleted: boolean }> {
    return this.lifecycle.delete(id, deploy, request);
  }

  repair(id: string, ctx: SloRepairContext, request?: unknown): Promise<SloRepairResult> {
    return this.lifecycle.repair(id, ctx, request);
  }

  setEnabled(
    id: string,
    enabled: boolean,
    updatedBy: string = 'system',
    deploy?: SloDeployContext,
    request?: unknown
  ): Promise<SloDocument> {
    return this.lifecycle.setEnabled(id, enabled, updatedBy, deploy, request);
  }

  previewRules(input: SloCreateInput): GeneratedRuleGroup {
    return this.lifecycle.previewRules(input);
  }

  getFingerprintRefcounts(
    doc: SloDocument,
    workspaceId: string,
    resolveDatasource?: (datasourceId: string) => Promise<Datasource | undefined>,
    request?: unknown
  ): Promise<Record<string, number>> {
    return this.lifecycle.getFingerprintRefcounts(doc, workspaceId, resolveDatasource, request);
  }

  // ---------- status ----------

  getStatus(
    id: string,
    ctx?: SloStatusAggregationContext,
    request?: unknown
  ): Promise<SloLiveStatus> {
    return this.statusService.getStatus(id, ctx, request);
  }

  getStatuses(
    ids: string[],
    ctx?: SloStatusAggregationContext,
    request?: unknown
  ): Promise<SloLiveStatus[]> {
    return this.statusService.getStatuses(ids, ctx, request);
  }

  // ---------- listing ----------

  list(
    filters?: SloListFilters,
    ctx?: SloStatusAggregationContext,
    request?: unknown
  ): Promise<SloSummary[]> {
    return this.queryService.list(filters, ctx, request);
  }

  getPaginated(
    filters?: SloListFilters,
    ctx?: SloStatusAggregationContext,
    request?: unknown
  ): Promise<PaginatedResponse<SloSummary>> {
    return this.queryService.getPaginated(filters, ctx, request);
  }

  paginate(
    filters: SloListFilters | undefined,
    cursor: string | null,
    ctx?: SloStatusAggregationContext,
    request?: unknown
  ) {
    return this.queryService.paginate(filters, cursor, ctx, request);
  }
}

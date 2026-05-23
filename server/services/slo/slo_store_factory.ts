/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Factory for per-request SLO store handles.
 *
 * Two paths:
 *   - `forRequest(request)` returns stores backed by the request-scoped
 *     `SavedObjectsClient`, which routes through every saved-objects
 *     wrapper — including `WorkspaceIdConsumerWrapper`. Reads auto-filter
 *     to the request's workspace; writes auto-tag with it. This is the
 *     CRUD path on workspace-enabled clusters.
 *   - `forReconciler()` returns stores backed by an internal repository,
 *     which intentionally bypasses the wrapper. Used by the grace-GC
 *     pass: the eligibility decision needs the cross-workspace aggregate
 *     refcount for a (datasourceId, fingerprint) tuple, which a
 *     workspace-scoped client cannot compute by definition.
 *
 * Test wiring continues to set the singleton `core.store` / `core.refStore`
 * directly via `SloService.setStore` / `setRuleRefStore`. The factory is
 * additive: when configured, the lifecycle/query/status services use it
 * for any call that carries a `request`; without a request (or without
 * the factory), they fall back to the singleton stores.
 */

import type {
  SavedObjectsClientContract,
  SavedObjectsServiceStart,
  OpenSearchDashboardsRequest,
} from '../../../../../src/core/server';
import type { ISloStore } from '../../../common/slo/slo_types';
import { SLO_RULE_REF_SO_TYPE } from '../../saved_objects/slo_rule_ref';
import { SavedObjectSloStore } from './slo_saved_object_store';
import { SloRuleRefStore } from './slo_rule_ref_store';

const SLO_DEFINITION_SO_TYPE = 'slo-definition';

/**
 * SO type list the internal repository must include. Keeping it in one
 * place so `forReconciler` and the existing `start()` wiring (which still
 * builds an internal repository for the in-memory bootstrap-to-SO upgrade)
 * stay in sync.
 */
export const SLO_INTERNAL_REPO_TYPES: string[] = [SLO_DEFINITION_SO_TYPE, SLO_RULE_REF_SO_TYPE];

export interface SloStores {
  sloStore: ISloStore;
  ruleRefStore: SloRuleRefStore;
}

export class SloStoreFactory {
  constructor(private readonly savedObjects: SavedObjectsServiceStart) {}

  /**
   * Per-request store pair scoped to the caller. Reads/writes route
   * through `WorkspaceIdConsumerWrapper` so a workspace can never see
   * another workspace's slo-rule-ref or slo-definition SOs.
   *
   * `slo-rule-ref` is a hidden SO type — by default scoped clients filter
   * hidden types out, which causes writes to fail with "Unsupported saved
   * object type: 'slo-rule-ref'". Opt the scoped client into seeing it.
   */
  forRequest(request: OpenSearchDashboardsRequest): SloStores {
    const client = this.savedObjects.getScopedClient(request, {
      includedHiddenTypes: [SLO_RULE_REF_SO_TYPE],
    });
    return this.fromClient(client);
  }

  /**
   * Internal-repository store pair. Bypasses every wrapper, including the
   * workspace wrapper. Used ONLY by the reconciler's grace-GC pass per
   * A.4's aggregate-refcount requirement; never by route handlers.
   */
  forReconciler(): SloStores {
    const repository = this.savedObjects.createInternalRepository(SLO_INTERNAL_REPO_TYPES);
    return this.fromClient((repository as unknown) as SavedObjectsClientContract);
  }

  private fromClient(client: SavedObjectsClientContract): SloStores {
    return {
      sloStore: new SavedObjectSloStore(client),
      ruleRefStore: new SloRuleRefStore(client),
    };
  }
}

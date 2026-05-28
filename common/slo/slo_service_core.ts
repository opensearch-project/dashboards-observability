/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mutable shared state for the SLO service. The lifecycle / status / query
 * sub-services all read and write the same store, status cache, dedup
 * configuration, and plugin metadata — collecting that here keeps the three
 * services independent of each other (no service-to-service references) and
 * lets the facade swap the store / aggregator / refStore at runtime without
 * threading the change through every sub-service.
 *
 * Not part of the public surface — exported only so the three sub-services
 * (and the facade) can declare it as a constructor parameter.
 */

import type { ISloStore, SloLiveStatus } from './slo_types';
import type { Logger } from '../types/alerting';
import { InMemorySloStore } from './slo_store';
import type {
  SloRuleRefStoreLite,
  SloStatusAggregator,
  SloStoreFactoryLite,
  SloStoresLite,
} from './slo_service_types';

/**
 * Default for `ruleDedup.enabled`. Matches the schema default. The plugin's
 * `start()` flips it to whatever the operator configured.
 */
const DEFAULT_DEDUP_ENABLED = true;

export class SloServiceCore {
  store: ISloStore;
  readonly statusCache = new Map<string, { status: SloLiveStatus; expiresAt: number }>();
  /**
   * Aggregator is optional — when unset, getStatuses falls back to the
   * offline stub (disabled/no_data). Request-scoped state (client, workspace,
   * datasource resolver) is passed per-call via `SloStatusAggregationContext`.
   */
  aggregator?: SloStatusAggregator;
  /**
   * De-dup key for aggregator-failure warnings: one warn per (sloId × code).
   * Prevents the listing-page poll from spamming the log when the ruler is
   * down. Cleared on store swap (new env → fresh slate).
   */
  readonly loggedAggregatorFailures = new Set<string>();

  /**
   * Reflects `observability.slo.ruleDedup.enabled`. Flipped by
   * `server/plugin.ts` at boot. The service-dedup write path and the
   * aggregator branch on this via `isDedupEnabled()`. Default `true` matches
   * the schema default.
   */
  dedupEnabled = DEFAULT_DEDUP_ENABLED;

  /**
   * Refcount registry. Optional. When absent and `dedupEnabled` is true the
   * service still runs the dedup codepath but skips the refcount
   * bookkeeping — useful for tests that want to exercise the generator split
   * without wiring a saved-objects client. Plugin wires the real
   * `SloRuleRefStore` in `start()`.
   */
  refStore?: SloRuleRefStoreLite;

  /**
   * Plugin version stamped into provenance annotations. Defaults to '0.0.0'
   * — production wires the real `kibana.version` from the plugin initializer
   * context.
   */
  pluginVersion = '0.0.0';

  /**
   * Per-request store factory. When set, lifecycle/query/status methods that
   * receive a `request` route SO operations through `factory.forRequest(request)`
   * so the saved-objects workspace wrapper engages. When unset (tests, offline
   * dev), the singleton `store` / `refStore` continue to back every call —
   * matching pre-A.4 behavior.
   */
  storeFactory?: SloStoreFactoryLite;

  /**
   * Resolve the (sloStore, ruleRefStore) pair for one call. When the factory
   * is wired AND the caller passed a request, return per-request stores
   * scoped to the workspace wrapper. Otherwise fall back to the singletons
   * the facade configured (used by tests + the in-memory bootstrap path).
   */
  resolveStores(request?: unknown): SloStoresLite {
    if (this.storeFactory && request !== undefined && request !== null) {
      return this.storeFactory.forRequest(request);
    }
    return { sloStore: this.store, ruleRefStore: this.refStore };
  }

  constructor(public readonly logger: Logger, store?: ISloStore) {
    this.store = store ?? new InMemorySloStore();
  }
}

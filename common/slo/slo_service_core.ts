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
import type { SloRuleRefStoreLite, SloStatusAggregator } from './slo_service_types';

/**
 * Phase 3 (W3.6) default for `ruleDedup.enabled`. Matches the schema default.
 * The plugin's `start()` flips it to whatever the operator configured.
 */
const DEFAULT_DEDUP_ENABLED = true;

export class SloServiceCore {
  store: ISloStore;
  readonly statusCache = new Map<string, { status: SloLiveStatus; expiresAt: number }>();
  /**
   * Aggregator is optional — when unset, getStatuses falls back to the W1.2
   * stub (disabled/no_data). Request-scoped state (client, workspace,
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
   * Phase 3 (W3.6) — reflects `observability.slo.ruleDedup.enabled`. Flipped
   * by `server/plugin.ts` at boot. Batch 2 workstreams (W3.8 service dedup,
   * W3.9 aggregator) branch on this via `isDedupEnabled()`. Default `true`
   * matches the schema default.
   */
  dedupEnabled = DEFAULT_DEDUP_ENABLED;

  /**
   * Phase 3 (W3.8) — refcount registry. Optional. When absent and
   * `dedupEnabled` is true the service still runs the dedup codepath but
   * skips the refcount bookkeeping — useful for tests that want to exercise
   * the generator split without wiring a saved-objects client. Plugin wires
   * the real `SloRuleRefStore` in `start()`.
   */
  refStore?: SloRuleRefStoreLite;

  /**
   * Plugin version stamped into provenance annotations (W3.3). Defaults to
   * '0.0.0' — production wires the real `kibana.version` from the plugin
   * initializer context.
   */
  pluginVersion = '0.0.0';

  constructor(public readonly logger: Logger, store?: ISloStore) {
    this.store = store ?? new InMemorySloStore();
  }
}

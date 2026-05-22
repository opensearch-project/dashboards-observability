/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared types and the workspace-namespace helper used by the SLO service
 * surface. Lives in `common/` because the structural shapes are referenced
 * from server (route adapters, status aggregator), browser (rule-health
 * panel), and the cross-tree tests.
 *
 * Split out of `slo_service.ts` during the lifecycle/status/query
 * decomposition (PR #2689 H5). Keeping the shapes co-located here — rather
 * than scattering them across `slo_lifecycle_service.ts`,
 * `slo_status_service.ts`, and `slo_query_service.ts` — avoids circular-
 * import risk between the three sub-services and the facade.
 */

import type { AlertingOSClient, Datasource } from '../types/alerting';
import type { SloDocument, SloLiveStatus, GeneratedRuleGroup } from './slo_types';
import type { SloRulerErrorCode } from './slo_errors';
import { SLO_RULER_NAMESPACE } from './slo_promql_generator';

// ============================================================================
// Ruler deployment context
// ============================================================================

/**
 * Minimal ruler-client surface the service needs. Mirrors `RulerClient` in
 * `server/services/slo/ruler_client.ts` but declared here so the SLO service
 * (importable from both server and tests) doesn't reach into the server tree.
 */
export interface SloRulerClient {
  upsertRuleGroup(
    client: AlertingOSClient,
    datasource: Datasource,
    namespace: string,
    group: GeneratedRuleGroup
  ): Promise<void>;
  deleteRuleGroup(
    client: AlertingOSClient,
    datasource: Datasource,
    namespace: string,
    groupName: string
  ): Promise<void>;
  /**
   * Used by the rule-health checker to enumerate the groups currently in a
   * namespace. Optional so test doubles that don't need health checks can
   * skip implementing it.
   */
  listRuleGroups?(
    client: AlertingOSClient,
    datasource: Datasource,
    namespace: string
  ): Promise<GeneratedRuleGroup[]>;
}

/**
 * Per-request deployment context passed to `create` / `update` / `delete`.
 * When absent, ruler calls are skipped entirely — e.g. unit tests, dev-server
 * paths without a real DirectQuery backend, or legacy callers that haven't
 * been plumbed through yet.
 *
 * Design choice (memo §Dual-write): methods take `deploy?`, rather than the
 * constructor taking a RulerClient, because the OS client / datasource / ws
 * are all request-scoped and can't live on the service instance.
 */
export interface SloDeployContext {
  ruler: SloRulerClient;
  client: AlertingOSClient;
  datasource: Datasource;
  /**
   * Workspace identifier for namespace scoping. Pass `'default'` if the
   * caller has no workspace concept (standalone, tests). The namespace is
   * `slo-generated-<workspaceId>` — hyphen (not slash) because the SQL
   * plugin's REST router treats `{namespace}` as a single path segment.
   */
  workspaceId: string;
}

// ============================================================================
// Phase 3 dedup: refcount registry surface (W3.2 / W3.8)
// ============================================================================

/**
 * Minimal shape the W3.8 dedup path consumes. The real implementation lives in
 * `server/services/slo/slo_rule_ref_store.ts` — declared here structurally so
 * the SLO service (common/) does not reach into the server tree.
 *
 * `incrementRef` returns `wasZero: true` iff the refcount transitioned from 0
 * (or was newly created). The service uses that to decide whether the shared
 * recording group must be upserted this call — repeated upserts are byte-equal
 * no-ops, but skipping them is still the right call (design §3 dedup intent).
 */
export interface SloRuleRefStoreLite {
  get(
    workspaceId: string,
    datasourceId: string,
    fingerprint: string
  ): Promise<{ attributes: { refcount: number } } | null>;
  incrementRef(input: {
    workspaceId: string;
    datasourceId: string;
    fingerprint: string;
    fingerprintVersion: string;
    groupName: string;
    namespace: string;
  }): Promise<{ wasZero: boolean }>;
  decrementRef(input: {
    workspaceId: string;
    datasourceId: string;
    fingerprint: string;
  }): Promise<{ droppedToZero: boolean; underflow: boolean }>;
}

// ============================================================================
// Live-status aggregator context (W3.1)
// ============================================================================

/**
 * Minimal aggregator surface the service needs. Mirrors `SloStatusAggregator`
 * in `server/services/slo/status_aggregator.ts` — declared here so the SLO
 * service (importable from browser bundles via tests) doesn't reach into
 * the server tree.
 */
export interface SloStatusAggregator {
  aggregate(docs: SloDocument[], ctx: SloStatusAggregationContext): Promise<SloLiveStatus[]>;
}

export interface SloStatusAggregationContext {
  client: AlertingOSClient;
  resolveDatasource: (datasourceId: string) => Promise<Datasource | undefined>;
  workspaceId: string;
  /**
   * OSD `RequestHandlerContext` — typed as `unknown` here because the real
   * type lives in `src/core/server` and pulling it in would force this
   * common file to compile against server-only types. The status aggregator
   * narrows it back to `RequestHandlerContext` before invoking
   * `data.search.search` for PromQL execution. Required at runtime when
   * `data.search` is wired (production path); optional for offline tests
   * that only exercise non-query branches.
   */
  requestContext?: unknown;
  /**
   * Phase 3 (W3.6) — propagates the `observability.slo.ruleDedup.enabled`
   * flag so the aggregator can pick fingerprint-keyed selectors (W3.9) when
   * true, or fall back to the legacy `{slo_id="X"}` selectors when false.
   * Undefined → legacy behavior (pre-Phase-3).
   */
  ruleDedupEnabled?: boolean;
  /**
   * Optional pass-through for the aggregator's W1.6 priority-merge step.
   * Typed as `unknown` at this layer because the real checker interface
   * lives in the server tree; the server aggregator narrows it to
   * `SloRuleHealthChecker`. When undefined the aggregator leaves the
   * sample-derived state alone.
   */
  healthChecker?: unknown;
}

// ============================================================================
// Workspace id shape + namespace helper
// ============================================================================

/**
 * Workspace ids accepted by `sloRulerNamespaceFor`. The value lands in a URL
 * path segment that Cortex uses to key rule groups; allowing arbitrary text
 * opens path traversal, ambiguous `%`-encoded segments, and unicode-
 * normalization surprises. Mirrors the OSD saved-object id shape.
 */
export const WORKSPACE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/;

/**
 * Compose the per-workspace ruler namespace. Hyphen separator (not slash) so
 * the whole thing stays a single `{namespace}` path segment when routed
 * through `/_plugins/_directquery/_resources/{dqName}/api/v1/rules/{namespace}`.
 *
 * Throws when `workspaceId` fails the shape check — the ruler path is
 * workspace-scoped and a bad segment leaks into every subsequent ruler
 * call until the caller is fixed.
 */
export function sloRulerNamespaceFor(workspaceId: string): string {
  // Defend against `undefined` / `null` / empty — regex `.test()`
  // auto-stringifies `undefined` to "undefined" (which matches), so the
  // type-narrow check happens explicitly before the shape check.
  if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
    throw new Error(
      `sloRulerNamespaceFor: workspaceId must be a non-empty string, got: ${String(workspaceId)}`
    );
  }
  if (!WORKSPACE_ID_RE.test(workspaceId)) {
    throw new Error(
      `sloRulerNamespaceFor: workspaceId must match /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/, got: ${JSON.stringify(
        workspaceId
      )}`
    );
  }
  return `${SLO_RULER_NAMESPACE}-${workspaceId}`;
}

// ============================================================================
// Rule-health + repair context (W1.5)
// ============================================================================

/**
 * Canonical rule-health state shared across server, common, and public layers.
 * Lives in `common/` because it's referenced by both server-only
 * (`rule_health_checker.ts`) and browser-only (`slo_api_client.ts`) code,
 * and `common/` is the only tree both can import from.
 */
export type SloRuleHealthState = 'ok' | 'rules_partial' | 'rules_missing' | 'ruler_unreachable';

/**
 * Backward-compat alias. Older callsites referenced the historical name; new
 * callers should use `SloRuleHealthState`.
 *
 * @deprecated Use `SloRuleHealthState`.
 */
export type SloRuleHealthStateLite = SloRuleHealthState;

/**
 * Canonical rule-health report shape returned by the server's `RuleHealthChecker`
 * and consumed by the public `SloApiClient`.
 */
export interface RuleHealthReportLite {
  state: SloRuleHealthState;
  expectedGroups: string[];
  presentGroups: string[];
  missingGroups: string[];
  rulerErrorCode?: SloRulerErrorCode;
  computedAt: string;
}

/**
 * Input accepted by the injected rule-health `check` callback. Same shape the
 * server-side `RuleHealthChecker.check` consumes — declared locally so the
 * caller can adapt freely without ripping through this surface.
 */
export interface RuleHealthCheckInputLite {
  workspaceId: string;
  datasource: Datasource;
  client: AlertingOSClient;
  sloId: string;
  namespace: string;
  expectedGroups: string[];
}

/**
 * Minimal rule-health surface the `repair()` method needs. Mirrors the
 * server-side `RuleHealthChecker` contract (see
 * `server/services/slo/rule_health_checker.ts`) structurally, so the service
 * layer doesn't reach into the server tree.
 */
export interface SloRuleHealthProbe {
  check(input: RuleHealthCheckInputLite): Promise<RuleHealthReportLite>;
  invalidate(workspaceId: string, datasourceId: string, sloId: string): void;
}

/**
 * Per-request context for `SloService.repair`. Keeps the same shape as the
 * existing `SloDeployContext` + a rule-health probe, passed in alongside so
 * the service can reuse the ruler to upsert and the probe to re-verify.
 */
export interface SloRepairContext {
  health: SloRuleHealthProbe;
  deploy: SloDeployContext;
}

/**
 * Result returned by `SloService.repair`.
 *
 * - `repaired` records whether a ruler upsert actually happened this call.
 *   A healthy SLO short-circuits before any ruler mutation, so the same
 *   repair call invoked back-to-back on a healthy SLO returns
 *   `repaired: false` both times.
 * - `health` is the post-repair snapshot so the UI can re-render in one
 *   round-trip without a separate rule_health fetch.
 */
export interface SloRepairResult {
  sloId: string;
  repaired: boolean;
  health: RuleHealthReportLite;
}

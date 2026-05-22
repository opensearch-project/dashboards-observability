/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * RuleHealthChecker — per-SLO probe of the Prometheus-compatible ruler (Cortex)
 * that answers: "are the rule groups this SLO's saved object expects to be
 * deployed actually present on the ruler right now?"
 *
 * The check runs synchronously against the ruler via `RulerClient.getRuleGroup`
 * and classifies the outcome into one of four states (`ok`, `rules_partial`,
 * `rules_missing`, `ruler_unreachable`). The result is cached with a short TTL
 * (default 30 s) keyed by `(workspaceId, datasourceId, sloId)` so that the
 * listing page, detail page, and aggregator can all poll per-SLO health without
 * fanning out a ruler call on every request.
 *
 * Cache invalidation is deliberately narrow: the reconciler is responsible
 * for pushing `invalidate()` whenever its sweep detects a diff for an SLO,
 * so the next probe recomputes instead of waiting for the TTL to elapse. UI
 * code paths should rely on the TTL.
 *
 * This file does not import or instantiate any real RulerClient — it operates
 * against a structural contract (`{ getRuleGroup }`). The production wiring
 * lives elsewhere and the concrete client provides that method.
 */

import type { AlertingOSClient, Datasource, Logger } from '../../../common/types/alerting';
import type { GeneratedRuleGroup } from '../../../common/slo/slo_types';
import { SloRulerError } from '../../../common/slo/slo_errors';
import type { SloRulerErrorCode } from '../../../common/slo/slo_errors';
import type { SloRuleHealthState } from '../../../common/slo/slo_service';
import type { RulerClient } from './ruler_client';

/**
 * Classification of the SLO's rule-group presence on the ruler.
 *   - `ok`                 → every expected group is present
 *   - `rules_partial`      → at least one expected group is present and at least one is missing
 *   - `rules_missing`      → all expected groups are absent
 *   - `ruler_unreachable`  → probe short-circuited because the ruler itself could
 *                            not be contacted or rejected the request (auth failure,
 *                            network error, upstream 5xx, etc.)
 *
 * Re-exported alias of the canonical `SloRuleHealthState` from common/slo/slo_service
 * so existing imports against the checker's surface keep working.
 */
export type RuleHealthState = SloRuleHealthState;

/** Report returned by `RuleHealthChecker.check`. */
export interface RuleHealthReport {
  state: RuleHealthState;
  /** Group names the caller said the SLO expects to see on the ruler. */
  expectedGroups: string[];
  /** Of `expectedGroups`, which were present on the ruler. */
  presentGroups: string[];
  /** `expectedGroups` minus `presentGroups`. */
  missingGroups: string[];
  /**
   * Populated only when `state === 'ruler_unreachable'`. Copied from the
   * `SloRulerError.code` thrown by the probe so the caller can render a
   * self-service error message without catching its own exceptions.
   */
  rulerErrorCode?: SloRulerErrorCode;
  /** ISO-8601 timestamp captured via the injected `now()` when the report was computed. */
  computedAt: string;
}

/** Input to a single health check call. */
export interface RuleHealthCheckInput {
  workspaceId: string;
  datasource: Datasource;
  client: AlertingOSClient;
  sloId: string;
  /** Ruler namespace (typically `slo-generated-<workspaceId>`). */
  namespace: string;
  /**
   * Group names the SLO expects to exist. Dedup SLOs carry one shared
   * recording group per fingerprint plus one per-SLO alert group;
   * single-group SLOs carry just the per-SLO alert group.
   */
  expectedGroups: string[];
}

/**
 * Stateful probe + cache. Create one per server plugin instance and inject
 * where per-SLO rule health is needed (routes, aggregator, reconciler).
 */
export interface RuleHealthChecker {
  check(input: RuleHealthCheckInput): Promise<RuleHealthReport>;
  /**
   * Drop the cached entry for the given (workspace, datasource, slo) tuple.
   * The reconciler calls this when its sweep observes a diff for an SLO, so
   * the next `check()` recomputes instead of returning a stale TTL result.
   * Non-existent keys are a no-op.
   */
  invalidate(workspaceId: string, datasourceId: string, sloId: string): void;
}

/** Minimal structural subset of RulerClient this checker relies on. */
interface RuleGroupProbe {
  /**
   * Returns the rule group if present on the ruler, `null` on 404, or throws
   * `SloRulerError` for any other failure. The real `RulerClient` provides
   * this method; the structural type keeps this module testable without a
   * real ruler implementation.
   */
  getRuleGroup(
    client: AlertingOSClient,
    datasource: Datasource,
    namespace: string,
    groupName: string
  ): Promise<GeneratedRuleGroup | null>;
}

interface CacheEntry {
  report: RuleHealthReport;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 30_000;

/**
 * Cache key isolates health reports by workspace, datasource, and SLO id so
 * the same `sloId` seen in a different workspace (or against a different
 * datasource) never collides. The separator `|` is not legal in any of the
 * three fields (they're all opaque ids from `saved_objects`), so a simple
 * concat is unambiguous.
 */
function cacheKey(ws: string, dsId: string, sloId: string): string {
  return `${ws}|${dsId}|${sloId}`;
}

/**
 * Factory for a `RuleHealthChecker`. The concrete checker class is not
 * exported so callers use this factory; this keeps the cache state
 * encapsulated and makes `now` / `ttlMs` injection the only public knobs.
 */
export function createRuleHealthChecker(
  ruler: RulerClient,
  logger: Logger,
  opts: { ttlMs?: number; now?: () => number } = {}
): RuleHealthChecker {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const now = opts.now ?? Date.now;
  const cache = new Map<string, CacheEntry>();

  // The checker accepts any object that provides `getRuleGroup`. In
  // production the ruler passed in is a real `RulerClient`; in tests the
  // caller passes a jest.fn-backed partial. The cast happens once at
  // construction time so the hot path stays type-safe.
  const probe = (ruler as unknown) as RuleGroupProbe;

  async function probeGroup(
    input: RuleHealthCheckInput,
    group: string
  ): Promise<GeneratedRuleGroup | null> {
    return probe.getRuleGroup(input.client, input.datasource, input.namespace, group);
  }

  async function runCheck(input: RuleHealthCheckInput): Promise<RuleHealthReport> {
    const expected = [...input.expectedGroups];
    const present: string[] = [];
    const missing: string[] = [];
    const computedAt = new Date(now()).toISOString();

    // Short-circuit the "nothing to probe" degenerate case — surface it as
    // `ok` (no expected groups means nothing can be missing). This keeps
    // callers from having to special-case SLOs that haven't been
    // provisioned yet.
    if (expected.length === 0) {
      return {
        state: 'ok',
        expectedGroups: expected,
        presentGroups: present,
        missingGroups: missing,
        computedAt,
      };
    }

    // Probe all groups in parallel — each probe is an independent ruler RTT
    // and dedup SLOs commonly carry 7+ recording groups. The outcome shape
    // matches the sequential version: ruler failure short-circuits to
    // `ruler_unreachable`; unknown errors propagate.
    type ProbeOutcome =
      | { kind: 'present'; group: string }
      | { kind: 'missing'; group: string }
      | { kind: 'ruler_error'; group: string; err: SloRulerError }
      | { kind: 'unknown_error'; err: unknown };

    const outcomes = await Promise.all(
      expected.map(
        async (group): Promise<ProbeOutcome> => {
          try {
            const g = await probeGroup(input, group);
            return g ? { kind: 'present', group } : { kind: 'missing', group };
          } catch (err: unknown) {
            if (err instanceof SloRulerError) {
              return { kind: 'ruler_error', group, err };
            }
            return { kind: 'unknown_error', err };
          }
        }
      )
    );

    // Bug-class errors (non-SloRulerError throws) take precedence — surface
    // them so they don't get masked by an in-flight ruler outage.
    const bug = outcomes.find((o) => o.kind === 'unknown_error');
    if (bug && bug.kind === 'unknown_error') throw bug.err;

    const rulerError = outcomes.find((o) => o.kind === 'ruler_error');
    if (rulerError && rulerError.kind === 'ruler_error') {
      logger.debug(
        `RuleHealthChecker: ruler probe failed for sloId=${input.sloId} ns=${input.namespace} group=${rulerError.group} code=${rulerError.err.code}`
      );
      return {
        state: 'ruler_unreachable',
        expectedGroups: expected,
        presentGroups: [],
        missingGroups: [],
        rulerErrorCode: rulerError.err.code,
        computedAt,
      };
    }

    for (const o of outcomes) {
      if (o.kind === 'present') present.push(o.group);
      else if (o.kind === 'missing') missing.push(o.group);
    }

    let state: RuleHealthState;
    if (present.length === expected.length) {
      state = 'ok';
    } else if (present.length === 0) {
      state = 'rules_missing';
    } else {
      state = 'rules_partial';
    }

    return {
      state,
      expectedGroups: expected,
      presentGroups: present,
      missingGroups: missing,
      computedAt,
    };
  }

  return {
    async check(input: RuleHealthCheckInput): Promise<RuleHealthReport> {
      const key = cacheKey(input.workspaceId, input.datasource.id, input.sloId);
      const hit = cache.get(key);
      const currentMs = now();

      if (hit && hit.expiresAt > currentMs) {
        return hit.report;
      }

      // Expired entries are dropped so the Map doesn't grow unbounded across
      // TTL generations for the same key.
      if (hit) cache.delete(key);

      const report = await runCheck(input);
      cache.set(key, { report, expiresAt: currentMs + ttlMs });
      return report;
    },

    invalidate(workspaceId: string, datasourceId: string, sloId: string): void {
      cache.delete(cacheKey(workspaceId, datasourceId, sloId));
    },
  };
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live status aggregator — replaces the W1.2 stub in slo_service.ts with
 * real ruler queries (W3.1).
 *
 * For each SLO:
 *   1. Pick the "longest" recording-rule window — `findClosestRecordingWindow`
 *      maps the spec's rolling window (e.g. 28d) to the closest window we
 *      actually recorded (3d cap — the W2.4 approximation).
 *   2. Run one PromQL instant query per SLO against the pre-computed error
 *      ratio for that window, matching on `slo_id` so we get one sample per
 *      objective in a single call:
 *        {__name__=~"slo:sli_error:ratio_rate_<win>:.*", slo_id="<sloId>"}
 *   3. Run one alerts call per distinct datasource and group by `slo_id`
 *      label to count firing alerts per SLO.
 *   4. Map samples → ObjectiveStatus with attainment / errorBudgetRemaining
 *      and a per-objective state (ok / warning / breached).
 *
 * Error surface contract (per task): **never throw to the service**. Status
 * aggregation is a read path the listing page calls constantly; a ruler
 * outage must not 500 the listing. Partial failures degrade per-SLO to
 * `no_data`; catastrophic failures (programmer error, malformed spec) are
 * the only things allowed to reject.
 *
 * Query path: `POST /_plugins/_directquery/_query/{dqName}` — the SQL plugin's
 * query execution API. Reused from `DirectQueryPrometheusBackend.queryInstant`
 * so we know this path is wired through the SQL plugin to Cortex. The
 * resource-proxy path (`.../api/v1/query`) would also work (verified 2026-04-23
 * — GET/POST/DELETE are registered on the resource router), but reusing the
 * proven query-execution path keeps us on the same code path we already test.
 *
 * Alerts: `GET /_plugins/_directquery/_resources/{dqName}/api/v1/alerts` —
 * same path as `DirectQueryPrometheusBackend.getAlerts`.
 */

/* eslint-disable max-classes-per-file */

import type {
  AlertingOSClient,
  Datasource,
  Logger,
  PromRawAlert,
  PromAlertsApiResponse,
} from '../../../common/types/alerting/types';
import type {
  ObjectiveStatus,
  Objective,
  SloDocument,
  SloHealthState,
  SloLiveStatus,
} from '../../../common/slo/slo_types';
import {
  dedupRecordingRuleName,
  findClosestRecordingWindow,
  parseDurationToMs,
  RECORDING_WINDOWS,
} from '../../../common/slo/slo_promql_generator';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Structural shape for a rule-health checker. Intentionally declared inline
 * (not imported from `rule_health_checker.ts`) to keep the aggregator's
 * dependencies weak — callers synthesize this object from whichever checker
 * they have on hand (real in wiring, `jest.fn()` in tests).
 */
export interface SloRuleHealthCheckResult {
  state: 'ok' | 'rules_partial' | 'rules_missing' | 'ruler_unreachable';
  rulerErrorCode?: string;
  expectedGroups: string[];
  presentGroups: string[];
  missingGroups: string[];
  computedAt: string;
}

export interface SloRuleHealthChecker {
  check(input: {
    workspaceId: string;
    datasource: Datasource;
    client: AlertingOSClient;
    sloId: string;
    namespace: string;
    expectedGroups: string[];
  }): Promise<SloRuleHealthCheckResult>;
}

export interface SloStatusAggregationContext {
  client: AlertingOSClient;
  /**
   * Resolve a Datasource by its persisted `spec.datasourceId`. The aggregator
   * uses this to derive `directQueryName` per SLO — `spec.datasourceId` is a
   * logical identifier and the actual `directQueryName` is only known to the
   * alerting DatasourceService once discovery has run. Returns undefined if
   * the datasource is no longer available; those SLOs degrade to `no_data`.
   */
  resolveDatasource: (datasourceId: string) => Promise<Datasource | undefined>;
  /**
   * Workspace identifier — drives ruleSuffix(workspaceId, sloId, objective).
   * Matches what was used at create time (see `SloDeployContext.workspaceId`).
   */
  workspaceId: string;
  /**
   * Optional rule-health checker. When present, the aggregator calls it once
   * per enabled prometheus-backed SLO after ruler samples are collected and
   * overlays the result onto the top-level SloLiveStatus.state per the W1.6
   * priority rules:
   *   `disabled` > `rules_missing` > `ruler_unreachable` > existing derivation
   * Leave undefined in offline / tests that only exercise the sample-based
   * derivation. See W1.6 in SLO_RULE_DEDUP_PLAN.md.
   */
  healthChecker?: SloRuleHealthChecker;
  /**
   * Phase 3 W3.9 — when true, the aggregator queries fingerprint-named
   * recording rules (e.g. `slo:sli_error:ratio_rate_3d:sli_<fp>`) and maps
   * samples back to objectives via each SO's `recordingFingerprints`. When
   * undefined/false, the legacy `{slo_id="X"}` selector is used.
   */
  ruleDedupEnabled?: boolean;
}

export interface SloStatusAggregator {
  /**
   * Compute live status for a batch of SLOs. Returns one `SloLiveStatus` per
   * input doc in order. Never throws for routine ruler problems: when a
   * datasource is unreachable, the affected SLOs surface as `no_data`.
   */
  aggregate(docs: SloDocument[], ctx: SloStatusAggregationContext): Promise<SloLiveStatus[]>;
}

// ============================================================================
// NoopStatusAggregator — offline dev / tests
// ============================================================================

/**
 * Offline fallback. Mirrors the W1.2 stub semantics: `disabled` when
 * spec.enabled is false, `no_data` otherwise. The rule count is derived
 * from the spec's recording fingerprints + objective count so the listing
 * can still show "X rules provisioned".
 *
 * This is what `SloService` falls back to when no aggregator is configured
 * (or when the DirectQuery one catastrophically rejects).
 */
export class NoopStatusAggregator implements SloStatusAggregator {
  async aggregate(docs: SloDocument[]): Promise<SloLiveStatus[]> {
    return docs.map((doc) => noDataOrDisabledStatus(doc));
  }
}

// ============================================================================
// DirectQueryStatusAggregator — real implementation
// ============================================================================

/**
 * Parsed sample from a PromQL instant query. `timestamp` is in *seconds* as
 * Prometheus returns it — the aggregator scales to ms only at the stale check.
 */
interface InstantSample {
  labels: Record<string, string>;
  timestamp: number;
  value: number;
}

/**
 * Variant of `InstantSample` that retains samples whose value was non-finite
 * (NaN / Infinity). The recording rule is alive — Cortex returned a series at
 * the requested timestamp — but the recorded expression evaluated to e.g.
 * `1 - (0 / 0)` because the source metric had no traffic in the window. The
 * aggregator differentiates "rule fires NaN" (`source_idle`) from "ruler
 * never returned anything" (`no_data`) so the listing badge surfaces the
 * underlying reason; finite-only callers should keep using
 * `parseInstantResponse`.
 */
interface InstantSampleMaybeFinite {
  labels: Record<string, string>;
  timestamp: number;
  /** Finite numeric, or `null` when the recorded expression was NaN/Inf. */
  value: number | null;
}

export class DirectQueryStatusAggregator implements SloStatusAggregator {
  /**
   * De-dup key for health-checker failure warnings: one warn per
   * (sloId × error-message). Mirrors `SloService.warnAggregatorFailure` so a
   * flapping checker doesn't spam the log during listing polls. Cleared
   * implicitly by process lifetime — the aggregator is a singleton per
   * plugin start, so this matches the lifetime of the other caches.
   */
  private readonly loggedHealthCheckerFailures = new Set<string>();

  constructor(private readonly logger: Logger) {}

  async aggregate(docs: SloDocument[], ctx: SloStatusAggregationContext): Promise<SloLiveStatus[]> {
    // Short-circuit: nothing to do.
    if (docs.length === 0) return [];

    // Group SLOs by datasourceId so we do one alerts fetch per datasource,
    // not per SLO. PromQL queries still go one-per-SLO (different series).
    const byDs = new Map<string, SloDocument[]>();
    for (const d of docs) {
      const list = byDs.get(d.spec.datasourceId) ?? [];
      list.push(d);
      byDs.set(d.spec.datasourceId, list);
    }

    const perSloStatus = new Map<string, SloLiveStatus>();

    for (const [dsId, group] of byDs.entries()) {
      let ds: Datasource | undefined;
      try {
        ds = await ctx.resolveDatasource(dsId);
      } catch (err) {
        this.logger.warn(
          `StatusAggregator: resolveDatasource threw for ${dsId}: ${errMsg(err)}. Degrading ${
            group.length
          } SLO(s) to no_data.`
        );
      }

      if (!ds || !ds.directQueryName) {
        for (const d of group) perSloStatus.set(d.id, noDataOrDisabledStatus(d));
        continue;
      }

      // Firing-alerts: one fetch per datasource, keyed by slo_id.
      let alertCountBySloId = new Map<string, number>();
      try {
        alertCountBySloId = await this.fetchFiringAlertsBySlo(ctx.client, ds);
      } catch (err) {
        // Graceful: treat as zero firing alerts for this datasource and keep
        // computing attainment — a ruler that can't serve /alerts might still
        // serve /query.
        this.logger.warn(
          `StatusAggregator: alerts fetch failed for datasource ${ds.id} (${
            ds.directQueryName
          }): ${errMsg(err)}. firingCount will be 0 for affected SLOs.`
        );
      }

      // Per-SLO: one instant query for the recording-rule samples.
      await Promise.all(
        group.map(async (doc) => {
          // W1.6 priority 1: `disabled` beats everything — don't even call the
          // ruler or the health checker for a disabled SLO.
          if (!doc.spec.enabled) {
            perSloStatus.set(doc.id, disabledStatus(doc));
            return;
          }
          let base: SloLiveStatus;
          try {
            base = await this.statusForSlo(doc, ds!, ctx, alertCountBySloId.get(doc.id) ?? 0);
          } catch (err) {
            this.logger.warn(
              `StatusAggregator: statusForSlo failed for ${doc.id}: ${errMsg(
                err
              )}. Degrading to no_data.`
            );
            base = noDataStatus(doc);
          }
          // W1.6 priority 2/3: overlay rule-health state on top of the sample
          // derivation. Health-checker errors never escape (see
          // applyRuleHealthMerge) — the listing must stay available.
          const merged = await this.applyRuleHealthMerge(doc, ds!, ctx, base);
          perSloStatus.set(doc.id, merged);
        })
      );
    }

    // Preserve input order.
    return docs.map((d) => perSloStatus.get(d.id) ?? noDataStatus(d));
  }

  // --------------------------------------------------------------------------
  // Rule-health priority merge (W1.6)
  // --------------------------------------------------------------------------

  /**
   * Apply the W1.6 rule-health priority rules to a previously-computed
   * SloLiveStatus. The priority ladder (highest first):
   *   1. `disabled` (handled upstream — disabled SLOs never reach here)
   *   2. `rules_missing` — health-checker says `rules_missing` or `rules_partial`
   *   3. `ruler_unreachable` — health-checker says `ruler_unreachable`; the
   *      public `SloHealthState` union has no `ruler_unreachable` value so
   *      we surface this as `'no_data'` with a debug log. Callers who need
   *      the precise error code can call `GET .../rule_health` directly.
   *   4. existing sample-based derivation — no overlay
   *
   * Errors from `healthChecker.check` are **never** re-thrown: the listing
   * page polls this aggregator constantly, and a ruler outage must not 500
   * the listing. Warnings are deduped per (sloId × message) so a flapping
   * ruler doesn't spam the log.
   */
  private async applyRuleHealthMerge(
    doc: SloDocument,
    ds: Datasource,
    ctx: SloStatusAggregationContext,
    base: SloLiveStatus
  ): Promise<SloLiveStatus> {
    if (!ctx.healthChecker) return base;

    const expectedGroups = expectedRuleGroupsFor(doc);
    // Nothing to check — no persisted rule group name (shouldn't happen for a
    // prometheus-backed SLO that's gone through create, but be defensive).
    if (expectedGroups.length === 0) return base;

    const provisioning = doc.status.provisioning;
    // Non-prometheus backends don't own ruler state — skip.
    if (provisioning.backend !== 'prometheus') return base;

    let result: SloRuleHealthCheckResult;
    try {
      result = await ctx.healthChecker.check({
        workspaceId: ctx.workspaceId,
        datasource: ds,
        client: ctx.client,
        sloId: doc.id,
        namespace: provisioning.rulerNamespace,
        expectedGroups,
      });
    } catch (err) {
      this.warnHealthCheckerFailure(doc.id, err);
      return base;
    }

    if (result.state === 'rules_missing' || result.state === 'rules_partial') {
      return { ...base, state: 'rules_missing' };
    }
    if (result.state === 'ruler_unreachable') {
      this.logger.debug(
        `ruler unreachable for slo=${doc.id} code=${result.rulerErrorCode ?? 'unknown'}`
      );
      return { ...base, state: 'no_data' };
    }
    // `ok` — leave the sample-derived state intact.
    return base;
  }

  private warnHealthCheckerFailure(sloId: string, err: unknown): void {
    const msg = errMsg(err);
    const key = `${sloId}:${msg}`;
    if (this.loggedHealthCheckerFailures.has(key)) return;
    this.loggedHealthCheckerFailures.add(key);
    this.logger.warn(
      `StatusAggregator: healthChecker.check rejected (slo=${sloId}): ${msg}. Leaving state untouched.`
    );
  }

  // --------------------------------------------------------------------------
  // Per-SLO aggregation
  // --------------------------------------------------------------------------

  private async statusForSlo(
    doc: SloDocument,
    ds: Datasource,
    ctx: SloStatusAggregationContext,
    firingCount: number
  ): Promise<SloLiveStatus> {
    const spec = doc.spec;
    const window =
      spec.window.type === 'rolling' ? spec.window.duration : '3d'; /* calendar: use cap */
    const longWindow = findClosestRecordingWindow(window);

    // Phase 3 W3.9: branch on dedup flag. Dedup-keyed recording rules carry
    // no `slo_objective` label (they're shared across SLOs), so we key
    // samples by `__name__` and map back to objectives via the SO's
    // `recordingFingerprints` map.
    const recordingFingerprints =
      doc.status.provisioning.backend === 'prometheus'
        ? doc.status.provisioning.recordingFingerprints
        : undefined;
    const dedup = !!ctx.ruleDedupEnabled && !!recordingFingerprints;

    let byObjective = new Map<string, InstantSample>();
    let sourceIdleObjectives = new Set<string>();
    if (dedup) {
      const result = await this.queryDedupObjectiveSamples(
        ctx.client,
        ds,
        recordingFingerprints!,
        longWindow
      );
      byObjective = result.byObjective;
      sourceIdleObjectives = result.sourceIdleObjectives;
    } else {
      const query = buildLongWindowQuery(doc.id, longWindow);
      const { samples, nonFinite } = await this.queryInstant(ctx.client, ds, query);
      for (const s of samples) {
        const name = s.labels.slo_objective;
        if (name) byObjective.set(name, s);
      }
      // Track objectives whose recording rule fired but emitted NaN/Inf so
      // we can distinguish "source metric is idle" from "rule never ran".
      for (const s of nonFinite) {
        const name = s.labels.slo_objective;
        if (name && !byObjective.has(name)) {
          sourceIdleObjectives.add(name);
        }
      }
    }

    const staleAfterMs = 2 * parseDurationToMs(longWindow);
    const nowMs = Date.now();
    let lastEvalMs: number | undefined;
    let anyStale = false;
    let anyObjectiveHasData = false;
    let anyObjectiveSourceIdle = false;

    const objectiveStatuses: ObjectiveStatus[] = spec.objectives.map((obj) => {
      const s = byObjective.get(obj.name);
      if (!s) {
        if (sourceIdleObjectives.has(obj.name)) {
          anyObjectiveSourceIdle = true;
          return sourceIdleObjectiveStatus(obj, doc);
        }
        return emptyObjectiveStatus(obj, doc);
      }
      anyObjectiveHasData = true;
      const sampleMs = s.timestamp * 1000;
      if (lastEvalMs === undefined || sampleMs > lastEvalMs) lastEvalMs = sampleMs;
      const stale = nowMs - sampleMs > staleAfterMs;
      if (stale) anyStale = true;
      return buildObjectiveStatus(obj, doc, s.value, spec.budgetWarningThresholds);
    });

    const topState = deriveTopLevelState(
      spec.enabled,
      anyStale,
      anyObjectiveHasData,
      objectiveStatuses,
      anyObjectiveSourceIdle
    );

    return {
      sloId: doc.id,
      objectives: objectiveStatuses,
      state: topState,
      firingCount,
      ruleCount: deriveRuleCount(doc),
      computedAt: new Date().toISOString(),
      lastEvaluatedAt: lastEvalMs ? new Date(lastEvalMs).toISOString() : undefined,
    };
  }

  /**
   * Phase 3 W3.9 — query each unique fingerprint's recording rule by exact
   * `__name__` and map samples back to objectives via the provided
   * `recordingFingerprints`. One `__name__=~` query per call covers every
   * fingerprint this SLO references, so a multi-objective SLO with N unique
   * SLIs pays one Cortex round-trip regardless of N.
   *
   * Samples are keyed by `__name__` label; the map returned is
   * `objectiveName → sample` so the caller's existing per-objective loop
   * continues to work unchanged.
   */
  private async queryDedupObjectiveSamples(
    client: AlertingOSClient,
    ds: Datasource,
    recordingFingerprints: Record<string, string>,
    longWindow: string
  ): Promise<{
    byObjective: Map<string, InstantSample>;
    sourceIdleObjectives: Set<string>;
  }> {
    const uniqueFps = [...new Set(Object.values(recordingFingerprints))];
    if (uniqueFps.length === 0) {
      return { byObjective: new Map(), sourceIdleObjectives: new Set() };
    }
    const expectedNames = uniqueFps.map((fp) => dedupRecordingRuleName(fp, longWindow));
    const query = buildDedupObjectiveQuery(expectedNames);
    const { samples, nonFinite } = await this.queryInstant(client, ds, query);
    // Index by __name__ (or fallback label). Prometheus returns __name__
    // inside the sample's `metric` map by default.
    const byName = new Map<string, InstantSample>();
    for (const s of samples) {
      const metricName = s.labels.__name__;
      if (metricName) byName.set(metricName, s);
    }
    // Names whose recording rule fired but emitted NaN/Inf — the source
    // metric is idle in the window, not the rule itself.
    const sourceIdleNames = new Set<string>();
    for (const s of nonFinite) {
      const metricName = s.labels.__name__;
      if (metricName) sourceIdleNames.add(metricName);
    }
    const byObjective = new Map<string, InstantSample>();
    const sourceIdleObjectives = new Set<string>();
    for (const [objectiveName, fp] of Object.entries(recordingFingerprints)) {
      const ruleName = dedupRecordingRuleName(fp, longWindow);
      const sample = byName.get(ruleName);
      if (sample) {
        byObjective.set(objectiveName, sample);
      } else if (sourceIdleNames.has(ruleName)) {
        sourceIdleObjectives.add(objectiveName);
      }
    }
    return { byObjective, sourceIdleObjectives };
  }

  // --------------------------------------------------------------------------
  // Wire-level helpers
  // --------------------------------------------------------------------------

  /**
   * Fetch firing alerts and group by `slo_id` label. Uses the same
   * resource-proxy path as `DirectQueryPrometheusBackend.getAlerts` (verified
   * 2026-04-23 — GET passes through the SQL plugin's resource router). Only
   * state=firing is counted; pending/inactive aren't "active pages".
   */
  private async fetchFiringAlertsBySlo(
    client: AlertingOSClient,
    ds: Datasource
  ): Promise<Map<string, number>> {
    const path = `/_plugins/_directquery/_resources/${encodeURIComponent(
      ds.directQueryName as string
    )}/api/v1/alerts`;
    const resp = await client.transport.request({ method: 'GET', path });
    const body = resp.body as PromAlertsApiResponse | Record<string, unknown> | PromRawAlert[];
    const alerts = extractAlerts(body);
    const counts = new Map<string, number>();
    for (const a of alerts) {
      if (a.state !== 'firing') continue;
      const sloId = a.labels?.slo_id;
      if (!sloId) continue;
      counts.set(sloId, (counts.get(sloId) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * Run a PromQL instant query through the SQL plugin's query execution
   * endpoint. Response is unwrapped to the `{resultType, result}` Prometheus
   * shape and mapped to `InstantSample[]`.
   *
   * The SQL plugin's `PrometheusQueryHandler` requires `options.time` for
   * instant queries — it rejects the request with
   * `"Time parameter is required for instant queries"` otherwise. We pass
   * "now" in epoch seconds; Prometheus returns the most recent sample at
   * that wall-clock moment.
   */
  private async queryInstant(
    client: AlertingOSClient,
    ds: Datasource,
    query: string
  ): Promise<ParsedInstantResponse> {
    const dqName = ds.directQueryName as string;
    const path = `/_plugins/_directquery/_query/${encodeURIComponent(dqName)}`;
    const resp = await client.transport.request({
      method: 'POST',
      path,
      body: {
        datasource: dqName,
        query,
        language: 'PROMQL',
        options: {
          queryType: 'instant',
          time: Math.floor(Date.now() / 1000).toString(),
        },
      },
    });
    return parseInstantResponseWithNonFinite(resp.body as Record<string, unknown>);
  }
}

// ============================================================================
// Pure helpers — unit-testable without a transport
// ============================================================================

/**
 * Build a PromQL instant query that returns one sample per objective for a
 * given SLO at the long-window recording rule. The regex anchors on the
 * metric-name prefix so we only match our generated recording rules.
 */
export function buildLongWindowQuery(sloId: string, longWindow: string): string {
  const esc = sloId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `{__name__=~"slo:sli_error:ratio_rate_${longWindow}:.*", slo_id="${esc}"}`;
}

/**
 * Phase 3 W3.9 — build a single PromQL query matching every fingerprint-named
 * recording rule the SLO references. Anchored regex on `__name__` so we only
 * match our own rules. Names are hex-only (`sli_<16-hex>`) so no escaping is
 * required.
 */
export function buildDedupObjectiveQuery(metricNames: string[]): string {
  const pattern = metricNames.join('|');
  return `{__name__=~"^(${pattern})$"}`;
}

/**
 * Per-objective state ladder.
 *  - `breached` when the sampled error ratio exceeds the full budget
 *    (attainment < target, equivalently errorBudgetRemaining < 0).
 *  - `warning` when any configured budget-warning threshold is tripped —
 *    threshold = "fraction of budget remaining below which we warn". We
 *    pick the **largest** threshold that still triggers (i.e. the earliest
 *    warn), since that's the severity tier the user asked us to flag at.
 *  - `ok` otherwise.
 *
 * Pinned test cases (see __tests__/status_aggregator.test.ts):
 *   target=0.999, errorBudgetTotal=0.001
 *   errorRatio=0.002  → attainment=0.998, budget=-1.0  → breached
 *   errorRatio=0.0006 → attainment=0.9994, budget=+0.4 → warning (threshold=0.5)
 *   errorRatio=0.0002 → attainment=0.9998, budget=+0.8 → ok
 */
export function objectiveState(
  attainment: number,
  target: number,
  errorBudgetRemaining: number,
  budgetWarningThresholds: ReadonlyArray<{ threshold: number; severity: string }>
): 'ok' | 'warning' | 'breached' {
  if (attainment < target) return 'breached';
  for (const t of sortThresholdsDesc(budgetWarningThresholds)) {
    if (errorBudgetRemaining < t.threshold) return 'warning';
  }
  return 'ok';
}

function sortThresholdsDesc(
  thresholds: ReadonlyArray<{ threshold: number; severity: string }>
): Array<{ threshold: number; severity: string }> {
  return [...thresholds].sort((a, b) => b.threshold - a.threshold);
}

/**
 * Top-level state per design §3.6 — `disabled` and `stale` pre-empt the
 * per-objective roll-up. For the worst-of we consider breached > warning >
 * no_data > ok: no_data sits *below* warning because "we don't know yet" is
 * less alarming than "we know the budget is burning" — but above ok because
 * an SLO with no signal at all warrants visibility on the listing.
 */
export function deriveTopLevelState(
  enabled: boolean,
  anyStale: boolean,
  anyObjectiveHasData: boolean,
  objectives: readonly ObjectiveStatus[],
  anyObjectiveSourceIdle: boolean = false
): SloHealthState {
  if (!enabled) return 'disabled';
  if (anyStale) return 'stale';
  // Distinguish "rule fired NaN/Inf because source metric is idle" from
  // "rule never ran". Both states show "no signal" on the listing, but the
  // source_idle case points users at the upstream metric/Data-Prepper
  // pipeline, while no_data points at the ruler / rule config.
  if (!anyObjectiveHasData) return anyObjectiveSourceIdle ? 'source_idle' : 'no_data';
  const severity: Record<SloHealthState, number> = {
    disabled: -1,
    stale: -1,
    ok: 0,
    no_data: 1,
    source_idle: 1,
    warning: 2,
    breached: 3,
    // rules_missing is never set per-objective (it's a top-level overlay
    // injected by applyRuleHealthMerge), but include it so the severity map
    // is total over SloHealthState. Between breached and no_data so it
    // doesn't silently downgrade a simultaneously breached SLO.
    rules_missing: 3,
  };
  let worst: SloHealthState = 'ok';
  for (const o of objectives) {
    if (severity[o.state] > severity[worst]) worst = o.state;
  }
  return worst;
}

// ============================================================================
// Status-builder helpers
// ============================================================================

function buildObjectiveStatus(
  objective: Objective,
  doc: SloDocument,
  errorRatio: number,
  budgetWarningThresholds: ReadonlyArray<{ threshold: number; severity: string }>
): ObjectiveStatus {
  const attainment = clampAttainment(1 - errorRatio);
  const target = objective.target;
  // errorBudgetRemaining as fraction of budget (0..1 when healthy, negative
  // when breached). Matches SRE Workbook + Sloth/Pyrra convention.
  const errorBudgetRemaining = target < 1 ? (attainment - target) / (1 - target) : 0;
  const state = objectiveState(attainment, target, errorBudgetRemaining, budgetWarningThresholds);
  return {
    objectiveName: objective.name,
    currentValue: errorRatio,
    currentValueUnit: inferUnit(doc),
    attainment,
    errorBudgetRemaining,
    state,
  };
}

function emptyObjectiveStatus(objective: Objective, doc: SloDocument): ObjectiveStatus {
  return {
    objectiveName: objective.name,
    currentValue: 0,
    currentValueUnit: inferUnit(doc),
    attainment: 0,
    errorBudgetRemaining: 1,
    state: 'no_data',
  };
}

/**
 * The recording rule fired but emitted NaN / Inf — the source metric had
 * zero traffic in the window. Distinct from `no_data` (ruler never returned
 * anything) so the listing can point users at the upstream metric instead
 * of the SLO config / ruler.
 */
function sourceIdleObjectiveStatus(objective: Objective, doc: SloDocument): ObjectiveStatus {
  return {
    objectiveName: objective.name,
    currentValue: 0,
    currentValueUnit: inferUnit(doc),
    attainment: 0,
    errorBudgetRemaining: 1,
    state: 'source_idle',
  };
}

function noDataOrDisabledStatus(doc: SloDocument): SloLiveStatus {
  return doc.spec.enabled ? noDataStatus(doc) : disabledStatus(doc);
}

function noDataStatus(doc: SloDocument): SloLiveStatus {
  return {
    sloId: doc.id,
    objectives: doc.spec.objectives.map((o) => emptyObjectiveStatus(o, doc)),
    state: 'no_data',
    firingCount: 0,
    ruleCount: deriveRuleCount(doc),
    computedAt: new Date().toISOString(),
  };
}

function disabledStatus(doc: SloDocument): SloLiveStatus {
  return {
    sloId: doc.id,
    objectives: doc.spec.objectives.map((o) => ({
      objectiveName: o.name,
      currentValue: 0,
      currentValueUnit: inferUnit(doc),
      attainment: 0,
      errorBudgetRemaining: 1,
      state: 'disabled',
    })),
    state: 'disabled',
    firingCount: 0,
    ruleCount: deriveRuleCount(doc),
    computedAt: new Date().toISOString(),
  };
}

/**
 * Count of rules provisioned for this SLO, derived from spec shape so the
 * listing UI can render without a ruler round trip. Mirrors the helper in
 * `slo_service.ts`; both use the same RECORDING_WINDOWS constant.
 */
function deriveRuleCount(doc: SloDocument): number {
  if (doc.status.provisioning.backend !== 'prometheus') return 0;
  const p = doc.status.provisioning;
  const objectiveCount = Math.max(doc.spec.objectives.length, 1);
  if (p.recordingFingerprints) {
    const uniqueFps = new Set(Object.values(p.recordingFingerprints)).size;
    return uniqueFps * RECORDING_WINDOWS.length + objectiveCount;
  }
  return objectiveCount;
}

// Values sometimes arrive as NaN (dividing by zero rate on a scraped-once
// metric). Clamp so downstream charts don't render garbage.
function clampAttainment(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function inferUnit(doc: SloDocument): 'ratio' | 'seconds' | 'count' {
  if (doc.spec.sli.type !== 'single') return 'ratio';
  const def = doc.spec.sli.definition;
  if (def.backend === 'prometheus' && def.type === 'latency_threshold') return 'seconds';
  return 'ratio';
}

// ============================================================================
// Response parsers — defensive against the DirectQuery envelope variants
// (see DirectQueryPrometheusBackend.extractPrometheusResult for prior art)
// ============================================================================

/**
 * Walk the possible DirectQuery response envelopes and return the Prometheus
 * `{resultType, result}` object, or `null` if nothing usable is present.
 * Mirrors DirectQueryPrometheusBackend.extractPrometheusResult.
 */
function extractPrometheusResult(
  body: Record<string, unknown>
): { resultType?: string; result?: unknown[] } | null {
  if (body?.resultType || body?.result) return body as { resultType?: string; result?: unknown[] };
  if (body?.data && typeof body.data === 'object') {
    const data = body.data as Record<string, unknown>;
    if (data.resultType || data.result) {
      return data as { resultType?: string; result?: unknown[] };
    }
  }
  if (body?.results && typeof body.results === 'object') {
    const results = body.results as Record<string, unknown>;
    for (const val of Object.values(results)) {
      if (val && typeof val === 'object') {
        const dsResult = val as Record<string, unknown>;
        if (dsResult.resultType || dsResult.result) {
          return dsResult as { resultType?: string; result?: unknown[] };
        }
      }
    }
  }
  return null;
}

/**
 * Result of `parseInstantResponseWithNonFinite` — both finite samples and
 * non-finite samples are kept, the latter to distinguish "rule fires NaN /
 * Inf" (the recording rule is alive but the source metric is idle in the
 * window) from "ruler never returned anything".
 */
export interface ParsedInstantResponse {
  /** Finite samples — same shape as `parseInstantResponse` returns. */
  samples: InstantSample[];
  /**
   * Samples whose timestamp is finite but whose value was NaN / +Inf / -Inf.
   * The aggregator uses these to mark per-objective state as `source_idle`
   * instead of `no_data`.
   */
  nonFinite: InstantSampleMaybeFinite[];
}

/**
 * Detail-preserving parse — keeps non-finite samples around so the aggregator
 * can distinguish between "ruler unreachable / no rule output at all" and
 * "rule fires but recorded NaN because the source metric was idle in the
 * window". The legacy `parseInstantResponse` below returns only the finite
 * subset for backward compat with consumers that don't care about the
 * distinction.
 */
export function parseInstantResponseWithNonFinite(
  body: Record<string, unknown>
): ParsedInstantResponse {
  const promResult = extractPrometheusResult(body);
  if (!promResult) return { samples: [], nonFinite: [] };
  const result = (promResult.result ?? []) as Array<{
    metric?: Record<string, string>;
    value?: unknown[];
  }>;
  const samples: InstantSample[] = [];
  const nonFinite: InstantSampleMaybeFinite[] = [];
  for (const entry of result) {
    if (Array.isArray(entry.value) && entry.value.length >= 2) {
      const ts = Number(entry.value[0]);
      if (!Number.isFinite(ts)) continue;
      const numVal = parseFloat(String(entry.value[1]));
      if (Number.isFinite(numVal)) {
        samples.push({ labels: entry.metric || {}, timestamp: ts, value: numVal });
      } else {
        nonFinite.push({ labels: entry.metric || {}, timestamp: ts, value: null });
      }
    }
  }
  return { samples, nonFinite };
}

export function parseInstantResponse(body: Record<string, unknown>): InstantSample[] {
  return parseInstantResponseWithNonFinite(body).samples;
}

function extractAlerts(
  body: PromAlertsApiResponse | Record<string, unknown> | PromRawAlert[]
): PromRawAlert[] {
  if (Array.isArray(body)) return body as PromRawAlert[];
  const b = body as PromAlertsApiResponse;
  if (b?.alerts) return b.alerts;
  if (b?.data) {
    const inner = b.data;
    if (Array.isArray(inner)) return inner;
    if (typeof inner === 'object' && inner !== null && 'alerts' in inner) {
      return (inner as { alerts: PromRawAlert[] }).alerts;
    }
  }
  return [];
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Derive the list of rule-group names the ruler is expected to serve for
 * this SLO.
 *
 * Dedup shape: one shared recording group per unique fingerprint
 * (`slo:rec:<fp>`) plus one per-SLO alert group (`alertGroupName`). Legacy
 * (flag-off) shape carries only `alertGroupName`.
 *
 * Returns an empty array when there's nothing to probe (non-prometheus
 * backend, or neither shape populated).
 */
export function expectedRuleGroupsFor(doc: SloDocument): string[] {
  const p = doc.status.provisioning;
  if (p.backend !== 'prometheus') return [];
  const names: string[] = [];
  if (p.recordingFingerprints) {
    for (const fp of new Set(Object.values(p.recordingFingerprints))) {
      names.push(`slo:rec:${fp}`);
    }
  }
  if (p.alertGroupName) {
    names.push(p.alertGroupName);
  }
  return names;
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Canonical kind stamped onto suggest-driven SLO creates.
 *
 * Defined here (not in the suggest engine) so `SloSpec` / `SloSummary` can
 * reference it without pulling the suggest engine — a public-only module —
 * into `common/`. The suggest engine re-imports from this module.
 */
export type SuggestionKind =
  | 'apm-availability'
  | 'apm-latency'
  | 'http-availability'
  | 'http-latency'
  | 'rpc-availability'
  | 'rpc-latency'
  | 'db-latency'
  | 'messaging-latency'
  | 'genai-availability';

/**
 * SLO/SLI domain types.
 *
 * This file is the source of truth for the shape of an SLO in this plugin.
 * It mirrors the Kubernetes-style `{ id, spec, status }` design documented
 * in docs/design/slo-sli-design.md (§3). Every extension point is a
 * discriminated union so composite SLOs, OpenSearch-backed SLIs, calendar
 * windows, and future alerting strategies can land as additive arms without
 * migrating existing SLOs.
 *
 * P0 implements a single arm of each union:
 *   - SliNode.type === 'single'
 *   - SliDefinition.backend === 'prometheus'
 *   - Window.type === 'rolling'
 *   - AlertingStrategy.strategy === 'mwmbr'
 *   - ProvisioningRecord.backend === 'prometheus'
 */

// ============================================================================
// SLI Definition — §3.1
// ============================================================================

/**
 * OpenSLO budgetingMethod parity: Occurrences | Timeslices | RatioTimeslices.
 * - 'events'        — good/total event counts; take the ratio
 * - 'periods'       — each period is binary good/bad; good_periods / total_periods
 * - 'ratio_periods' — each period carries its own ratio; SLO value is the average
 */
export type SliCalcMethod = 'events' | 'periods' | 'ratio_periods';

export interface BaseSli {
  calcMethod: SliCalcMethod;
}

/** Prometheus SLI types supported in P0. */
export type PrometheusSliType = 'availability' | 'latency_threshold' | 'custom';

export type CustomPromQLExpr =
  | { mode: 'events'; goodQuery: string; totalQuery: string }
  | { mode: 'raw'; errorRatioQuery: string };

export interface PrometheusSli extends BaseSli {
  backend: 'prometheus';
  type: PrometheusSliType;
  /** Required unless `type === 'custom'`. */
  metric?: string;
  /** PromQL label matcher restricting "good" events (e.g. `status_code!~"5.."`). */
  goodEventsFilter?: string;
  /** Period length for calcMethod: 'periods' / 'ratio_periods' (e.g. "1m"). */
  periodLength?: string;
  /** Unit for `latency_threshold` SLIs. Default 'seconds'. */
  latencyThresholdUnit?: 'seconds' | 'milliseconds';
  /** When `type === 'custom'`, `customExpr` is authoritative. */
  customExpr?: CustomPromQLExpr;
}

/** Reserved for P2. Shape fixed now so P0 SLOs don't need migration later. */
export interface OpenSearchSli extends BaseSli {
  backend: 'opensearch';
  type: 'ratio' | 'threshold' | 'latency_threshold';
  index: string;
  goodQuery: object;
  totalQuery?: object;
  field?: string;
}

export type SliDefinition = PrometheusSli | OpenSearchSli;

/**
 * Grouping dimensions live inside the SingleSli node. Composite SLOs (P2)
 * aggregate members that each carry their own dimensions; the composite has none.
 */
export interface Dimension {
  name: string;
  value: string;
}

export interface SingleSli {
  type: 'single';
  definition: SliDefinition;
  dimensions: Dimension[];
}

/** Reserved for P2 (composite SLOs). */
export interface CompositeMember {
  sloId: string;
  weight?: number;
}

export interface CompositeSli {
  type: 'composite';
  operator: 'all' | 'any';
  members: CompositeMember[];
}

export type SliNode = SingleSli | CompositeSli;

// ============================================================================
// Objectives — §3.2
// ============================================================================

export interface Objective {
  /** Stable identifier within the SLO — embedded in rule-name slugs. */
  name: string;
  displayName?: string;
  /** Decimal in [0.5, 0.99999]. NEVER stored as percentage. */
  target: number;
  /** Required when `sli.definition.type === 'latency_threshold'`. */
  latencyThreshold?: number;
  /** For OpenSearch 'threshold' SLIs (P2). */
  thresholdBound?: { operator: '<' | '<=' | '>' | '>='; value: number };
  /** Required when `calcMethod === 'periods'`. */
  timeSliceTarget?: number;
  /** Optional weight for future composite-SLO rollup math. */
  compositeWeight?: number;
}

// ============================================================================
// Budget Warnings — §3.2
// ============================================================================

export interface BudgetWarningThreshold {
  /** Fraction of budget remaining (0..1). Fires when remaining drops below this. */
  threshold: number;
  /** Open string ("critical" | "warning" | "sev2" | ...). */
  severity: string;
}

// ============================================================================
// Window — §3.2
// ============================================================================

export interface RollingWindow {
  type: 'rolling';
  /** Prometheus duration (e.g. "7d", "14d", "28d", "30d"). */
  duration: string;
}

/** Reserved for P1. */
export interface CalendarWindow {
  type: 'calendar';
  period: 'week' | 'month' | 'quarter';
  timezone: string;
  startDay?: number;
}

export type Window = RollingWindow | CalendarWindow;

// ============================================================================
// Alerting Strategy — §3.2
// ============================================================================

export interface BurnRateConfig {
  shortWindow: string;
  longWindow: string;
  burnRateMultiplier: number;
  /** Open string. Orgs use different schemes (critical/warning, sev1..sev4, page/ticket). */
  severity: string;
  /** When false, skip the alerting rule but still emit the recording rules. */
  createAlarm: boolean;
  /** Prometheus `for:` duration (e.g. "2m"). */
  forDuration: string;
}

export interface MWMBRAlerting {
  strategy: 'mwmbr';
  burnRates: BurnRateConfig[];
}

export type AlertingStrategy = MWMBRAlerting;

// ============================================================================
// Supplemental alarms — §3.4
// ============================================================================

export interface SloAlarmConfig {
  /** Overlaps page-quick tier; default OFF. */
  sliHealth: { enabled: boolean };
  /** Overlaps ticket-slow tier; default OFF. */
  attainmentBreach: { enabled: boolean };
  /** One alert per (objective × threshold). Default ON. */
  budgetWarning: { enabled: boolean };
  /** Fires when the SLI query returns no data continuously for forDuration. Default OFF. */
  noData: { enabled: boolean; forDuration: string };
  /** Recovery notification when any firing SLO alert clears. Default OFF. */
  resolved: { enabled: boolean };
}

// ============================================================================
// Exclusion windows — §3.5 (shape reserved; evaluation deferred)
// ============================================================================

export type ExclusionSchedule =
  | { type: 'cron'; expression: string; timezone: string; duration: string }
  | { type: 'oneoff'; start: string; end: string };

export interface ExclusionWindow {
  name: string;
  schedule: ExclusionSchedule;
  reason?: string;
}

// ============================================================================
// SloSpec — user intent (§3.2)
// ============================================================================

export interface SloSpec {
  datasourceId: string;
  /** Human-readable; workspace-unique (409 on conflict). */
  name: string;
  description?: string;
  /** false = SLO paused: rules torn down, no alerts, listing shows 'disabled'. */
  enabled: boolean;
  /** 'active' computes status AND fires alerts. 'shadow' deploys recording rules only. */
  mode: 'active' | 'shadow';

  service: string;
  owner: {
    /** At least one team required. teams[0] is the primary owner. */
    teams: string[];
    primaryUser?: string;
  };
  tier?: string;
  /**
   * Canonical SLO kind stamped when the SLO was created from a suggest-engine
   * recommendation. Absent for manually-authored SLOs — readers must fall
   * back to a heuristic over `sli.definition` for pre-M5 and manual SLOs.
   */
  canonicalKind?: SuggestionKind;

  sli: SliNode;

  /** At least one objective required. Each generates its own rule set. */
  objectives: Objective[];

  /** Shared across all objectives. Empty array disables budget-warning alerts. */
  budgetWarningThresholds: BudgetWarningThreshold[];

  window: Window;
  alerting: AlertingStrategy;
  alarms: SloAlarmConfig;
  exclusionWindows: ExclusionWindow[];

  /** Propagated as slo_label_<key> on every generated rule. Array values are comma-joined. */
  labels: Record<string, string | string[]>;
  /** Metadata only — NEVER propagates to rules. */
  annotations: Record<string, string>;
}

// ============================================================================
// SloPersistedStatus — server-computed
// ============================================================================

export interface PrometheusProvisioning {
  backend: 'prometheus';
  rulerNamespace: string;
  /**
   * Map from objective name to the recording-rule fingerprint that's written
   * for that objective. Shared across SLOs that carry equivalent SLI shapes.
   * The recording group on the ruler is named `slo:rec:<fingerprint>`.
   */
  recordingFingerprints?: Record<string, string>;
  /**
   * Per-SLO alert group name. Alerts retain full SLO identity labels;
   * recording rules do not. Format: `slo:alerts:<slug>_<suffix>`.
   */
  alertGroupName?: string;
}

/** Reserved for P2. */
export interface OpenSearchProvisioning {
  backend: 'opensearch';
  monitorIds: string[];
  rollupIndex?: string;
}

export type ProvisioningRecord = PrometheusProvisioning | OpenSearchProvisioning;

export interface SloPersistedStatus {
  /** Optimistic concurrency version (409 on mismatch). */
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  provisioning: ProvisioningRecord;
}

// ============================================================================
// SloDocument — the persisted object (§3.2)
// ============================================================================

export interface SloDocument {
  /** Immutable. UUIDv4 or user-supplied slug matching /^[a-z][a-z0-9-]{2,62}$/. */
  id: string;
  spec: SloSpec;
  status: SloPersistedStatus;
}

// ============================================================================
// Live status — §3.6 (read-time, not persisted)
// ============================================================================

export type SloHealthState =
  | 'breached'
  | 'warning'
  | 'ok'
  | 'no_data'
  | 'source_idle'
  | 'stale'
  | 'disabled'
  | 'rules_missing';

export interface ObjectiveStatus {
  objectiveName: string;
  /** Raw measurement; unit given by `currentValueUnit`. */
  currentValue: number;
  currentValueUnit: 'ratio' | 'seconds' | 'count';
  /** 0–1 over the measurement window. */
  attainment: number;
  /** 0–1 fraction; can go negative once the budget is exhausted. */
  errorBudgetRemaining: number;
  state: SloHealthState;
}

export interface SloLiveStatus {
  sloId: string;
  objectives: ObjectiveStatus[];
  /** Worst per-objective state, with 'disabled' and 'stale' special cases applied at the top. */
  state: SloHealthState;
  firingCount: number;
  ruleCount: number;
  computedAt: string;
  lastEvaluatedAt?: string;
}

// ============================================================================
// SloSummary — §3.7 (listing projection)
// ============================================================================

export interface SloSummary {
  id: string;
  datasourceId: string;
  datasourceType: 'prometheus' | 'opensearch';
  name: string;
  description?: string;
  enabled: boolean;
  mode: 'active' | 'shadow';
  service: string;
  owner: { teams: string[]; primaryUser?: string };
  tier?: string;
  /** See `SloSpec.canonicalKind`. Mirrored into the listing projection. */
  canonicalKind?: SuggestionKind;
  sliNodeType: 'single' | 'composite';
  sliBackend?: 'prometheus' | 'opensearch';
  sliLeafType?: string;
  dimensions?: Dimension[];
  objectiveCount: number;
  /** Tightest target across objectives — useful as a single-column listing sort key. */
  worstTarget: number;
  window: Window;
  labels: Record<string, string | string[]>;
  status: SloLiveStatus;
}

// ============================================================================
// Generated rules (PromQL generator output) — see slo_promql_generator.ts
// ============================================================================

export interface GeneratedRule {
  type: 'recording' | 'alerting';
  name: string;
  expr: string;
  for?: string;
  labels: Record<string, string>;
  annotations?: Record<string, string>;
  description: string;
}

export interface GeneratedRuleGroup {
  groupName: string;
  /** Evaluation interval in seconds. */
  interval: number;
  rules: GeneratedRule[];
  yaml: string;
}

// ============================================================================
// Storage interface — service/store split
// ============================================================================

export interface SloPaginateOpts {
  /** 1-indexed; the underlying SO `find()` accepts the same shape. */
  page: number;
  /** Per-page row count. Caller is expected to clamp before passing. */
  perPage: number;
  /** Optional sort field (must be a top-level keyword projection). */
  sortField?: string;
  /** Defaults to 'asc'. */
  sortOrder?: 'asc' | 'desc';
  /** All-of, applied at the index level. */
  filters?: {
    datasourceId?: string[];
    state?: SloHealthState[];
    sliBackend?: Array<'prometheus' | 'opensearch'>;
    sliLeafType?: string[];
    service?: string[];
    team?: string[];
    tier?: string[];
    canonicalKind?: string[];
    enabled?: boolean;
    mode?: Array<'active' | 'shadow'>;
  };
  /** Free-text search; matches the SO `search` arg. */
  search?: string;
}

export interface SloPaginateResult {
  /** Page slice in store-native order. */
  docs: SloDocument[];
  /** Parallel array of last-known cachedState values; entry is null when unset. */
  cachedStates: Array<SloHealthState | null>;
  /** Total count across the matching set (cheap on the SO layer). */
  total: number;
}

export interface ISloStore {
  get(id: string): Promise<SloDocument | null>;
  list(datasourceIds?: string[]): Promise<SloDocument[]>;
  /**
   * Index-level paginated read. Pushes facet filters into the SO `filter`
   * clause so a state-filtered listing doesn't have to materialize every
   * matching SLO and slice client-side. Optional — implementations that
   * cannot push facets to the index throw `not implemented`, and the
   * caller falls back to the in-memory list path.
   */
  paginate?(opts: SloPaginateOpts): Promise<SloPaginateResult>;
  /** Upsert — uses `id` as the key. */
  save(doc: SloDocument): Promise<void>;
  /**
   * Lightweight write of just the cachedState projection. Skips the full
   * SO overwrite that `save` performs. Implementations MUST silently
   * no-op when the SO has been deleted (404) or workspace-scoped away
   * (403) — the caller treats this as a best-effort writeback.
   */
  updateCachedState?(id: string, state: SloHealthState): Promise<void>;
  /** Returns true if deleted, false if not found. */
  delete(id: string): Promise<boolean>;
}

// ============================================================================
// API boundary types
// ============================================================================

/** Create SLO input — everything lives in `spec` (server fills id + status). */
export interface SloCreateInput {
  /** Optional user-supplied slug. If absent, server generates a UUIDv4. */
  id?: string;
  spec: SloSpec;
}

/** Update SLO input — version required for optimistic concurrency. */
export interface SloUpdateInput {
  spec: Partial<SloSpec>;
  /** Must match `status.version` of the current server copy. */
  version: number;
}

// ============================================================================
// Probe SLI — step 8
// ============================================================================

/** Lookback windows offered to the wizard's Probe SLI button. */
export type ProbeSliLookback = '1h' | '24h' | '7d';

export interface ProbeSliRequest {
  datasourceId: string;
  goodQuery: string;
  totalQuery: string;
  /** Defaults to '1h' on the server when absent. */
  lookback?: ProbeSliLookback;
}

export interface ProbeSliSamplePoint {
  /** Millisecond epoch of the sample. */
  t: number;
  /** Ratio in [0, 1] — clamped client-side before render. */
  v: number;
}

/**
 * Partial-success response. A failed sub-query leaves its count/ratio absent
 * and populates `errors.{good,total}`; the opposite side's data is preserved
 * so the user sees whatever the backend did return.
 */
export interface ProbeSliResponse {
  goodCount?: number;
  totalCount?: number;
  /** `good / total`, clamped to [0, 1]. Absent when either side is missing. */
  sliRatio?: number;
  /** Up to 20 points spanning the lookback window. */
  samplePoints?: ProbeSliSamplePoint[];
  /** True when either query returned no series, or total count is 0. */
  emptyVector?: boolean;
  /** Per-query PromQL / backend diagnostic surfaced to the user verbatim. */
  errors?: { good?: string; total?: string };
}

/**
 * Response shape for `GET ${OBSERVABILITY_BASE}/v1/slos/_aggregate`.
 *
 * Server rolls up SLO summaries into per-service buckets in memory, so the
 * client makes one round-trip regardless of service count. The client-side
 * hook falls back to the list fan-out on 404 for older OSD servers that
 * predate this endpoint.
 */
export interface SloAggregateBucket {
  total: number;
  ok: number;
  warning: number;
  breached: number;
  noData: number;
  stale: number;
  disabled: number;
  rulesMissing: number;
  hasAvailability: boolean;
  hasLatency: boolean;
  missingCanonicalPair: boolean;
  /** Full `SloSummary` rows — retained so the Service Details SLOs tab can render without a second fetch. */
  slos: SloSummary[];
}

export interface SloAggregateResponse {
  bySvc: Record<string, SloAggregateBucket>;
}

export interface SloListFilters {
  /**
   * Restrict listing to SLOs owned by these datasource ids. Empty/undefined
   * means "all datasources the user has access to". The listing UI caps the
   * selection at 5; callers may pass arbitrary lengths.
   */
  datasourceId?: string[];
  state?: SloHealthState[];
  sliBackend?: Array<'prometheus' | 'opensearch'>;
  sliLeafType?: string[];
  service?: string[];
  team?: string[];
  tier?: string[];
  /**
   * Canonical SLO kind — stamped at suggest-driven create time (M5A) or
   * inferred heuristically by readers. Listing filter only; omitted means
   * "any kind". Server matches on the stored tag (no heuristic inference at
   * the filter layer — an untagged SLO simply falls outside the filter).
   */
  canonicalKind?: SuggestionKind[];
  enabled?: boolean;
  mode?: Array<'active' | 'shadow'>;
  search?: string;
  page?: number;
  pageSize?: number;
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLO/SLI domain types — schema v3 at birth.
 *
 * Every extension point is a discriminated union so composite SLOs,
 * OpenSearch-backed SLIs, calendar windows, and future alerting strategies
 * can land as additive arms without migrating existing SLOs.
 *
 * PR 1 implements a single arm of each union:
 *   - SliNode.type === 'single'
 *   - SliDefinition.backend === 'prometheus'
 *   - Window.type === 'rolling'
 *   - AlertingStrategy.strategy === 'mwmbr'
 *   - ProvisioningRecord.backend === 'prometheus'
 */

/**
 * Canonical kind stamped onto suggest-driven SLO creates.
 *
 * Defined here (not in the suggest engine) so `SloSpec` / `SloSummary` can
 * reference it without pulling the suggest engine — a public-only module —
 * into `common/`.
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

// ============================================================================
// SLI Definition
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

/** Prometheus SLI types supported in PR 1. */
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

/** Reserved for future work. Shape fixed now so SLOs don't need migration later. */
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
 * Grouping dimensions live inside the SingleSli node. Composite SLOs
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

/** Reserved for composite SLOs. */
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
// Objectives
// ============================================================================

export interface Objective {
  /** Stable identifier within the SLO — embedded in rule-name slugs. */
  name: string;
  displayName?: string;
  /** Decimal in [0.5, 0.99999]. NEVER stored as percentage. */
  target: number;
  /** Required when `sli.definition.type === 'latency_threshold'`. */
  latencyThreshold?: number;
  /** For OpenSearch 'threshold' SLIs. */
  thresholdBound?: { operator: '<' | '<=' | '>' | '>='; value: number };
  /** Required when `calcMethod === 'periods'`. */
  timeSliceTarget?: number;
  /** Optional weight for future composite-SLO rollup math. */
  compositeWeight?: number;
}

// ============================================================================
// Budget Warnings
// ============================================================================

export interface BudgetWarningThreshold {
  /** Fraction of budget remaining (0..1). Fires when remaining drops below this. */
  threshold: number;
  /** Open string ("critical" | "warning" | "sev2" | ...). */
  severity: string;
}

// ============================================================================
// Window
// ============================================================================

export interface RollingWindow {
  type: 'rolling';
  /** Prometheus duration (e.g. "7d", "14d", "28d", "30d"). */
  duration: string;
}

export interface CalendarWindow {
  type: 'calendar';
  period: 'week' | 'month' | 'quarter';
  timezone: string;
  startDay?: number;
}

export type Window = RollingWindow | CalendarWindow;

// ============================================================================
// Alerting Strategy
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
// Supplemental alarms
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
// Exclusion windows (shape reserved; evaluation deferred)
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
// SloSpec — user intent
// ============================================================================

export interface SloSpec {
  datasourceId: string;
  /**
   * Workspace identifier. Immutable after create. Stamped by the server from
   * runtime workspace context; absent means 'default' workspace (which is
   * what workspace-disabled deployments use). Do not fall back to
   * `datasourceId` — workspace and datasource are distinct concepts, and a
   * future UI may let one workspace span several datasources.
   */
  workspaceId?: string;
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
   * back to a heuristic over `sli.definition`.
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
   * Map from objective name to the recording-rule fingerprint written for
   * that objective. Shared across SLOs carrying equivalent SLI shapes. The
   * recording group on the ruler is named `slo:rec:<fingerprint>`. Empty
   * map is valid (e.g. an SLO with zero objectives, an edge case).
   */
  recordingFingerprints: Record<string, string>;
  /**
   * Per-SLO alert group name. Alerts retain full SLO identity labels;
   * recording rules do not. Format: `slo:alerts:<slug>_<suffix>`. Empty
   * string is valid for the zero-objective edge case.
   */
  alertGroupName: string;
  /**
   * Forward-compat placeholder. Future migrations may set this so an
   * async redeploy sweep can pick the SLO up, upsert the new group shape,
   * and clear the flag. PR 1 never writes it.
   */
  pendingRedeploy?: { reason: string; queuedAt: string };
}

/** Reserved for OpenSearch backend. */
export interface OpenSearchProvisioning {
  backend: 'opensearch';
  monitorIds: string[];
  rollupIndex?: string;
}

export type ProvisioningRecord = PrometheusProvisioning | OpenSearchProvisioning;

/** How the persisted SO came to exist — audit field, not a ruler detail. */
export interface AdoptionSource {
  source: 'recover' | 'clone';
  recoveredAt: string;
  sourceSloId?: string;
  sourceDatasourceId?: string;
}

export interface SloPersistedStatus {
  /** Optimistic concurrency version (409 on mismatch). */
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  provisioning: ProvisioningRecord;
  /**
   * Stamped when the SO was materialized from an orphan adoption flow rather
   * than a fresh create. Absent for normal creates; surfaced to the UI so
   * users can tell a recovered SLO from a hand-authored one. Does not affect
   * rule generation. PR 1 never writes it.
   */
  adoptionSource?: AdoptionSource;
}

// ============================================================================
// SloDocument — the persisted object
// ============================================================================

export interface SloDocument {
  /** Immutable. UUIDv4 or user-supplied slug matching /^[a-z][a-z0-9-]{2,62}$/. */
  id: string;
  spec: SloSpec;
  status: SloPersistedStatus;
}

// ============================================================================
// Live status (read-time, not persisted)
// ============================================================================

export type SloHealthState =
  | 'breached'
  | 'warning'
  | 'ok'
  | 'no_data'
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
// SloSummary — listing projection
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
// Generated rules (PromQL generator output)
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
// Storage interface
// ============================================================================

export interface ISloStore {
  get(id: string): Promise<SloDocument | null>;
  list(datasourceIds?: string[]): Promise<SloDocument[]>;
  /** Upsert — uses `id` as the key. */
  save(doc: SloDocument): Promise<void>;
  /** Returns true if deleted, false if not found. */
  delete(id: string): Promise<boolean>;
}

// ============================================================================
// API boundary types
// ============================================================================

export interface SloCreateInput {
  /** Optional user-supplied slug. If absent, server generates a UUIDv4. */
  id?: string;
  spec: SloSpec;
}

export interface SloUpdateInput {
  spec: Partial<SloSpec>;
  /** Must match `status.version` of the current server copy. */
  version: number;
}

export interface SloListFilters {
  datasourceId?: string[];
  state?: SloHealthState[];
  sliBackend?: Array<'prometheus' | 'opensearch'>;
  sliLeafType?: string[];
  service?: string[];
  team?: string[];
  tier?: string[];
  canonicalKind?: SuggestionKind[];
  enabled?: boolean;
  mode?: Array<'active' | 'shadow'>;
  search?: string;
  page?: number;
  pageSize?: number;
}

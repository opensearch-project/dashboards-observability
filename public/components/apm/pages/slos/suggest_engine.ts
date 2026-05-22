/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure draft-suggestion engine for the "Suggest SLOs" page.
 *
 * Given the APM services the page already enumerated, plus a slice of
 * Prometheus metadata and the current ruler rule groups, it emits
 * `Suggestion` records: each record is a well-formed `SloCreateInput` plus
 * UI-facing metadata (reason, estimated rule count, existing-rule match).
 *
 * Detectors (service-first, per-service rollup — no per-route explosion):
 *   - APM span-derived services (Data Prepper `request`/`fault` and
 *     `latency_seconds_bucket` with `namespace="span_derived"`).
 *     Availability + latency drafts per service.
 *   - OTel semconv HTTP server (`http_server_request_duration_seconds_*`) —
 *     availability + latency drafts scoped to (service_name | job).
 *   - OTel RPC / gRPC server (`rpc_server_duration_seconds_*`) —
 *     availability + latency drafts scoped to rpc_service.
 *   - OTel DB client (`db_client_operation_duration_seconds_*`) —
 *     latency drafts scoped to (service_name | job).
 *   - OTel messaging consumer (`messaging_process_duration_seconds_*`) —
 *     latency drafts scoped to (service_name | job).
 *   - OTel GenAI client (`gen_ai_client_operation_duration_seconds_*`) —
 *     availability drafts scoped to (service_name | job).
 *
 * A service can have *both* APM drafts and OTel drafts — they're different
 * data shapes (span-derived gauges vs. direct counters/histograms). The
 * engine does not dedupe across the two.
 *
 * Legacy OTel semconv (≤1.22) is intentionally not supported.
 *
 * "Category 1" rule reuse: if the caller supplies `existingRuleGroups`
 * (the ruler's current rule groups), we look for recording rules that
 * already carry `slo_service="<svc>"` labels covering the same SLI kind
 * and mark the draft as covered. Covered drafts are still emitted (for
 * visibility) but default to unselected so Create doesn't dual-write.
 *
 * No I/O. All HTTP/fetch lives in the page component.
 */

import { i18n } from '@osd/i18n';
import { DEFAULT_MWMBR_TIERS } from '../../../../../common/slo/slo_promql_generator';
import type { PromRule, PromRuleGroup } from '../../../../../common/types/alerting';
import type {
  BurnRateConfig,
  PrometheusSli,
  SingleSli,
  SloAlarmConfig,
  SloCreateInput,
  SloSpec,
  SuggestionKind,
} from '../../../../../common/slo/slo_types';

export type { SuggestionKind } from '../../../../../common/slo/slo_types';

// ============================================================================
// Public types
// ============================================================================

/** A service discovered by the caller (same shape as Services Home items). */
export interface DiscoveredService {
  serviceName: string;
  environment?: string;
}

/**
 * Slim slice of Prometheus metadata the engine consumes. Keyed by metric
 * name; each entry carries the label values seen on the dimensions the
 * detectors care about (see `metricsToProbe` for the full list).
 */
export interface MetricLabelValues {
  job?: string[];
  service_name?: string[];
  rpc_service?: string[];
  db_system?: string[];
  messaging_destination_name?: string[];
  http_route?: string[];
  rpc_method?: string[];
}

export type LabelValuesByMetric = Record<string, MetricLabelValues>;

export interface ServiceDiscoveryInput {
  datasourceId: string;
  services: DiscoveredService[];
  /**
   * Full metric-name universe visible on the datasource. Required to decide
   * which OTel detectors to run. When empty, only APM detectors fire.
   */
  metricNames?: string[];
  /** Label-value samples keyed by metric name. See `metricsToProbe`. */
  labelValuesByMetric?: LabelValuesByMetric;
  /**
   * Current ruler rule groups. When provided, the engine flags drafts whose
   * SLI kind is already covered by a recording rule labelled
   * `slo_service="<service>"` so callers can avoid dual-writing.
   */
  existingRuleGroups?: PromRuleGroup[];
}

/** Display-friendly label shown in the card badge. */
export const KIND_LABEL: Record<SuggestionKind, string> = {
  'apm-availability': i18n.translate('observability.apm.slo.suggest.kindLabel.apmAvailability', {
    defaultMessage: 'APM availability',
  }),
  'apm-latency': i18n.translate('observability.apm.slo.suggest.kindLabel.apmLatency', {
    defaultMessage: 'APM latency',
  }),
  'http-availability': i18n.translate('observability.apm.slo.suggest.kindLabel.httpAvailability', {
    defaultMessage: 'HTTP availability',
  }),
  'http-latency': i18n.translate('observability.apm.slo.suggest.kindLabel.httpLatency', {
    defaultMessage: 'HTTP latency',
  }),
  'rpc-availability': i18n.translate('observability.apm.slo.suggest.kindLabel.rpcAvailability', {
    defaultMessage: 'RPC availability',
  }),
  'rpc-latency': i18n.translate('observability.apm.slo.suggest.kindLabel.rpcLatency', {
    defaultMessage: 'RPC latency',
  }),
  'db-latency': i18n.translate('observability.apm.slo.suggest.kindLabel.dbLatency', {
    defaultMessage: 'DB client latency',
  }),
  'messaging-latency': i18n.translate('observability.apm.slo.suggest.kindLabel.messagingLatency', {
    defaultMessage: 'Messaging latency',
  }),
  'genai-availability': i18n.translate(
    'observability.apm.slo.suggest.kindLabel.genaiAvailability',
    { defaultMessage: 'GenAI availability' }
  ),
};

/** One draft SLO the user can accept / tweak / discard. */
export interface Suggestion {
  /** Stable key for React list + selection state. */
  key: string;
  /** Machine-readable kind — drives live-SLI preview + badges. */
  kindId: SuggestionKind;
  /** Pre-filled create payload. */
  input: SloCreateInput;
  /** Short human-readable reason shown in the card. */
  reason: string;
  /** Display label shown on the card badge. */
  kind: string;
  /** Detected metric the SLI targets — shown in the card body. */
  sourceMetric: string;
  /** Jobs / services used as dimensions (for display). */
  detected: Record<string, string>;
  /**
   * Expected number of rules if created with defaults — 7 recording +
   * 4 MWMBR + N budget warnings for a single-objective SLO.
   */
  estimatedRuleCount: number;
  /**
   * If set, an existing recording rule already covers this (service, kind).
   * Create-all flows should skip this draft to avoid dual-writing.
   */
  existingRuleMatch?: ExistingRuleMatch;
}

export interface ExistingRuleMatch {
  groupName: string;
  ruleName: string;
  /** SLO id if the rule was created by this plugin (extracted from labels). */
  sloId?: string;
}

// ============================================================================
// Shared spec-builder helpers
// ============================================================================

const DEFAULT_BURN_RATES: BurnRateConfig[] = DEFAULT_MWMBR_TIERS.map((t) => ({ ...t }));

const DEFAULT_ALARMS: SloAlarmConfig = {
  sliHealth: { enabled: false },
  attainmentBreach: { enabled: false },
  budgetWarning: { enabled: true },
  noData: { enabled: false, forDuration: '10m' },
  resolved: { enabled: false },
};

const DEFAULT_BUDGETS = [
  { threshold: 0.5, severity: 'warning' },
  { threshold: 0.2, severity: 'critical' },
];

/** `opentelemetry-demo/flagd` → `flagd`; otherwise return as-is. */
function jobToServiceName(job: string): string {
  const slash = job.lastIndexOf('/');
  return slash >= 0 ? job.slice(slash + 1) : job;
}

/** Kebab a string into a name token for objectives / defaults. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function buildSpec({
  datasourceId,
  name,
  description,
  service,
  sliDefinition,
  dimensions,
  objective,
}: {
  datasourceId: string;
  name: string;
  description: string;
  service: string;
  sliDefinition: PrometheusSli;
  dimensions: Array<{ name: string; value: string }>;
  objective: { name: string; target: number; latencyThreshold?: number };
}): SloSpec {
  const sli: SingleSli = {
    type: 'single',
    definition: sliDefinition,
    dimensions,
  };
  return {
    datasourceId,
    name,
    description,
    enabled: true,
    mode: 'active',
    service,
    owner: { teams: ['unassigned'] },
    tier: 'tier-2',
    sli,
    objectives: [objective],
    budgetWarningThresholds: DEFAULT_BUDGETS,
    window: { type: 'rolling', duration: '28d' },
    alerting: { strategy: 'mwmbr', burnRates: DEFAULT_BURN_RATES },
    alarms: DEFAULT_ALARMS,
    exclusionWindows: [],
    labels: {},
    annotations: {},
  };
}

function estimatedRules(objectives: number): number {
  return (7 + 4 + DEFAULT_BUDGETS.length) * objectives;
}

// ============================================================================
// Existing-rule index
// ============================================================================

/**
 * Canonical set of metric-name fragments that identify each SLI kind. We
 * scan a recording rule's PromQL for these to decide what the rule computes.
 * Order matters: more specific metric families go first so e.g. a rule
 * referencing `http_server_request_duration_seconds_bucket` is classified as
 * http-latency (histogram) rather than http-availability (count).
 */
const KIND_METRIC_SIGNATURES: Array<{
  kind: SuggestionKind;
  matches: (expr: string) => boolean;
}> = [
  { kind: 'http-latency', matches: (e) => /http_server_request_duration_seconds_bucket/.test(e) },
  {
    kind: 'http-availability',
    matches: (e) => /http_server_request_duration_seconds_count/.test(e),
  },
  { kind: 'rpc-latency', matches: (e) => /rpc_server_duration_seconds_bucket/.test(e) },
  { kind: 'rpc-availability', matches: (e) => /rpc_server_duration_seconds_count/.test(e) },
  { kind: 'db-latency', matches: (e) => /db_client_operation_duration_seconds_/.test(e) },
  { kind: 'messaging-latency', matches: (e) => /messaging_process_duration_seconds_/.test(e) },
  {
    kind: 'genai-availability',
    matches: (e) => /gen_ai_client_operation_duration_seconds_/.test(e),
  },
  // APM span-derived: a latency histogram reference beats the plain
  // request/fault signal so `apm-latency` wins for rules that compute both.
  { kind: 'apm-latency', matches: (e) => /latency_seconds_bucket/.test(e) },
  { kind: 'apm-availability', matches: (e) => /\brequest\b/.test(e) && /\bfault\b/.test(e) },
];

/**
 * Decide which SLI kind a recording rule covers based on its PromQL. Returns
 * null for rules we can't classify — callers treat those as "unrelated".
 */
function classifyRule(rule: PromRule): SuggestionKind | null {
  if (rule.type !== 'recording') return null;
  for (const { kind, matches } of KIND_METRIC_SIGNATURES) {
    if (matches(rule.query)) return kind;
  }
  return null;
}

/**
 * Build `Map<service, Map<kind, ExistingRuleMatch>>` from the ruler's rule
 * groups. Service attribution prefers the rule's `slo_service` label (stamped
 * by this plugin's generator), falling back to any of the common service
 * labels that appear inside a PromQL selector (`service=`, `service_name=`,
 * `rpc_service=`).
 */
function indexExistingRules(
  groups: PromRuleGroup[] | undefined
): Map<string, Map<SuggestionKind, ExistingRuleMatch>> {
  const index = new Map<string, Map<SuggestionKind, ExistingRuleMatch>>();
  if (!groups || groups.length === 0) return index;

  for (const group of groups) {
    for (const rule of group.rules) {
      if (rule.type !== 'recording') continue;
      const kind = classifyRule(rule);
      if (!kind) continue;
      const services = extractRuleServices(rule);
      if (services.length === 0) continue;
      const match: ExistingRuleMatch = {
        groupName: group.name,
        ruleName: rule.name,
        sloId: rule.labels?.slo_id,
      };
      for (const service of services) {
        let perKind = index.get(service);
        if (!perKind) {
          perKind = new Map<SuggestionKind, ExistingRuleMatch>();
          index.set(service, perKind);
        }
        // First match wins — rules later in the list are typically the
        // alerting siblings; keep the recording rule as the representative.
        if (!perKind.has(kind)) perKind.set(kind, match);
      }
    }
  }
  return index;
}

/**
 * Extract the service(s) a recording rule targets. We check three sources in
 * order:
 *   1. `slo_service` label — authoritative for rules created by this plugin.
 *   2. Common service-selector label values embedded in the PromQL expression
 *      (`service="X"`, `service_name="X"`, `rpc_service="X"`).
 *      A rule can reference more than one service (aggregated rollup), so
 *      this returns the full list.
 *   3. `service_name` / `service` label on the rule itself.
 */
function extractRuleServices(rule: PromRule): string[] {
  const labelService =
    rule.labels?.slo_service ??
    rule.labels?.service_name ??
    rule.labels?.service ??
    rule.labels?.rpc_service;
  if (labelService) return [labelService];

  // Fallback: regex over the expression.
  const found = new Set<string>();
  const patterns = [
    /\bservice="([^"]+)"/g,
    /\bservice_name="([^"]+)"/g,
    /\brpc_service="([^"]+)"/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(rule.query)) !== null) {
      if (m[1]) found.add(m[1]);
    }
  }
  return [...found];
}

/**
 * Attach `existingRuleMatch` to every draft that is already covered by a
 * recording rule. Mutates the suggestion records in place for simplicity —
 * the engine owns them at this point.
 */
function attachExistingRuleMatches(
  suggestions: Suggestion[],
  existingRuleGroups: PromRuleGroup[] | undefined
): void {
  if (!existingRuleGroups || existingRuleGroups.length === 0) return;
  const index = indexExistingRules(existingRuleGroups);
  if (index.size === 0) return;
  for (const s of suggestions) {
    const perKind = index.get(s.input.spec.service);
    if (!perKind) continue;
    const match = perKind.get(s.kindId);
    if (match) s.existingRuleMatch = match;
  }
}

// ============================================================================
// Detectors — APM span-derived
// ============================================================================

function apmDrafts(input: ServiceDiscoveryInput, out: Suggestion[]): void {
  for (const svc of input.services) {
    if (!svc.serviceName) continue;
    const service = svc.serviceName;
    const serverSelector = `service="${service}",remoteService="",namespace="span_derived"`;
    const detected: Record<string, string> = { service };
    if (svc.environment) detected.environment = svc.environment;

    // KNOWN-LIMITATION: span-derived `request` and `fault` are both counters,
    // and the custom-events path substitutes goodQuery/totalQuery verbatim
    // (no auto rate-wrapping). The recorded expression `1 - ((sum(request) -
    // sum(fault)) / sum(request))` will be `NaN` whenever the service is
    // idle in the window (0/0), and the lifetime-average error fraction
    // when it isn't. The aggregator now distinguishes the NaN case from
    // "ruler unreachable" (state=source_idle), but a proper fix needs the
    // generator to support a window-aware substitution token in custom
    // expressions — tracked separately from the latency-template fix.
    out.push({
      key: `apm-avail:${service}`,
      kindId: 'apm-availability',
      kind: KIND_LABEL['apm-availability'],
      reason: i18n.translate('observability.apm.slo.suggest.engine.apmAvailability', {
        defaultMessage:
          'span-derived request+fault observed for service="{service}". Non-fault ratio ≥ 99% is a sensible starting point.',
        values: { service },
      }),
      sourceMetric: 'request',
      detected,
      estimatedRuleCount: estimatedRules(1),
      input: {
        spec: buildSpec({
          datasourceId: input.datasourceId,
          name: `${service} — service availability`,
          description: `Auto-suggested from span-derived metrics for service="${service}".`,
          service,
          sliDefinition: {
            backend: 'prometheus',
            type: 'custom',
            calcMethod: 'events',
            customExpr: {
              mode: 'events',
              goodQuery: `sum(request{${serverSelector}}) - sum(fault{${serverSelector}})`,
              totalQuery: `sum(request{${serverSelector}})`,
            },
          },
          dimensions: [],
          objective: { name: `availability-99-${slug(service)}`, target: 0.99 },
        }),
      },
    });

    out.push({
      key: `apm-lat:${service}`,
      kindId: 'apm-latency',
      kind: KIND_LABEL['apm-latency'],
      reason: i18n.translate('observability.apm.slo.suggest.engine.apmLatency', {
        defaultMessage:
          'Draft targets ≥ 95% of requests under 500 ms for service="{service}" using span-derived latency_seconds_bucket.',
        values: { service },
      }),
      sourceMetric: 'latency_seconds_bucket',
      detected,
      estimatedRuleCount: estimatedRules(1),
      input: {
        spec: buildSpec({
          datasourceId: input.datasourceId,
          name: `${service} — service latency p95 < 500 ms`,
          description: `Auto-suggested from span-derived latency histogram for service="${service}".`,
          service,
          // latency_threshold (native) wraps each side of the ratio in
          // sum(rate(metric{...}[window])) per recording window, which the
          // custom-events code path can't do — it would substitute these
          // sums into `1 - (good / total)` raw, producing NaN when the
          // source metric is idle (`1 - (0 / 0)`) and a lifetime-average
          // burn rather than a windowed one when it isn't.
          sliDefinition: {
            backend: 'prometheus',
            type: 'latency_threshold',
            calcMethod: 'events',
            metric: 'latency_seconds_bucket',
            latencyThresholdUnit: 'seconds',
          },
          dimensions: [
            { name: 'service', value: service },
            { name: 'remoteService', value: '' },
            { name: 'namespace', value: 'span_derived' },
          ],
          objective: {
            name: `latency-95-${slug(service)}`,
            target: 0.95,
            latencyThreshold: 0.5,
          },
        }),
      },
    });
  }
}

// ============================================================================
// Detectors — OTel semconv (per-service rollup)
// ============================================================================

/**
 * Map a service name to the label selector that scopes OTel metrics to that
 * service. Prefers `service_name` when its value matches, then falls back to
 * the `job` label (Prometheus scrape label) trimmed via `jobToServiceName`.
 * Returns null if we can't find any match for the service in the metric's
 * label values — the detector skips the draft.
 */
function resolveOtelServiceSelector(
  service: string,
  values: MetricLabelValues | undefined
): { selector: string; dimension: { name: string; value: string } } | null {
  if (!values) return null;
  if (values.service_name?.includes(service)) {
    return {
      selector: `service_name="${service}"`,
      dimension: { name: 'service_name', value: service },
    };
  }
  // Fallback: pick the first job whose trimmed form matches the service.
  const matchingJob = values.job?.find((j) => jobToServiceName(j) === service);
  if (matchingJob) {
    return {
      selector: `job="${matchingJob}"`,
      dimension: { name: 'job', value: matchingJob },
    };
  }
  return null;
}

function httpDrafts(input: ServiceDiscoveryInput, out: Suggestion[]): void {
  const names = input.metricNames ?? [];
  const labels = input.labelValuesByMetric ?? {};
  const countMetric = 'http_server_request_duration_seconds_count';
  const bucketMetric = 'http_server_request_duration_seconds_bucket';
  const hasCount = names.includes(countMetric);
  const hasBucket = names.includes(bucketMetric);
  if (!hasCount && !hasBucket) return;

  for (const svc of input.services) {
    if (!svc.serviceName) continue;
    const service = svc.serviceName;
    const resolved =
      resolveOtelServiceSelector(service, labels[countMetric]) ??
      resolveOtelServiceSelector(service, labels[bucketMetric]);
    if (!resolved) continue;

    if (hasCount) {
      out.push({
        key: `http-avail:${service}`,
        kindId: 'http-availability',
        kind: KIND_LABEL['http-availability'],
        reason: i18n.translate('observability.apm.slo.suggest.engine.httpAvailability', {
          defaultMessage:
            'OTel {countMetric} observed for {labelName}="{labelValue}"; non-5xx responses ≥ 99% is a common default.',
          values: {
            countMetric,
            labelName: resolved.dimension.name,
            labelValue: resolved.dimension.value,
          },
        }),
        sourceMetric: countMetric,
        detected: { [resolved.dimension.name]: resolved.dimension.value },
        estimatedRuleCount: estimatedRules(1),
        input: {
          spec: buildSpec({
            datasourceId: input.datasourceId,
            name: `${service} — HTTP availability`,
            description: `Auto-suggested from ${countMetric} for ${resolved.dimension.name}="${resolved.dimension.value}".`,
            service,
            sliDefinition: {
              backend: 'prometheus',
              type: 'availability',
              calcMethod: 'events',
              metric: countMetric,
              goodEventsFilter: 'http_response_status_code!~"5.."',
            },
            dimensions: [resolved.dimension],
            objective: { name: `availability-99-${slug(service)}`, target: 0.99 },
          }),
        },
      });
    }

    if (hasBucket) {
      out.push({
        key: `http-lat:${service}`,
        kindId: 'http-latency',
        kind: KIND_LABEL['http-latency'],
        reason: i18n.translate('observability.apm.slo.suggest.engine.httpLatency', {
          defaultMessage:
            'OTel {bucketMetric} present; 95% of HTTP requests under 500 ms is a sensible default.',
          values: { bucketMetric },
        }),
        sourceMetric: bucketMetric,
        detected: { [resolved.dimension.name]: resolved.dimension.value },
        estimatedRuleCount: estimatedRules(1),
        input: {
          spec: buildSpec({
            datasourceId: input.datasourceId,
            name: `${service} — HTTP latency p95 < 500 ms`,
            description: `Auto-suggested from ${bucketMetric} for ${resolved.dimension.name}="${resolved.dimension.value}".`,
            service,
            sliDefinition: {
              backend: 'prometheus',
              type: 'latency_threshold',
              calcMethod: 'events',
              metric: bucketMetric,
              latencyThresholdUnit: 'seconds',
            },
            dimensions: [resolved.dimension],
            objective: {
              name: `p95-under-500ms-${slug(service)}`,
              target: 0.95,
              latencyThreshold: 0.5,
            },
          }),
        },
      });
    }
  }
}

function rpcDrafts(input: ServiceDiscoveryInput, out: Suggestion[]): void {
  const names = input.metricNames ?? [];
  const labels = input.labelValuesByMetric ?? {};
  const countMetric = 'rpc_server_duration_seconds_count';
  const bucketMetric = 'rpc_server_duration_seconds_bucket';
  const hasCount = names.includes(countMetric);
  const hasBucket = names.includes(bucketMetric);
  if (!hasCount && !hasBucket) return;

  // RPC scopes by `rpc_service` — but that's a *semantic* label on RPC calls,
  // not the Prom scrape job. We try to match by rpc_service first; if a
  // service is named the same in both the APM service list and the
  // rpc_service label set, it's the same thing.
  const rpcServices = new Set<string>([
    ...(labels[countMetric]?.rpc_service ?? []),
    ...(labels[bucketMetric]?.rpc_service ?? []),
  ]);
  if (rpcServices.size === 0) return;

  for (const svc of input.services) {
    if (!svc.serviceName) continue;
    const service = svc.serviceName;
    if (!rpcServices.has(service)) continue;
    const dimension = { name: 'rpc_service', value: service };

    if (hasCount) {
      out.push({
        key: `rpc-avail:${service}`,
        kindId: 'rpc-availability',
        kind: KIND_LABEL['rpc-availability'],
        reason: i18n.translate('observability.apm.slo.suggest.engine.rpcAvailability', {
          defaultMessage:
            'OTel {countMetric} observed for rpc_service="{service}"; non-error (gRPC 0 = OK) ≥ 99% is a common default.',
          values: { countMetric, service },
        }),
        sourceMetric: countMetric,
        detected: { rpc_service: service },
        estimatedRuleCount: estimatedRules(1),
        input: {
          spec: buildSpec({
            datasourceId: input.datasourceId,
            name: `${service} — RPC availability`,
            description: `Auto-suggested from ${countMetric} for rpc_service="${service}".`,
            service,
            sliDefinition: {
              backend: 'prometheus',
              type: 'availability',
              calcMethod: 'events',
              metric: countMetric,
              goodEventsFilter: 'rpc_grpc_status_code="0"',
            },
            dimensions: [dimension],
            objective: { name: `availability-99-${slug(service)}`, target: 0.99 },
          }),
        },
      });
    }

    if (hasBucket) {
      out.push({
        key: `rpc-lat:${service}`,
        kindId: 'rpc-latency',
        kind: KIND_LABEL['rpc-latency'],
        reason: i18n.translate('observability.apm.slo.suggest.engine.rpcLatency', {
          defaultMessage:
            'OTel {bucketMetric} present; 95% of RPC calls under 500 ms is a sensible default.',
          values: { bucketMetric },
        }),
        sourceMetric: bucketMetric,
        detected: { rpc_service: service },
        estimatedRuleCount: estimatedRules(1),
        input: {
          spec: buildSpec({
            datasourceId: input.datasourceId,
            name: `${service} — RPC latency p95 < 500 ms`,
            description: `Auto-suggested from ${bucketMetric} for rpc_service="${service}".`,
            service,
            sliDefinition: {
              backend: 'prometheus',
              type: 'latency_threshold',
              calcMethod: 'events',
              metric: bucketMetric,
              latencyThresholdUnit: 'seconds',
            },
            dimensions: [dimension],
            objective: {
              name: `p95-under-500ms-${slug(service)}`,
              target: 0.95,
              latencyThreshold: 0.5,
            },
          }),
        },
      });
    }
  }
}

function dbDrafts(input: ServiceDiscoveryInput, out: Suggestion[]): void {
  const names = input.metricNames ?? [];
  const labels = input.labelValuesByMetric ?? {};
  const bucketMetric = 'db_client_operation_duration_seconds_bucket';
  if (!names.includes(bucketMetric)) return;

  for (const svc of input.services) {
    if (!svc.serviceName) continue;
    const service = svc.serviceName;
    const resolved = resolveOtelServiceSelector(service, labels[bucketMetric]);
    if (!resolved) continue;

    out.push({
      key: `db-lat:${service}`,
      kindId: 'db-latency',
      kind: KIND_LABEL['db-latency'],
      reason: i18n.translate('observability.apm.slo.suggest.engine.dbLatency', {
        defaultMessage:
          'OTel {bucketMetric} present for {labelName}="{labelValue}"; 95% of DB calls under 100 ms is a sensible default.',
        values: {
          bucketMetric,
          labelName: resolved.dimension.name,
          labelValue: resolved.dimension.value,
        },
      }),
      sourceMetric: bucketMetric,
      detected: { [resolved.dimension.name]: resolved.dimension.value },
      estimatedRuleCount: estimatedRules(1),
      input: {
        spec: buildSpec({
          datasourceId: input.datasourceId,
          name: `${service} — DB client latency p95 < 100 ms`,
          description: `Auto-suggested from ${bucketMetric} for ${service}.`,
          service,
          sliDefinition: {
            backend: 'prometheus',
            type: 'latency_threshold',
            calcMethod: 'events',
            metric: bucketMetric,
            latencyThresholdUnit: 'seconds',
          },
          dimensions: [resolved.dimension],
          objective: {
            name: `p95-under-100ms-${slug(service)}`,
            target: 0.95,
            latencyThreshold: 0.1,
          },
        }),
      },
    });
  }
}

function messagingDrafts(input: ServiceDiscoveryInput, out: Suggestion[]): void {
  const names = input.metricNames ?? [];
  const labels = input.labelValuesByMetric ?? {};
  const bucketMetric = 'messaging_process_duration_seconds_bucket';
  if (!names.includes(bucketMetric)) return;

  for (const svc of input.services) {
    if (!svc.serviceName) continue;
    const service = svc.serviceName;
    const resolved = resolveOtelServiceSelector(service, labels[bucketMetric]);
    if (!resolved) continue;

    out.push({
      key: `msg-lat:${service}`,
      kindId: 'messaging-latency',
      kind: KIND_LABEL['messaging-latency'],
      reason: i18n.translate('observability.apm.slo.suggest.engine.messagingLatency', {
        defaultMessage:
          'OTel {bucketMetric} present for {labelName}="{labelValue}"; 95% of messages processed under 1 s is a sensible default.',
        values: {
          bucketMetric,
          labelName: resolved.dimension.name,
          labelValue: resolved.dimension.value,
        },
      }),
      sourceMetric: bucketMetric,
      detected: { [resolved.dimension.name]: resolved.dimension.value },
      estimatedRuleCount: estimatedRules(1),
      input: {
        spec: buildSpec({
          datasourceId: input.datasourceId,
          name: `${service} — messaging latency p95 < 1 s`,
          description: `Auto-suggested from ${bucketMetric} for ${service}.`,
          service,
          sliDefinition: {
            backend: 'prometheus',
            type: 'latency_threshold',
            calcMethod: 'events',
            metric: bucketMetric,
            latencyThresholdUnit: 'seconds',
          },
          dimensions: [resolved.dimension],
          objective: {
            name: `p95-under-1s-${slug(service)}`,
            target: 0.95,
            latencyThreshold: 1,
          },
        }),
      },
    });
  }
}

function genAiDrafts(input: ServiceDiscoveryInput, out: Suggestion[]): void {
  const names = input.metricNames ?? [];
  const labels = input.labelValuesByMetric ?? {};
  const countMetric = 'gen_ai_client_operation_duration_seconds_count';
  if (!names.includes(countMetric)) return;

  for (const svc of input.services) {
    if (!svc.serviceName) continue;
    const service = svc.serviceName;
    const resolved = resolveOtelServiceSelector(service, labels[countMetric]);
    if (!resolved) continue;

    out.push({
      key: `genai-avail:${service}`,
      kindId: 'genai-availability',
      kind: KIND_LABEL['genai-availability'],
      reason: i18n.translate('observability.apm.slo.suggest.engine.genaiAvailability', {
        defaultMessage:
          'OTel {countMetric} observed for {labelName}="{labelValue}". error_type="" is the convention for successful GenAI operations.',
        values: {
          countMetric,
          labelName: resolved.dimension.name,
          labelValue: resolved.dimension.value,
        },
      }),
      sourceMetric: countMetric,
      detected: { [resolved.dimension.name]: resolved.dimension.value },
      estimatedRuleCount: estimatedRules(1),
      input: {
        spec: buildSpec({
          datasourceId: input.datasourceId,
          name: `${service} — GenAI invocation availability`,
          description: `Auto-suggested from ${countMetric}.`,
          service,
          sliDefinition: {
            backend: 'prometheus',
            type: 'availability',
            calcMethod: 'events',
            metric: countMetric,
            goodEventsFilter: 'error_type=""',
          },
          dimensions: [resolved.dimension],
          objective: { name: `availability-99-${slug(service)}`, target: 0.99 },
        }),
      },
    });
  }
}

// ============================================================================
// Entry point
// ============================================================================

/**
 * Produce SLO drafts for each discovered APM service. APM detectors always
 * fire; OTel detectors fire only when their metric family is present in
 * `metricNames`. A single service may yield both APM and OTel drafts — they
 * target different underlying data and are not deduped.
 *
 * When `existingRuleGroups` is supplied, drafts whose (service, kind) is
 * already covered by a recording rule are returned with `existingRuleMatch`
 * set so the UI can de-select them by default.
 */
export function generateSuggestionsForServices(input: ServiceDiscoveryInput): Suggestion[] {
  const out: Suggestion[] = [];
  apmDrafts(input, out);
  httpDrafts(input, out);
  rpcDrafts(input, out);
  dbDrafts(input, out);
  messagingDrafts(input, out);
  genAiDrafts(input, out);
  attachExistingRuleMatches(out, input.existingRuleGroups);
  return out;
}

/**
 * Back-compat alias. Existing callers pass only `{ datasourceId, services }`
 * — equivalent to calling `generateSuggestionsForServices` with no metric
 * metadata, which disables the OTel detectors.
 */
export function generateSuggestionsFromServices(
  input: Pick<ServiceDiscoveryInput, 'datasourceId' | 'services'>
): Suggestion[] {
  return generateSuggestionsForServices(input);
}

/**
 * The metrics + labels the engine needs label-values for, given the metric
 * name universe. The page uses this to decide which
 * `/metadata/label-values/{label}?selector=<metric>` calls to issue.
 */
export function metricsToProbe(metricNames: string[]): Array<{ metric: string; labels: string[] }> {
  const has = (m: string) => metricNames.includes(m);
  const probes: Array<{ metric: string; labels: string[] }> = [];
  if (has('http_server_request_duration_seconds_count')) {
    probes.push({
      metric: 'http_server_request_duration_seconds_count',
      labels: ['service_name', 'job'],
    });
  }
  if (has('http_server_request_duration_seconds_bucket')) {
    probes.push({
      metric: 'http_server_request_duration_seconds_bucket',
      labels: ['service_name', 'job'],
    });
  }
  if (has('rpc_server_duration_seconds_count')) {
    probes.push({
      metric: 'rpc_server_duration_seconds_count',
      labels: ['rpc_service'],
    });
  }
  if (has('rpc_server_duration_seconds_bucket')) {
    probes.push({
      metric: 'rpc_server_duration_seconds_bucket',
      labels: ['rpc_service'],
    });
  }
  if (has('db_client_operation_duration_seconds_bucket')) {
    probes.push({
      metric: 'db_client_operation_duration_seconds_bucket',
      labels: ['service_name', 'job'],
    });
  }
  if (has('messaging_process_duration_seconds_bucket')) {
    probes.push({
      metric: 'messaging_process_duration_seconds_bucket',
      labels: ['service_name', 'job'],
    });
  }
  if (has('gen_ai_client_operation_duration_seconds_count')) {
    probes.push({
      metric: 'gen_ai_client_operation_duration_seconds_count',
      labels: ['service_name', 'job'],
    });
  }
  return probes;
}

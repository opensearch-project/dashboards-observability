/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLO templates — pre-configured partial SloSpec fragments used by the wizard
 * to pre-fill SLI shapes for common APM and OTel patterns.
 *
 * Template categories:
 *   - apm     : span-derived (Data Prepper) RED metrics. Always custom PromQL
 *               because span-derived samples are gauge-semantic and the default
 *               availability/latency_threshold generators wrap in rate().
 *   - otel    : OTel semconv metrics emitted directly by instrumented services
 *               (HTTP, RPC/gRPC, DB client, messaging, GenAI).
 *   - custom  : blank-slate custom PromQL.
 *
 * `detectMetricType()` infers the Prometheus metric type from metadata or the
 * Prometheus-standard suffix convention. Heuristics + plain-text fallback keep
 * the picker useful when the metadata API is unavailable.
 */

import { i18n } from '@osd/i18n';
import type { PrometheusSliType, SliCalcMethod } from './slo_types';
import type { PrometheusMetricMetadata } from '../types/alerting';

// ============================================================================
// Template interface
// ============================================================================

export type SloTemplateCategory = 'apm' | 'otel' | 'custom';

/**
 * Defaults for templates that pre-fill the custom PromQL editor. The wizard
 * substitutes the literal placeholder `${service}` with the form's current
 * service name at applyTemplate time.
 */
export type SloTemplateCustomDefaults =
  | { mode: 'events'; goodQuery: string; totalQuery: string }
  | { mode: 'raw'; errorRatioQuery: string };

/**
 * A template produces the Prometheus-SLI portion of `SloSpec` plus a few
 * wizard-side defaults (service/operation label name hints, default latency
 * threshold). The wizard is responsible for filling in `objectives`, `window`,
 * owner/tier, etc.
 */
export interface SloTemplate {
  id: string;
  name: string;
  description: string;
  /** OUI icon name for the card. */
  icon: string;
  /** Groups the template in the picker. */
  category: SloTemplateCategory;

  /** SLI body the template proposes. `metric` may be empty for custom. */
  sli: {
    type: PrometheusSliType;
    calcMethod: SliCalcMethod;
    metric?: string;
    goodEventsFilter?: string;
    latencyThresholdUnit?: 'seconds' | 'milliseconds';
  };

  /** Hints the wizard uses for the dimension pickers. */
  dimensionHints: { serviceLabel: string; operationLabel: string };

  /** Default latency bound (per-objective) in the unit above. */
  defaultLatencyThreshold?: number;

  /** Metric types the template expects when auto-detection runs. */
  expectedMetricType: 'counter' | 'histogram';

  /**
   * Metric-name regex for auto-detection. The `custom` catch-all and APM
   * templates (which don't target a single probe metric) use `null`.
   */
  detectionPattern: RegExp | null;

  /** Shown as an info callout in the wizard when the template is selected. */
  note?: string;

  /**
   * Pre-fill for the custom PromQL editor, used when `sli.type === 'custom'`.
   * `${service}` is substituted with the wizard's service state at apply time.
   */
  customPromqlDefaults?: SloTemplateCustomDefaults;
}

// ============================================================================
// Shared PromQL snippets for APM span-derived templates
// ============================================================================

/**
 * Span-derived metrics (Data Prepper) use `namespace="span_derived"` and
 * distinguish incoming (server) vs outgoing (client) spans via `remoteService`.
 * Server-side queries (what a service *receives*) filter `remoteService=""`.
 */
const SERVER_SELECTOR = 'service="${service}",remoteService="",namespace="span_derived"';
const DEPENDENCY_SELECTOR =
  'service="${service}",remoteService="${remoteService}",namespace="span_derived"';

/** APM latency histogram bucket bound (seconds). */
const APM_DEFAULT_LATENCY_SECONDS = 0.5;

function apmServiceAvailabilityDefaults(): SloTemplateCustomDefaults {
  return {
    mode: 'events',
    goodQuery: `sum(request{${SERVER_SELECTOR}}) - sum(fault{${SERVER_SELECTOR}})`,
    totalQuery: `sum(request{${SERVER_SELECTOR}})`,
  };
}

function apmServiceLatencyDefaults(): SloTemplateCustomDefaults {
  return {
    mode: 'events',
    goodQuery: `sum(latency_seconds_bucket{${SERVER_SELECTOR},le="${APM_DEFAULT_LATENCY_SECONDS}"})`,
    totalQuery: `sum(latency_seconds_bucket{${SERVER_SELECTOR},le="+Inf"})`,
  };
}

function apmDependencyAvailabilityDefaults(): SloTemplateCustomDefaults {
  return {
    mode: 'events',
    goodQuery: `sum(request{${DEPENDENCY_SELECTOR}}) - sum(fault{${DEPENDENCY_SELECTOR}})`,
    totalQuery: `sum(request{${DEPENDENCY_SELECTOR}})`,
  };
}

function apmDependencyLatencyDefaults(): SloTemplateCustomDefaults {
  return {
    mode: 'events',
    goodQuery: `sum(latency_seconds_bucket{${DEPENDENCY_SELECTOR},le="${APM_DEFAULT_LATENCY_SECONDS}"})`,
    totalQuery: `sum(latency_seconds_bucket{${DEPENDENCY_SELECTOR},le="+Inf"})`,
  };
}

// ============================================================================
// Built-in templates
// ============================================================================

export const SLO_TEMPLATES: readonly SloTemplate[] = [
  // --------------------------------------------------------------------------
  // APM span-derived templates (Data Prepper)
  // --------------------------------------------------------------------------
  {
    id: 'apm-service-availability',
    name: i18n.translate('observability.apm.slo.template.apmServiceAvailability.name', {
      defaultMessage: 'APM service availability',
    }),
    description: i18n.translate(
      'observability.apm.slo.template.apmServiceAvailability.description',
      {
        defaultMessage:
          'Non-fault request ratio for a service, computed from span-derived RED metrics (request/fault with namespace="span_derived"). Best for services emitting OTel traces through Data Prepper.',
      }
    ),
    icon: 'apmTrace',
    category: 'apm',
    sli: { type: 'custom', calcMethod: 'events' },
    dimensionHints: { serviceLabel: 'service', operationLabel: 'operation' },
    expectedMetricType: 'counter',
    detectionPattern: null,
    note: i18n.translate('observability.apm.slo.template.apmServiceAvailability.note', {
      defaultMessage:
        'Span-derived samples are gauge-style; all 7 MWMBR recording windows will record the same instantaneous ratio. Use attainment-breach alarms if burn-rate alerts are essential.',
    }),
    customPromqlDefaults: apmServiceAvailabilityDefaults(),
  },
  {
    id: 'apm-service-latency',
    name: i18n.translate('observability.apm.slo.template.apmServiceLatency.name', {
      defaultMessage: 'APM service latency',
    }),
    description: i18n.translate('observability.apm.slo.template.apmServiceLatency.description', {
      defaultMessage:
        "Fraction of a service's requests completing under a latency bound, from span-derived latency_seconds_bucket. Default bound 500 ms; edit the query to change it.",
    }),
    icon: 'clock',
    category: 'apm',
    sli: { type: 'custom', calcMethod: 'events' },
    dimensionHints: { serviceLabel: 'service', operationLabel: 'operation' },
    expectedMetricType: 'histogram',
    detectionPattern: null,
    note: i18n.translate('observability.apm.slo.template.apmServiceLatency.note', {
      defaultMessage:
        'Latency bound lives inside the PromQL `le` label value — update the query to change it (e.g. le="0.25" for 250 ms).',
    }),
    customPromqlDefaults: apmServiceLatencyDefaults(),
  },
  {
    id: 'apm-dependency-availability',
    name: i18n.translate('observability.apm.slo.template.apmDependencyAvailability.name', {
      defaultMessage: 'APM dependency availability',
    }),
    description: i18n.translate(
      'observability.apm.slo.template.apmDependencyAvailability.description',
      {
        defaultMessage:
          'Non-fault ratio for calls a service makes to a downstream dependency, from span-derived client-span metrics (remoteService="<target>").',
      }
    ),
    icon: 'graphApp',
    category: 'apm',
    sli: { type: 'custom', calcMethod: 'events' },
    dimensionHints: { serviceLabel: 'service', operationLabel: 'remoteOperation' },
    expectedMetricType: 'counter',
    detectionPattern: null,
    note: i18n.translate('observability.apm.slo.template.apmDependencyAvailability.note', {
      defaultMessage:
        'Fill in both `{servicePh}` (caller) and `{remoteServicePh}` (dependency) in the PromQL before submitting.',
      values: {
        servicePh: '${service}',
        remoteServicePh: '${remoteService}',
      },
    }),
    customPromqlDefaults: apmDependencyAvailabilityDefaults(),
  },
  {
    id: 'apm-dependency-latency',
    name: i18n.translate('observability.apm.slo.template.apmDependencyLatency.name', {
      defaultMessage: 'APM dependency latency',
    }),
    description: i18n.translate('observability.apm.slo.template.apmDependencyLatency.description', {
      defaultMessage:
        "Fraction of a service's calls to a downstream dependency under a latency bound, from span-derived client-span latency histograms.",
    }),
    icon: 'clock',
    category: 'apm',
    sli: { type: 'custom', calcMethod: 'events' },
    dimensionHints: { serviceLabel: 'service', operationLabel: 'remoteOperation' },
    expectedMetricType: 'histogram',
    detectionPattern: null,
    customPromqlDefaults: apmDependencyLatencyDefaults(),
  },

  // --------------------------------------------------------------------------
  // OTel semconv templates (post-1.23)
  // --------------------------------------------------------------------------
  {
    id: 'http-availability',
    name: i18n.translate('observability.apm.slo.template.httpAvailability.name', {
      defaultMessage: 'HTTP server availability',
    }),
    description: i18n.translate('observability.apm.slo.template.httpAvailability.description', {
      defaultMessage:
        'Ratio of non-5xx HTTP requests to total. Targets the OTel semconv v1.23+ metric http_server_request_duration_seconds_count with label http_response_status_code.',
    }),
    icon: 'globe',
    category: 'otel',
    sli: {
      type: 'availability',
      calcMethod: 'events',
      metric: 'http_server_request_duration_seconds_count',
      goodEventsFilter: 'http_response_status_code!~"5.."',
    },
    dimensionHints: { serviceLabel: 'service_name', operationLabel: 'http_route' },
    expectedMetricType: 'counter',
    detectionPattern: /^http_server_request_duration_seconds_(count|bucket|sum)$/,
  },
  {
    id: 'http-latency',
    name: i18n.translate('observability.apm.slo.template.httpLatency.name', {
      defaultMessage: 'HTTP server latency',
    }),
    description: i18n.translate('observability.apm.slo.template.httpLatency.description', {
      defaultMessage:
        'Fraction of HTTP requests completing under a latency bound. Reads http_server_request_duration_seconds_bucket (OTel semconv v1.23+).',
    }),
    icon: 'clock',
    category: 'otel',
    sli: {
      type: 'latency_threshold',
      calcMethod: 'events',
      metric: 'http_server_request_duration_seconds_bucket',
      latencyThresholdUnit: 'seconds',
    },
    dimensionHints: { serviceLabel: 'service_name', operationLabel: 'http_route' },
    defaultLatencyThreshold: 0.5,
    expectedMetricType: 'histogram',
    detectionPattern: /^http_server_request_duration_seconds_(bucket|count|sum)$/,
  },
  {
    id: 'rpc-availability',
    name: i18n.translate('observability.apm.slo.template.rpcAvailability.name', {
      defaultMessage: 'RPC / gRPC availability',
    }),
    description: i18n.translate('observability.apm.slo.template.rpcAvailability.description', {
      defaultMessage:
        'Non-error RPC call ratio. Targets rpc_server_duration_seconds_count (OTel semconv); good events = rpc_grpc_status_code="0" (OK).',
    }),
    icon: 'visBarVertical',
    category: 'otel',
    sli: {
      type: 'availability',
      calcMethod: 'events',
      metric: 'rpc_server_duration_seconds_count',
      goodEventsFilter: 'rpc_grpc_status_code="0"',
    },
    dimensionHints: { serviceLabel: 'rpc_service', operationLabel: 'rpc_method' },
    expectedMetricType: 'counter',
    detectionPattern: /^rpc_server_duration_seconds_(count|bucket|sum)$/,
  },
  {
    id: 'rpc-latency',
    name: i18n.translate('observability.apm.slo.template.rpcLatency.name', {
      defaultMessage: 'RPC / gRPC latency',
    }),
    description: i18n.translate('observability.apm.slo.template.rpcLatency.description', {
      defaultMessage:
        'Fraction of RPC calls under a latency bound. Reads rpc_server_duration_seconds_bucket.',
    }),
    icon: 'clock',
    category: 'otel',
    sli: {
      type: 'latency_threshold',
      calcMethod: 'events',
      metric: 'rpc_server_duration_seconds_bucket',
      latencyThresholdUnit: 'seconds',
    },
    dimensionHints: { serviceLabel: 'rpc_service', operationLabel: 'rpc_method' },
    defaultLatencyThreshold: 0.5,
    expectedMetricType: 'histogram',
    detectionPattern: /^rpc_server_duration_seconds_(bucket|count|sum)$/,
  },
  {
    id: 'db-client-latency',
    name: i18n.translate('observability.apm.slo.template.dbClientLatency.name', {
      defaultMessage: 'Database client latency',
    }),
    description: i18n.translate('observability.apm.slo.template.dbClientLatency.description', {
      defaultMessage:
        'Fraction of outgoing DB client calls under a latency bound. Reads db_client_operation_duration_seconds_bucket (OTel database semconv).',
    }),
    icon: 'database',
    category: 'otel',
    sli: {
      type: 'latency_threshold',
      calcMethod: 'events',
      metric: 'db_client_operation_duration_seconds_bucket',
      latencyThresholdUnit: 'seconds',
    },
    dimensionHints: { serviceLabel: 'service_name', operationLabel: 'db_system' },
    defaultLatencyThreshold: 0.1,
    expectedMetricType: 'histogram',
    detectionPattern: /^db_client_operation_duration_seconds_(bucket|count|sum)$/,
  },
  {
    id: 'messaging-latency',
    name: i18n.translate('observability.apm.slo.template.messagingLatency.name', {
      defaultMessage: 'Messaging processing latency',
    }),
    description: i18n.translate('observability.apm.slo.template.messagingLatency.description', {
      defaultMessage:
        'Fraction of messaging-consumer processing under a latency bound. Reads messaging_process_duration_seconds_bucket (OTel messaging semconv).',
    }),
    icon: 'email',
    category: 'otel',
    sli: {
      type: 'latency_threshold',
      calcMethod: 'events',
      metric: 'messaging_process_duration_seconds_bucket',
      latencyThresholdUnit: 'seconds',
    },
    dimensionHints: { serviceLabel: 'service_name', operationLabel: 'messaging_destination_name' },
    defaultLatencyThreshold: 1,
    expectedMetricType: 'histogram',
    detectionPattern: /^messaging_process_duration_seconds_(bucket|count|sum)$/,
  },
  {
    id: 'genai-availability',
    name: i18n.translate('observability.apm.slo.template.genaiAvailability.name', {
      defaultMessage: 'GenAI invocation availability',
    }),
    description: i18n.translate('observability.apm.slo.template.genaiAvailability.description', {
      defaultMessage:
        'Ratio of successful GenAI invocations. Reads gen_ai_client_operation_duration_seconds_count; good events have error_type="".',
    }),
    icon: 'inspect',
    category: 'otel',
    sli: {
      type: 'availability',
      calcMethod: 'events',
      metric: 'gen_ai_client_operation_duration_seconds_count',
      goodEventsFilter: 'error_type=""',
    },
    dimensionHints: { serviceLabel: 'service_name', operationLabel: 'gen_ai_operation_name' },
    expectedMetricType: 'counter',
    detectionPattern: /^gen_ai_client_operation_duration_seconds_(count|bucket|sum)$/,
  },

  // --------------------------------------------------------------------------
  // Escape hatch
  // --------------------------------------------------------------------------
  {
    id: 'custom',
    name: i18n.translate('observability.apm.slo.template.custom.name', {
      defaultMessage: 'Custom PromQL',
    }),
    description: i18n.translate('observability.apm.slo.template.custom.description', {
      defaultMessage:
        'Start from a blank slate. Supply your own PromQL — either good + total queries, or a single pre-computed error-ratio query.',
    }),
    icon: 'wrench',
    category: 'custom',
    sli: { type: 'custom', calcMethod: 'events' },
    dimensionHints: { serviceLabel: 'service', operationLabel: 'endpoint' },
    expectedMetricType: 'counter',
    detectionPattern: null,
  },
] as const;

// ============================================================================
// Metric type detection
// ============================================================================

export type InferredMetricType = 'counter' | 'histogram' | 'gauge' | 'summary' | 'unknown';

export interface MetricDetectionResult {
  type: InferredMetricType;
  suggestedSliType: PrometheusSliType;
  suggestedTemplate: SloTemplate | null;
}

/**
 * Detect a metric's type and suggest a matching template.
 *
 *  1. Prefer metadata from `/api/v1/metadata`
 *  2. Fall back to Prometheus naming suffix heuristics (_total, _bucket, ...)
 *  3. Regex-match the metric name against each template's detectionPattern.
 *     Templates without a detection pattern (APM, custom) are never auto-picked.
 */
export function detectMetricType(
  metricName: string,
  metadata?: PrometheusMetricMetadata
): MetricDetectionResult {
  let type: InferredMetricType = 'unknown';
  if (metadata?.type && metadata.type !== 'unknown') {
    type = metadata.type;
  } else {
    type = inferTypeFromSuffix(metricName);
  }
  const suggestedSliType: PrometheusSliType =
    type === 'histogram' ? 'latency_threshold' : 'availability';
  return {
    type,
    suggestedSliType,
    suggestedTemplate: findMatchingTemplate(metricName),
  };
}

function inferTypeFromSuffix(metricName: string): InferredMetricType {
  if (metricName.endsWith('_total')) return 'counter';
  if (metricName.endsWith('_bucket')) return 'histogram';
  if (metricName.endsWith('_count')) return 'histogram';
  if (metricName.endsWith('_sum')) return 'histogram';
  if (metricName.endsWith('_gauge')) return 'gauge';
  return 'unknown';
}

function findMatchingTemplate(metricName: string): SloTemplate | null {
  for (const t of SLO_TEMPLATES) {
    if (!t.detectionPattern) continue;
    if (t.detectionPattern.test(metricName)) return t;
  }
  return null;
}

// ============================================================================
// Custom-PromQL placeholder substitution
// ============================================================================

/**
 * Substitute `${service}`, `${remoteService}`, and `${environment}` placeholders
 * in a template's customPromqlDefaults. Empty/undefined values are left as the
 * literal placeholder so the user can spot what still needs filling in.
 */
export function substituteCustomPromqlDefaults(
  defaults: SloTemplateCustomDefaults,
  vars: { service?: string; remoteService?: string; environment?: string }
): SloTemplateCustomDefaults {
  const replace = (s: string) =>
    s
      .replace(/\$\{service\}/g, vars.service || '${service}')
      .replace(/\$\{remoteService\}/g, vars.remoteService || '${remoteService}')
      .replace(/\$\{environment\}/g, vars.environment || '${environment}');
  if (defaults.mode === 'events') {
    return {
      mode: 'events',
      goodQuery: replace(defaults.goodQuery),
      totalQuery: replace(defaults.totalQuery),
    };
  }
  return { mode: 'raw', errorRatioQuery: replace(defaults.errorRatioQuery) };
}

// ============================================================================
// Good-events filter presets — wizard dropdown content
// ============================================================================

export interface GoodEventsFilterPreset {
  label: string;
  value: string;
  description?: string;
}

export const GOOD_EVENTS_FILTER_PRESETS: readonly GoodEventsFilterPreset[] = [
  {
    label: 'HTTP success (non-5xx)',
    value: 'http_response_status_code!~"5.."',
    description: 'Counts every non-5xx response as good — 4xx requests are counted as good too.',
  },
  {
    label: 'HTTP 2xx only',
    value: 'http_response_status_code=~"2.."',
    description: 'Only 2xx responses are good. Stricter — redirects and 4xx count as bad.',
  },
  {
    label: 'RPC OK (gRPC)',
    value: 'rpc_grpc_status_code="0"',
    description: 'Only gRPC OK (status 0) is good. All other codes are bad.',
  },
  {
    label: 'GenAI success',
    value: 'error_type=""',
    description: 'Counts invocations with no OTel error_type as good.',
  },
] as const;

// ============================================================================
// Error-budget display
// ============================================================================

export interface ErrorBudgetDisplay {
  /** Error budget in seconds. */
  raw: number;
  /** Formatted e.g. "Error budget: 43.2 minutes/month". */
  formatted: string;
}

/** Parse "7d" / "30d" / "1h" / ... to milliseconds. */
function durationToMs(duration: string): number {
  const m = duration.match(/^(\d+)(s|m|h|d|w)$/);
  if (!m) return 0;
  const v = parseInt(m[1], 10);
  const mul = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[m[2]] ?? 0;
  return v * mul;
}

export function formatErrorBudget(target: number, windowDuration: string): ErrorBudgetDisplay {
  const windowSec = durationToMs(windowDuration) / 1000;
  const raw = (1 - target) * windowSec;
  return { raw, formatted: `Error budget: ${prettyBudget(raw, windowDuration)}` };
}

function prettyBudget(budgetSeconds: number, windowDuration: string): string {
  const label = windowLabel(windowDuration);
  let value: number;
  let unit: string;
  if (budgetSeconds < 120) {
    value = budgetSeconds;
    unit = 'seconds';
  } else if (budgetSeconds < 5400) {
    value = budgetSeconds / 60;
    unit = 'minutes';
  } else {
    value = budgetSeconds / 3600;
    unit = 'hours';
  }
  return `${formatNumber(value)} ${unit}/${label}`;
}

function windowLabel(windowDuration: string): string {
  switch (windowDuration) {
    case '1d':
      return 'day';
    case '7d':
      return 'week';
    case '28d':
    case '30d':
      return 'month';
    default:
      return windowDuration;
  }
}

function formatNumber(value: number): string {
  if (value === 0) return '0';
  if (value >= 100) return value.toFixed(1).replace(/\.0$/, '');
  return parseFloat(value.toPrecision(3)).toString();
}

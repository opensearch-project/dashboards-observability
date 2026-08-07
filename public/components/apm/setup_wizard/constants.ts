/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Index naming conventions and field requirements for the APM setup wizard.
 *
 * The wizard requires BOTH the naming convention AND validation that the
 * required fields exist before it will claim a match or offer to auto-create a
 * dataset. Values here were confirmed against a live OpenTelemetry demo cluster
 * (indices otel-v1-apm-span-*, logs-otel-v1-*, otel-v2-apm-service-map-*) and
 * the working DataViews on the datasets page.
 */

/** Traces: OpenTelemetry span index pattern (Data Prepper otel-v1). */
export const APM_TRACES_INDEX_PATTERN = 'otel-v1-apm-span*';
/** Fields that must exist for a span index to qualify as traces. */
export const APM_TRACES_REQUIRED_FIELDS = ['traceId', 'spanId', 'serviceName'] as const;
/**
 * Preferred trace time field. The working DataView uses `endTime`; `startTime`
 * is an accepted fallback (both are date_nanos). Order matters — highest first.
 */
export const APM_TRACES_TIME_FIELD_CANDIDATES = ['endTime', 'startTime'] as const;

/** Logs: OpenTelemetry log index pattern (correlated with traces). */
export const APM_LOGS_INDEX_PATTERN = 'logs-otel-v1*';
/** Fields that must exist for a log index to qualify as correlatable logs. */
export const APM_LOGS_REQUIRED_FIELDS = ['traceId', 'spanId', 'time'] as const;
/** Log time field (matches the working DataView). */
export const APM_LOGS_TIME_FIELD = 'time';
/**
 * schemaMappings written on the correlated-logs DataView, matching the working
 * example exactly. Used by the runtime log-correlation queries.
 */
export const APM_LOGS_SCHEMA_MAPPINGS = {
  otelLogs: {
    timestamp: 'time',
    traceId: 'traceId',
    spanId: 'spanId',
    serviceName: 'resource.attributes.service.name',
  },
} as const;

/** Service map: newer v2 convention (nested source/target node schema). */
export const APM_SERVICE_MAP_INDEX_PATTERN = 'otel-v2-apm-service-map*';
/** Fields that must exist for a v2 service-map index to qualify. */
export const APM_SERVICE_MAP_REQUIRED_FIELDS = [
  'sourceNode',
  'targetNode',
  'sourceOperation',
  'targetOperation',
  'nodeConnectionHash',
  'timestamp',
] as const;
/** Service-map time field. The v2 DataView has no signalType / schemaMappings. */
export const APM_SERVICE_MAP_TIME_FIELD = 'timestamp';

/**
 * RED metrics (Rate / Errors / Duration) the wizard checks for on a direct-query
 * Prometheus data source. These are the span-derived metrics emitted by Data
 * Prepper (confirmed present on the live source). A data source must expose all
 * of these to be offered as a RED-metrics source. The wizard never creates a
 * Prometheus data source — it only detects and reuses existing ones.
 */
export const APM_RED_REQUIRED_METRICS = ['request', 'fault', 'latency_seconds_bucket'] as const;

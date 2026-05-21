/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PromQL builders for the suggest page's live-data hover. Each builder takes
 * a draft `Suggestion` plus a window choice and returns the
 * `[ratioQuery, samplesQuery, p99Query]` triple the page renders inline. The
 * functions are pure — no React hooks, no module state — so they live next to
 * the page rather than inside it.
 */

import type { Suggestion, SuggestionKind } from './suggest_engine';

export type WindowOption = '1h' | '24h' | '7d';

/**
 * A deliberately no-op query — Prometheus returns no samples, `extractScalar`
 * produces `undefined`, and the UI treats the slot as missing. Used when a
 * builder doesn't have a sensible ratio or p99 to report for the kind.
 */
export const LIVE_NO_EMIT = 'vector(0) unless vector(1)';

export function liveKindFor(s: Suggestion): SuggestionKind | null {
  return s.kindId;
}

export function buildLiveQueries(
  kind: SuggestionKind,
  suggestion: Suggestion,
  win: WindowOption
): [string, string, string] {
  switch (kind) {
    case 'apm-availability':
      return buildApmAvailabilityQueries(suggestion.input.spec.service, win);
    case 'apm-latency':
      return buildApmLatencyQueries(suggestion.input.spec.service, win);
    case 'http-availability':
      return buildHttpAvailabilityQueries(suggestion, win);
    case 'http-latency':
      return buildHttpLatencyQueries(suggestion, win);
    case 'rpc-availability':
      return buildRpcAvailabilityQueries(suggestion.input.spec.service, win);
    case 'rpc-latency':
      return buildRpcLatencyQueries(suggestion.input.spec.service, win);
    case 'db-latency':
      return buildDbLatencyQueries(suggestion, win);
    case 'messaging-latency':
      return buildMessagingLatencyQueries(suggestion, win);
    case 'genai-availability':
      return buildGenAiAvailabilityQueries(suggestion, win);
  }
}

// --- APM span-derived (gauges) ---

function buildApmAvailabilityQueries(service: string, win: WindowOption): [string, string, string] {
  const selector = `service="${service}",remoteService="",namespace="span_derived"`;
  const ratio =
    `(sum(sum_over_time(request{${selector}}[${win}])) - sum(sum_over_time(fault{${selector}}[${win}]))) ` +
    `/ sum(sum_over_time(request{${selector}}[${win}]))`;
  const samples = `sum(sum_over_time(request{${selector}}[${win}]))`;
  const p99 = `histogram_quantile(0.99, sum by (le)(sum_over_time(latency_seconds_bucket{${selector}}[${win}]))) * 1000`;
  return [ratio, samples, p99];
}

function buildApmLatencyQueries(service: string, win: WindowOption): [string, string, string] {
  // Data Prepper's span-derived histogram buckets are NOT cumulative — each
  // `le` series reports observations in the bucket range, not "≤ le". The raw
  // bucket-based fraction-under-threshold SLI is unreliable here, so we only
  // emit observed p99; the UI compares it against the template's bound.
  const selector = `service="${service}",remoteService="",namespace="span_derived"`;
  const p99 = `histogram_quantile(0.99, sum by (le)(sum_over_time(latency_seconds_bucket{${selector}}[${win}]))) * 1000`;
  const samples = `sum(sum_over_time(latency_seconds_count{${selector}}[${win}]))`;
  return [LIVE_NO_EMIT, samples, p99];
}

// --- OTel HTTP server (true counters) ---

/**
 * Rebuild the OTel service selector from the dimension the engine stamped on
 * the draft. Returns the raw PromQL fragment, e.g. `service_name="checkout"`
 * or `job="opentelemetry-demo/checkout"`.
 */
function otelDimensionSelector(suggestion: Suggestion): string {
  const dims =
    suggestion.input.spec.sli.type === 'single' ? suggestion.input.spec.sli.dimensions : [];
  const parts = dims.filter((d) => d.value).map((d) => `${d.name}="${d.value}"`);
  // Fallback: scope to the spec's service field via `service_name`. Better to
  // over-match than to emit an unscoped aggregate.
  if (parts.length === 0 && suggestion.input.spec.service) {
    parts.push(`service_name="${suggestion.input.spec.service}"`);
  }
  return parts.join(',');
}

function buildHttpAvailabilityQueries(
  suggestion: Suggestion,
  win: WindowOption
): [string, string, string] {
  const metric = 'http_server_request_duration_seconds_count';
  const bucketMetric = 'http_server_request_duration_seconds_bucket';
  const selector = otelDimensionSelector(suggestion);
  const ratio =
    `sum(rate(${metric}{${selector},http_response_status_code!~"5.."}[${win}])) ` +
    `/ sum(rate(${metric}{${selector}}[${win}]))`;
  const samples = `sum(increase(${metric}{${selector}}[${win}]))`;
  const p99 = `histogram_quantile(0.99, sum by (le)(rate(${bucketMetric}{${selector}}[${win}]))) * 1000`;
  return [ratio, samples, p99];
}

function buildHttpLatencyQueries(
  suggestion: Suggestion,
  win: WindowOption
): [string, string, string] {
  const metric = 'http_server_request_duration_seconds_bucket';
  const countMetric = 'http_server_request_duration_seconds_count';
  const selector = otelDimensionSelector(suggestion);
  const p99 = `histogram_quantile(0.99, sum by (le)(rate(${metric}{${selector}}[${win}]))) * 1000`;
  const samples = `sum(increase(${countMetric}{${selector}}[${win}]))`;
  // OTel histograms ARE cumulative so a bucket-ratio is actually sound, but
  // the UI already handles latency via p99-vs-bound comparison. Keep ratio
  // no-emit for symmetry with APM latency.
  return [LIVE_NO_EMIT, samples, p99];
}

// --- OTel RPC (true counters) ---

function buildRpcAvailabilityQueries(
  rpcService: string,
  win: WindowOption
): [string, string, string] {
  const metric = 'rpc_server_duration_seconds_count';
  const bucketMetric = 'rpc_server_duration_seconds_bucket';
  const selector = `rpc_service="${rpcService}"`;
  const ratio =
    `sum(rate(${metric}{${selector},rpc_grpc_status_code="0"}[${win}])) ` +
    `/ sum(rate(${metric}{${selector}}[${win}]))`;
  const samples = `sum(increase(${metric}{${selector}}[${win}]))`;
  const p99 = `histogram_quantile(0.99, sum by (le)(rate(${bucketMetric}{${selector}}[${win}]))) * 1000`;
  return [ratio, samples, p99];
}

function buildRpcLatencyQueries(rpcService: string, win: WindowOption): [string, string, string] {
  const metric = 'rpc_server_duration_seconds_bucket';
  const countMetric = 'rpc_server_duration_seconds_count';
  const selector = `rpc_service="${rpcService}"`;
  const p99 = `histogram_quantile(0.99, sum by (le)(rate(${metric}{${selector}}[${win}]))) * 1000`;
  const samples = `sum(increase(${countMetric}{${selector}}[${win}]))`;
  return [LIVE_NO_EMIT, samples, p99];
}

// --- OTel DB / messaging / GenAI ---

function buildDbLatencyQueries(
  suggestion: Suggestion,
  win: WindowOption
): [string, string, string] {
  const metric = 'db_client_operation_duration_seconds_bucket';
  const countMetric = 'db_client_operation_duration_seconds_count';
  const selector = otelDimensionSelector(suggestion);
  const p99 = `histogram_quantile(0.99, sum by (le)(rate(${metric}{${selector}}[${win}]))) * 1000`;
  const samples = `sum(increase(${countMetric}{${selector}}[${win}]))`;
  return [LIVE_NO_EMIT, samples, p99];
}

function buildMessagingLatencyQueries(
  suggestion: Suggestion,
  win: WindowOption
): [string, string, string] {
  const metric = 'messaging_process_duration_seconds_bucket';
  const countMetric = 'messaging_process_duration_seconds_count';
  const selector = otelDimensionSelector(suggestion);
  const p99 = `histogram_quantile(0.99, sum by (le)(rate(${metric}{${selector}}[${win}]))) * 1000`;
  const samples = `sum(increase(${countMetric}{${selector}}[${win}]))`;
  return [LIVE_NO_EMIT, samples, p99];
}

function buildGenAiAvailabilityQueries(
  suggestion: Suggestion,
  win: WindowOption
): [string, string, string] {
  const metric = 'gen_ai_client_operation_duration_seconds_count';
  const bucketMetric = 'gen_ai_client_operation_duration_seconds_bucket';
  const selector = otelDimensionSelector(suggestion);
  const ratio =
    `sum(rate(${metric}{${selector},error_type=""}[${win}])) ` +
    `/ sum(rate(${metric}{${selector}}[${win}]))`;
  const samples = `sum(increase(${metric}{${selector}}[${win}]))`;
  // GenAI instrumentation often omits the bucket — emit the query anyway; if
  // the metric isn't present Cortex returns no samples and the UI shows "—".
  const p99 = `histogram_quantile(0.99, sum by (le)(rate(${bucketMetric}{${selector}}[${win}]))) * 1000`;
  return [ratio, samples, p99];
}

/**
 * PromQL instant query response unwrap. The query-enhancements response shape
 * is either a data-frame (`{ fields: [...] }`) or a Prometheus-native result
 * (`{ result: [{ value: [t, v] }] }`); both shapes surface scalar values.
 */
export function extractScalar(resp: unknown): number | undefined {
  if (!resp || typeof resp !== 'object') return undefined;
  const r = resp as {
    fields?: Array<{ name: string; values: unknown[] }>;
    data?: { result?: Array<{ value?: [number, string] }> };
    result?: Array<{ value?: [number, string] }>;
    meta?: { instantData?: { rows?: Array<{ Value?: string | number }> } };
  };
  // Data-frame shape (query-enhancements default).
  const valueField = r.fields?.find((f) => f.name === 'Value');
  if (valueField && Array.isArray(valueField.values) && valueField.values.length > 0) {
    const raw = valueField.values[0];
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  // Prometheus-native instant query shape.
  const vec = r.data?.result ?? r.result;
  if (Array.isArray(vec) && vec.length > 0 && Array.isArray(vec[0].value)) {
    const n = Number(vec[0].value[1]);
    return Number.isFinite(n) ? n : undefined;
  }
  // Query-enhancements instant-data fallback.
  const rows = r.meta?.instantData?.rows;
  if (Array.isArray(rows) && rows.length > 0) {
    const n = Number(rows[0].Value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function formatSamples(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return Math.round(n).toString();
}

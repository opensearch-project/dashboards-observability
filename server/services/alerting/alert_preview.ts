/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alert preview helpers — build condition-preview time-series for the rule
 * detail flyout. Split out from `alert_service.ts` as standalone functions
 * (no `this`) that take the backends + client + datasource as parameters.
 *
 * Contents:
 *   - `fetchOSPreviewTimeSeries` — dispatches to cluster-metrics / doc-level / search-based previews
 *   - `fetchClusterMetricsPreview` — synthetic time series from a cluster-metrics snapshot
 *   - `fetchDocLevelPreview` — date_histogram over doc-level monitor indices
 *   - `extractDateHistogramPoints` — pull `{timestamp, value}` points from an agg response
 *   - `fetchPromPreviewData` — queryRange (preferred) or fallback to embedded alert data
 */
import type {
  RequestHandlerContext,
  OpenSearchDashboardsRequest,
} from '../../../../../src/core/server';
import {
  AlertingOSClient,
  Datasource,
  OpenSearchBackend,
  OSMonitor,
  PromAlertingRule,
  PrometheusBackend,
} from '../../../common/types/alerting';
import {
  extractClusterMetricValue,
  extractTimestampField,
  stripRangeFilters,
  substituteMustacheTemplates,
} from './alert_utils';

/**
 * Fetch a time-series for the monitor's query by wrapping it in a date_histogram.
 * This gives us bucketed data points for the condition preview chart.
 * Supports all monitor types: query_level, bucket_level, cluster_metrics, and doc_level.
 */
export async function fetchOSPreviewTimeSeries(
  osBackend: OpenSearchBackend,
  client: AlertingOSClient,
  ds: Datasource,
  monitor: OSMonitor
): Promise<Array<{ timestamp: number; value: number }>> {
  const input = monitor.inputs[0];
  if (!input) return [];

  // --- Cluster metrics monitors (uri input) ---
  if ('uri' in input) {
    return fetchClusterMetricsPreview(osBackend, client, ds, monitor);
  }

  // --- Doc-level monitors ---
  if ('doc_level_input' in input) {
    return fetchDocLevelPreview(osBackend, client, ds, input);
  }

  // --- Query-level and bucket-level monitors (search input) ---
  if (!('search' in input)) return [];

  const indices = input.search.indices;
  if (!indices || indices.length === 0) return [];

  const originalQuery = input.search.query;
  if (!originalQuery || typeof originalQuery !== 'object') return [];

  // Detect the timestamp field from the original query's range filter
  const timestampField = extractTimestampField(originalQuery) || '@timestamp';

  // Extract the user's query, strip Mustache templates and the monitor's own range filter
  // (the monitor's range is typically narrow like 5m; we want 1h for the chart)
  const userQuery = (originalQuery as Record<string, unknown>).query || { match_all: {} };
  const cleanedQuery = substituteMustacheTemplates(userQuery);
  const strippedQuery = stripRangeFilters(cleanedQuery, timestampField);

  // Build a date_histogram query with our own 1-hour range
  const now = Date.now();
  const oneHourAgo = now - 3600_000;
  const intervalMinutes = 5;

  // Use ISO timestamps to support both date and date_nanos fields
  const nowIso = new Date(now).toISOString();
  const oneHourAgoIso = new Date(oneHourAgo).toISOString();

  const histogramBody: Record<string, unknown> = {
    size: 0,
    query: {
      bool: {
        // Use 'filter' context for caching (no scoring needed for preview)
        filter: [
          strippedQuery,
          {
            range: {
              [timestampField]: {
                gte: oneHourAgoIso,
                lte: nowIso,
              },
            },
          },
        ],
      },
    },
    aggs: {
      time_buckets: {
        date_histogram: {
          field: timestampField,
          fixed_interval: `${intervalMinutes}m`,
          min_doc_count: 0,
          extended_bounds: {
            min: oneHourAgo,
            max: now,
          },
        },
      },
    },
  };

  const result = await osBackend.searchQuery(client, indices, histogramBody);
  return extractDateHistogramPoints(result);
}

/**
 * Generate preview data for cluster_metrics monitors.
 * These use `uri` input and return a snapshot (not a time series), so we
 * extract a meaningful numeric value and generate synthetic time-series points.
 */
export async function fetchClusterMetricsPreview(
  osBackend: OpenSearchBackend,
  client: AlertingOSClient,
  _ds: Datasource,
  monitor: OSMonitor
): Promise<Array<{ timestamp: number; value: number }>> {
  // Dry-run the monitor to get the current API result
  let execResult: unknown;
  try {
    execResult = await osBackend.runMonitor(client, monitor.id, true);
  } catch {
    return [];
  }
  if (!execResult || typeof execResult !== 'object') return [];

  // Extract a numeric value from the execution result
  const numericValue = extractClusterMetricValue(execResult);

  // Generate 12 synthetic data points over the last hour using the snapshot value
  const now = Date.now();
  const points: Array<{ timestamp: number; value: number }> = [];
  const bucketCount = 12;
  const bucketIntervalMs = 5 * 60_000;

  for (let i = 0; i < bucketCount; i++) {
    const timestamp = now - (bucketCount - 1 - i) * bucketIntervalMs;
    // Add slight variation to make the chart readable (snapshot is a point-in-time)
    const jitter = numericValue * 0.02 * (Math.random() - 0.5);
    points.push({
      timestamp,
      value: Math.max(0, numericValue + jitter),
    });
  }

  return points;
}

/**
 * Generate preview data for doc_level monitors.
 * These use `doc_level_input` with indices and queries. We run a date_histogram
 * on the target indices similar to query-level monitors.
 */
export async function fetchDocLevelPreview(
  osBackend: OpenSearchBackend,
  client: AlertingOSClient,
  _ds: Datasource,
  input: {
    doc_level_input: {
      description: string;
      indices: string[];
      queries: Array<{ id: string; name: string; query: string; tags: string[] }>;
    };
  }
): Promise<Array<{ timestamp: number; value: number }>> {
  const indices = input.doc_level_input.indices;
  if (!indices || indices.length === 0) return [];

  // Use @timestamp as the default field for doc-level monitors
  const timestampField = '@timestamp';
  const now = Date.now();
  const oneHourAgo = now - 3600_000;
  const intervalMinutes = 5;

  // Build a simple date_histogram — doc-level queries match individual docs,
  // so we count matching docs per time bucket
  const nowIso = new Date(now).toISOString();
  const oneHourAgoIso = new Date(oneHourAgo).toISOString();
  const histogramBody: Record<string, unknown> = {
    size: 0,
    query: {
      bool: {
        filter: [
          {
            range: {
              [timestampField]: {
                gte: oneHourAgoIso,
                lte: nowIso,
              },
            },
          },
        ],
      },
    },
    aggs: {
      time_buckets: {
        date_histogram: {
          field: timestampField,
          fixed_interval: `${intervalMinutes}m`,
          min_doc_count: 0,
          extended_bounds: {
            min: oneHourAgo,
            max: now,
          },
        },
      },
    },
  };

  const result = await osBackend.searchQuery(client, indices, histogramBody);
  return extractDateHistogramPoints(result);
}

/**
 * Extract time-series data points from a date_histogram aggregation response.
 */
export function extractDateHistogramPoints(
  result: unknown
): Array<{ timestamp: number; value: number }> {
  const points: Array<{ timestamp: number; value: number }> = [];
  if (!result || typeof result !== 'object') return points;

  const res = result as Record<string, unknown>;
  const aggs = res.aggregations as Record<string, unknown> | undefined;
  if (!aggs) return points;

  const timeBuckets = aggs.time_buckets as Record<string, unknown> | undefined;
  if (!timeBuckets) return points;

  const buckets = timeBuckets.buckets as Array<Record<string, unknown>> | undefined;
  if (!buckets || !Array.isArray(buckets)) return points;

  for (const bucket of buckets) {
    const key = bucket.key as number;
    const docCount = bucket.doc_count as number;
    if (typeof key === 'number' && typeof docCount === 'number') {
      points.push({ timestamp: key, value: docCount });
    }
  }

  return points;
}

/**
 * Fetch condition preview data for Prometheus rules.
 *
 * Routes the range query through the data plugin's search service
 * (`strategy: 'PROMQL'`) — same path as the rest of the PromQL surface in
 * this plugin. When the request context is missing (e.g. legacy callers
 * not yet plumbed) or the strategy throws, falls back to extracting
 * evaluation data from `rule.alerts[].value`.
 */
export async function fetchPromPreviewData(
  promBackend: PrometheusBackend | undefined,
  ctx: RequestHandlerContext | undefined,
  ds: Datasource,
  query: string,
  rule: PromAlertingRule,
  sourceRequest?: OpenSearchDashboardsRequest
): Promise<Array<{ timestamp: number; value: number }>> {
  if (promBackend?.queryRange && ctx) {
    try {
      const metricQuery = query.replace(/\s*(>|<|>=|<=|==|!=)\s*[\d.]+\s*$/, '').trim();
      const now = Math.floor(Date.now() / 1000);
      const oneHourAgo = now - 3600;
      const step = 60;
      // Forward the inbound request opaquely so the backend can derive the
      // caller's auth to the datasource (same forwarding the SLO status
      // aggregator / probe-sli reads use). The datasource client reads whatever
      // auth context it needs off the request. Without it the read throws and
      // the preview silently falls back to embedded-alert extraction.
      const points = await promBackend.queryRange(ctx, ds, metricQuery, oneHourAgo, now, step, {
        sourceRequest,
      });
      if (points.length > 0) return points;
    } catch {
      // Strategy threw or returned no data — fall through to embedded-alert extraction
    }
  }

  // Fallback: extract data from the rule's embedded alerts and evaluation metadata
  const points: Array<{ timestamp: number; value: number }> = [];

  // Add data points from currently active alerts (they contain the current value)
  for (const alert of rule.alerts || []) {
    const value = parseFloat(alert.value);
    if (!isNaN(value)) {
      points.push({
        timestamp: new Date(alert.activeAt).getTime(),
        value,
      });
    }
  }

  // Add the last evaluation timestamp with the alert count as a proxy metric
  if (rule.lastEvaluation) {
    points.push({
      timestamp: new Date(rule.lastEvaluation).getTime(),
      value: (rule.alerts || []).length,
    });
  }

  return points.sort((a, b) => a.timestamp - b.timestamp);
}

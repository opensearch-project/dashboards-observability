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
 *   - `extractOSPreviewData` — fallback extraction from an OS monitor `_execute` dry-run
 *   - `fetchPromPreviewData` — queryRange (preferred) or fallback to embedded alert data
 */
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
  toEpochMillis,
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
 * Extract preview data from OS monitor dry-run result (fallback).
 * The _execute API returns input_results with the query response.
 */
export function extractOSPreviewData(
  execResult: unknown
): Array<{ timestamp: number; value: number }> {
  const points: Array<{ timestamp: number; value: number }> = [];
  if (!execResult || typeof execResult !== 'object') return points;

  const result = execResult as Record<string, unknown>;
  const inputResults = result.input_results as Record<string, unknown> | undefined;
  const triggerResults = result.trigger_results as Record<string, unknown> | undefined;

  // Try to extract a meaningful numeric value from trigger results
  if (triggerResults) {
    const now = Date.now();
    for (const [, triggerData] of Object.entries(triggerResults)) {
      const td = triggerData as Record<string, unknown>;
      // Trigger results contain the evaluated condition value
      if (typeof td.triggered === 'boolean') {
        // Use the period_start/period_end from the execution
        // These may be ISO strings or epoch millis depending on the monitor type
        const rawStart = result.period_start;
        const rawEnd = result.period_end;
        const periodStart = toEpochMillis(rawStart) || now - 300_000;
        const periodEnd = toEpochMillis(rawEnd) || now;
        points.push({
          timestamp: periodEnd,
          value: td.triggered ? 1 : 0,
        });
        // Also add start point for a basic range
        points.push({
          timestamp: periodStart,
          value: td.triggered ? 1 : 0,
        });
      }
    }
  }

  // Try to extract hit counts from input results (common for query-level monitors)
  if (inputResults) {
    const results = inputResults.results as Array<Record<string, unknown>> | undefined;
    if (results && results.length > 0) {
      const firstResult = results[0];
      const hits = firstResult?.hits as Record<string, unknown> | undefined;
      const total = hits?.total as { value?: number } | number | undefined;
      const totalValue = typeof total === 'number' ? total : total?.value;
      if (typeof totalValue === 'number') {
        points.push({ timestamp: Date.now(), value: totalValue });
      }
    }
  }

  return points.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Fetch condition preview data for Prometheus rules.
 *
 * Uses the DirectQuery query execution API (POST /_plugins/_directquery/_query)
 * which supports both instant and range PromQL queries via PrometheusQueryHandler.
 * This is separate from the resource proxy (/_plugins/_directquery/_resources)
 * which only supports metadata lookups.
 *
 * Falls back to extracting evaluation data from rule.alerts[].value if
 * queryRange is not available or fails.
 */
export async function fetchPromPreviewData(
  promBackend: PrometheusBackend | undefined,
  client: AlertingOSClient,
  ds: Datasource,
  query: string,
  rule: PromAlertingRule
): Promise<Array<{ timestamp: number; value: number }>> {
  // Try queryRange first (works with direct Prometheus, not via DirectQuery)
  if (promBackend?.queryRange) {
    try {
      const metricQuery = query.replace(/\s*(>|<|>=|<=|==|!=)\s*[\d.]+\s*$/, '').trim();
      const now = Math.floor(Date.now() / 1000);
      const oneHourAgo = now - 3600;
      const step = 60;
      const points = await promBackend.queryRange(client, ds, metricQuery, oneHourAgo, now, step);
      if (points.length > 0) return points;
    } catch {
      // queryRange not supported (e.g., DirectQuery) — fall through to extraction
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

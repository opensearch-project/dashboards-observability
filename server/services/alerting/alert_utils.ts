/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alert service utilities — pure helper functions used by the alert service,
 * detail resolvers, and preview fetchers. These are standalone (no `this`
 * dependency) so they can be imported and unit-tested independently.
 *
 * Contents (query helpers):
 *   - `extractTimestampField` — find the timestamp field from a query's range filter
 *   - `stripRangeFilters` — remove range filters on a given field from a query
 *   - `substituteMustacheTemplates` — replace Mustache template variables with concrete values
 *   - `extractClusterMetricValue` — pull a meaningful numeric value from a cluster-metrics result
 *   - `toEpochMillis` — coerce ISO strings or epoch millis to a numeric epoch-millis value
 *   - `requireDatasource` — validate a datasource id + type and backend registration
 *
 * Contents (mapping helpers — OS/Prom to unified shapes, moved here to break
 * a circular import between `alert_service.ts` and `alert_detail.ts`):
 *   - `osSeverityToUnified`, `osStateToUnified`
 *   - `promSeverityFromLabels`, `promStateToUnified`
 *   - `osAlertToUnified`, `promAlertToUnified`
 *   - `detectMonitorKind`
 *   - `osMonitorToUnifiedRuleSummary`, `promRuleToUnified`
 *   - `inferUnitFromExpression`, `parseThreshold`
 */
import {
  Datasource,
  DatasourceService,
  MonitorStatus,
  MonitorType,
  OpenSearchBackend,
  OSAlert,
  OSMonitor,
  PromAlert,
  PromAlertingRule,
  PrometheusBackend,
  UnifiedAlertSeverity,
  UnifiedAlertState,
  UnifiedAlertSummary,
  UnifiedRuleSummary,
} from '../../../common/types/alerting';

// ============================================================================
// Preview helper functions (exported for testing)
// ============================================================================

/**
 * Extract the timestamp field name from a query's range filter.
 * Inspects `bool.filter` and `bool.must` arrays for a `range` clause.
 * Returns the field name if found, or undefined.
 */
export function extractTimestampField(query: Record<string, unknown>): string | undefined {
  const innerQuery = (query as Record<string, unknown>).query as
    | Record<string, unknown>
    | undefined;
  const target = innerQuery || query;
  const bool = target?.bool as Record<string, unknown> | undefined;
  if (!bool) return undefined;

  // Check both `filter` and `must` arrays
  const clauses: unknown[] = [];
  if (Array.isArray(bool.filter)) clauses.push(...bool.filter);
  if (Array.isArray(bool.must)) clauses.push(...bool.must);

  for (const clause of clauses) {
    if (clause && typeof clause === 'object' && 'range' in (clause as Record<string, unknown>)) {
      const range = (clause as Record<string, unknown>).range as Record<string, unknown>;
      const fields = Object.keys(range);
      if (fields.length > 0) return fields[0];
    }
  }

  return undefined;
}

/**
 * Strip range filters on the given timestamp field from a query.
 * This prevents the monitor's narrow range (e.g., "now-5m") from conflicting
 * with the wider preview range (1 hour) we apply for the chart.
 */
export function stripRangeFilters(query: unknown, timestampField: string): unknown {
  if (!query || typeof query !== 'object') return query;
  const q = query as Record<string, unknown>;

  // If this is a range clause on the target field, replace with match_all
  if ('range' in q) {
    const range = q.range as Record<string, unknown>;
    if (timestampField in range) {
      return { match_all: {} };
    }
    return q;
  }

  // Recurse into bool clauses and strip range filters from arrays
  if ('bool' in q) {
    const bool = { ...(q.bool as Record<string, unknown>) };
    for (const key of ['must', 'filter', 'should']) {
      if (Array.isArray(bool[key])) {
        bool[key] = (bool[key] as unknown[])
          .map((clause) => stripRangeFilters(clause, timestampField))
          .filter(
            (clause) =>
              !(
                clause &&
                typeof clause === 'object' &&
                'match_all' in (clause as Record<string, unknown>)
              )
          );
      }
    }
    return { bool };
  }

  return q;
}

/**
 * Replace Mustache template variables (e.g., `{{period_end}}`) with concrete values.
 * This allows executing monitor queries that contain template variables for preview.
 */
export function substituteMustacheTemplates(query: unknown): unknown {
  if (query === null || query === undefined) return query;

  if (typeof query === 'string') {
    const now = Date.now();
    const oneHourAgo = now - 3600_000;
    let result = query;
    result = result.replace(/\{\{period_end\}\}/g, String(now));
    result = result.replace(/\{\{period_start\}\}/g, String(oneHourAgo));
    // Replace any remaining {{...}} patterns with current time as a safe default
    result = result.replace(/\{\{[^}]+\}\}/g, String(now));
    return result;
  }

  if (Array.isArray(query)) {
    return query.map((item) => substituteMustacheTemplates(item));
  }

  if (typeof query === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
      result[key] = substituteMustacheTemplates(value);
    }
    return result;
  }

  return query;
}

/**
 * Extract a meaningful numeric value from a cluster metrics execution result.
 * Handles common API responses: cluster health, node stats, etc.
 */
export function extractClusterMetricValue(execResult: unknown): number {
  if (!execResult || typeof execResult !== 'object') return 0;
  const result = execResult as Record<string, unknown>;

  // Try input_results first (from _execute API response)
  const inputResults = result.input_results as Record<string, unknown> | undefined;
  if (inputResults) {
    const results = inputResults.results as Array<Record<string, unknown>> | undefined;
    if (results && results.length > 0) {
      const firstResult = results[0];
      // Cluster health: number_of_nodes, active_shards, unassigned_shards
      if (typeof firstResult.number_of_nodes === 'number') return firstResult.number_of_nodes;
      if (typeof firstResult.active_shards === 'number') return firstResult.active_shards;
      if (typeof firstResult.unassigned_shards === 'number') return firstResult.unassigned_shards;
      // Try to find any top-level numeric value
      for (const val of Object.values(firstResult)) {
        if (typeof val === 'number') return val;
      }
    }
  }

  // Direct numeric properties (if result itself is the API response)
  if (typeof result.number_of_nodes === 'number') return result.number_of_nodes;
  if (typeof result.active_shards === 'number') return result.active_shards;

  return 1; // Default to 1 to show something meaningful on the chart
}

/**
 * Convert a value that may be an ISO string or epoch millis to epoch millis.
 */
export function toEpochMillis(val: unknown): number | undefined {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = new Date(val).getTime();
    return isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

/**
 * Validate a datasource id, its expected backend type, and that the matching
 * backend is registered. Returns the resolved `Datasource` on success, or
 * throws with a descriptive message. Standalone replacement for what was a
 * private method on `MultiBackendAlertService` — callers pass the datasource
 * service and backends explicitly instead of relying on `this`.
 */
export async function requireDatasource(
  datasourceService: DatasourceService,
  osBackend: OpenSearchBackend | undefined,
  promBackend: PrometheusBackend | undefined,
  dsId: string,
  expectedType: string
): Promise<Datasource> {
  const ds = await datasourceService.get(dsId);
  if (!ds) throw new Error(`Datasource not found: ${dsId}`);
  if (ds.type !== expectedType)
    throw new Error(`Datasource ${dsId} is ${ds.type}, expected ${expectedType}`);
  if (expectedType === 'opensearch' && !osBackend)
    throw new Error('No OpenSearch backend registered');
  if (expectedType === 'prometheus' && !promBackend)
    throw new Error('No Prometheus backend registered');
  return ds;
}

// ============================================================================
// Mapping helpers
// ============================================================================

export function osSeverityToUnified(sev: string): UnifiedAlertSeverity {
  switch (sev) {
    case '1':
      return 'critical';
    case '2':
      return 'high';
    case '3':
      return 'medium';
    case '4':
      return 'low';
    default:
      return 'info';
  }
}

export function osStateToUnified(state: string): UnifiedAlertState {
  switch (state) {
    case 'ACTIVE':
      return 'active';
    case 'ACKNOWLEDGED':
      return 'acknowledged';
    case 'COMPLETED':
      return 'resolved';
    case 'ERROR':
      return 'error';
    default:
      return 'active';
  }
}

export function promSeverityFromLabels(labels: Record<string, string>): UnifiedAlertSeverity {
  const sev = labels.severity || '';
  if (sev === 'critical' || sev === 'high' || sev === 'medium' || sev === 'low') return sev;
  if (sev === 'warning') return 'medium';
  if (sev === 'page') return 'critical';
  return 'info';
}

export function promStateToUnified(state: string): UnifiedAlertState {
  if (state === 'firing') return 'active';
  if (state === 'pending') return 'pending';
  return 'resolved';
}

export function osAlertToUnified(a: OSAlert, dsId: string): UnifiedAlertSummary {
  return {
    id: a.id,
    datasourceId: dsId,
    datasourceType: 'opensearch',
    name: `${a.monitor_name} — ${a.trigger_name}`,
    state: osStateToUnified(a.state),
    severity: osSeverityToUnified(a.severity),
    message: a.error_message || a.trigger_name || undefined,
    startTime: new Date(a.start_time).toISOString(),
    lastUpdated: new Date(a.last_notification_time).toISOString(),
    labels: {
      monitor_name: a.monitor_name,
      trigger_name: a.trigger_name,
    },
    annotations: {},
  };
}

export function promAlertToUnified(a: PromAlert, dsId: string): UnifiedAlertSummary {
  return {
    id: `${dsId}-${a.labels.alertname}-${a.labels.instance || ''}`,
    datasourceId: dsId,
    datasourceType: 'prometheus',
    name: a.labels.alertname || 'Unknown',
    state: promStateToUnified(a.state),
    severity: promSeverityFromLabels(a.labels),
    message: a.annotations.summary || a.annotations.description,
    startTime: a.activeAt,
    lastUpdated: a.activeAt,
    labels: a.labels,
    annotations: a.annotations,
  };
}

/**
 * Detect the actual monitor kind from the OS monitor's inputs,
 * since cluster metrics monitors share monitor_type 'query_level_monitor'.
 */
export function detectMonitorKind(m: OSMonitor): 'query' | 'bucket' | 'doc' | 'cluster_metrics' {
  if (m.monitor_type === 'bucket_level_monitor') return 'bucket';
  if (m.monitor_type === 'doc_level_monitor') return 'doc';
  if (m.inputs[0] && 'uri' in m.inputs[0]) return 'cluster_metrics';
  return 'query';
}

export function osMonitorToUnifiedRuleSummary(m: OSMonitor, dsId: string): UnifiedRuleSummary {
  const trigger = m.triggers[0];
  const isEnabled = m.enabled;
  const kind = detectMonitorKind(m);
  const input = m.inputs[0];

  // Derive labels from actual monitor metadata per input type
  const labels: Record<string, string> = {};
  if (input && 'search' in input) {
    const indices = input.search.indices ?? [];
    if (indices.length > 0) {
      labels.indices = indices.join(',');
    }
  } else if (input && 'uri' in input) {
    labels.api_type = input.uri.api_type;
    if (input.uri.clusters?.length > 0) {
      labels.clusters = input.uri.clusters.join(',');
    }
  } else if (input && 'doc_level_input' in input) {
    const indices = input.doc_level_input.indices ?? [];
    if (indices.length > 0) {
      labels.indices = indices.join(',');
    }
    labels.doc_queries = String(input.doc_level_input.queries?.length ?? 0);
  }
  labels.monitor_type = m.monitor_type;
  labels.monitor_kind = kind;
  labels.datasource_id = dsId;

  const annotations: Record<string, string> = {};
  if (trigger?.actions?.[0]?.message_template?.source) {
    annotations.summary = trigger.actions[0].message_template.source;
  }

  const severity = trigger ? osSeverityToUnified(trigger.severity) : 'info';
  const status: MonitorStatus = !isEnabled ? 'disabled' : 'active';

  // Extract query string based on input type
  let query: string;
  if (input && 'uri' in input) {
    query = `${input.uri.api_type}: ${input.uri.path}`;
  } else if (input && 'doc_level_input' in input) {
    const docQueries = input.doc_level_input.queries ?? [];
    query = docQueries.map((q) => `${q.name}: ${q.query}`).join('; ') || '(no queries)';
  } else if (input && 'search' in input) {
    query = JSON.stringify(input.search.query ?? {});
  } else {
    query = '{}';
  }

  // Derive monitor type from kind and index patterns
  let monitorType: MonitorType;
  if (kind === 'cluster_metrics') {
    monitorType = 'cluster_metrics';
  } else if (kind === 'doc') {
    monitorType = 'log';
  } else if (kind === 'bucket') {
    monitorType = 'infrastructure';
  } else {
    // query-level: derive from index patterns
    const indices = input && 'search' in input ? input.search.indices ?? [] : [];
    if (indices.some((i) => i.startsWith('logs-') || i.startsWith('ss4o_logs'))) {
      monitorType = 'log';
    } else if (indices.some((i) => i.startsWith('otel-v1-apm') || i.startsWith('ss4o_traces'))) {
      monitorType = 'apm';
    } else {
      monitorType = 'metric';
    }
  }

  const destNames = trigger?.actions?.map((a) => a.name) ?? [];
  const intervalUnit = m.schedule.period.unit;
  const intervalVal = m.schedule.period.interval;
  const evalInterval = `${intervalVal} ${intervalUnit.toLowerCase()}`;

  return {
    id: m.id,
    datasourceId: dsId,
    datasourceType: 'opensearch',
    name: m.name,
    enabled: isEnabled,
    severity,
    query,
    condition: trigger?.condition?.script?.source ?? '',
    labels,
    annotations,
    monitorType,
    status,
    healthStatus: !isEnabled ? 'no_data' : 'healthy',
    createdBy: '',
    createdAt: new Date(m.last_update_time).toISOString(),
    lastModified: new Date(m.last_update_time).toISOString(),
    lastTriggered: undefined,
    notificationDestinations: destNames,
    evaluationInterval: evalInterval,
    pendingPeriod: evalInterval,
    threshold: trigger
      ? (() => {
          const parsed = parseThreshold(trigger.condition.script.source);
          return {
            operator: parsed.operator,
            value: parsed.value,
            unit: inferUnitFromExpression(query),
          };
        })()
      : undefined,
  };
}

/**
 * Infer a display unit from metric name suffixes in a PromQL expression or
 * query string. Falls back to empty string (no unit) rather than a wrong unit.
 */
export function inferUnitFromExpression(expr: string): string {
  if (/_seconds|_duration/.test(expr)) return 's';
  if (/_bytes/.test(expr)) return 'B';
  if (/_ratio|_percent/.test(expr)) return '%';
  if (/_total|_count/.test(expr)) return '';
  return '';
}

export function parseThreshold(conditionSource: string): { operator: string; value: number } {
  const match = conditionSource.match(/(>=|<=|!=|==|>|<)\s*([\d.]+)/);
  if (match) {
    return { operator: match[1], value: parseFloat(match[2]) };
  }
  return { operator: '>', value: 0 };
}

export function promRuleToUnified(
  r: PromAlertingRule,
  groupName: string,
  dsId: string
): UnifiedRuleSummary {
  const state = r.state;
  const severity = promSeverityFromLabels(r.labels);
  const status: MonitorStatus =
    state === 'firing' ? 'active' : state === 'pending' ? 'pending' : 'muted';
  const destNames: string[] = [];

  return {
    id: `${dsId}-${groupName}-${r.name}`,
    datasourceId: dsId,
    datasourceType: 'prometheus',
    name: r.name,
    enabled: true,
    severity,
    query: r.query,
    condition: `> threshold for ${r.duration}s`,
    group: groupName,
    labels: r.labels,
    annotations: r.annotations,
    monitorType: 'metric',
    status,
    healthStatus: r.health === 'ok' ? 'healthy' : r.health === 'err' ? 'failing' : 'no_data',
    createdBy: 'system',
    createdAt: r.lastEvaluation || new Date().toISOString(),
    lastModified: r.lastEvaluation || new Date().toISOString(),
    lastTriggered: r.alerts?.length > 0 ? r.alerts[0].activeAt : undefined,
    notificationDestinations: destNames,
    evaluationInterval: `${r.duration}s`,
    pendingPeriod: `${r.duration}s`,
    threshold: (() => {
      const parsed = parseThreshold(r.query);
      return {
        operator: parsed.operator,
        value: parsed.value,
        unit: inferUnitFromExpression(r.query),
      };
    })(),
  };
}

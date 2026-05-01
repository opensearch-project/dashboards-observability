/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alert detail resolvers — loaded on demand when the user opens a rule or
 * alert flyout. Split out from `alert_service.ts` as standalone functions
 * (no `this`) that take the backends + client + datasource service as
 * parameters.
 *
 * Contents:
 *   - `getRuleDetail` — dispatches to OS or Prom based on the datasource type
 *   - `getOSRuleDetail` — full OS monitor detail (history, routing, preview)
 *   - `getPromRuleDetail` — full Prometheus rule detail
 *   - `getAlertDetail` — full alert detail with raw backend data
 */
import {
  AlertHistoryEntry,
  AlertingOSClient,
  Datasource,
  DatasourceService,
  NotificationRouting,
  OpenSearchBackend,
  PromAlertingRule,
  PrometheusBackend,
  UnifiedAlert,
  UnifiedRule,
} from '../../../common/types/alerting';
import {
  detectMonitorKind,
  osAlertToUnified,
  osMonitorToUnifiedRuleSummary,
  osStateToUnified,
  promAlertToUnified,
  promRuleToUnified,
  promStateToUnified,
} from './alert_utils';
import {
  extractOSPreviewData,
  fetchOSPreviewTimeSeries,
  fetchPromPreviewData,
} from './alert_preview';

/**
 * Get full detail for a single rule/monitor. Fetches real metadata from
 * the backend (alert history, destinations, annotations). Fields that
 * cannot be fetched from the API are marked as mock placeholders.
 */
export async function getRuleDetail(
  datasourceService: DatasourceService,
  osBackend: OpenSearchBackend | undefined,
  promBackend: PrometheusBackend | undefined,
  client: AlertingOSClient,
  dsId: string,
  ruleId: string
): Promise<UnifiedRule | null> {
  const ds = await datasourceService.get(dsId);
  if (!ds) return null;

  if (ds.type === 'opensearch' && osBackend) {
    return getOSRuleDetail(osBackend, client, ds, ruleId);
  } else if (ds.type === 'prometheus' && promBackend) {
    return getPromRuleDetail(promBackend, client, ds, ruleId);
  }
  return null;
}

export async function getOSRuleDetail(
  osBackend: OpenSearchBackend,
  client: AlertingOSClient,
  ds: Datasource,
  monitorId: string
): Promise<UnifiedRule | null> {
  const monitor = await osBackend.getMonitor(client, monitorId);
  if (!monitor) return null;

  const summary = osMonitorToUnifiedRuleSummary(monitor, ds.id);

  // Fetch real alert history for this monitor
  let alertHistory: AlertHistoryEntry[] = [];
  try {
    const { alerts } = await osBackend.getAlerts(client);
    const monitorAlerts = alerts.filter((a) => a.monitor_id === monitorId).slice(0, 20);
    alertHistory = monitorAlerts.map((a) => ({
      timestamp: new Date(a.start_time).toISOString(),
      state: osStateToUnified(a.state),
      value: a.severity,
      message: a.error_message || (a.state === 'ACTIVE' ? 'Threshold exceeded' : 'Resolved'),
    }));
  } catch {
    // Alert history fetch is best-effort
  }

  // Build notification routing from trigger actions + destinations
  const notificationRouting: NotificationRouting[] = [];
  try {
    const destinations = await osBackend.getDestinations(client);
    const destMap = new Map(destinations.map((d) => [d.id, d]));
    for (const trigger of monitor.triggers) {
      for (const action of trigger.actions) {
        const dest = destMap.get(action.destination_id);
        notificationRouting.push({
          channel: dest?.type || 'unknown',
          destination: dest?.name || action.name || action.destination_id,
          throttle: action.throttle
            ? `${action.throttle.value} ${action.throttle.unit}`
            : undefined,
        });
      }
    }
  } catch {
    // Destination fetch is best-effort
  }

  // Build description from trigger message template or input type
  const trigger = monitor.triggers[0];
  const kind = detectMonitorKind(monitor);
  const input = monitor.inputs[0];
  let descriptionFallback: string;
  if (kind === 'cluster_metrics' && input && 'uri' in input) {
    descriptionFallback = `Cluster metrics monitor: ${input.uri.api_type} (${input.uri.path})`;
  } else if (kind === 'doc' && input && 'doc_level_input' in input) {
    const docIndices = input.doc_level_input.indices?.join(', ') || 'unknown indices';
    const queryCount = input.doc_level_input.queries?.length ?? 0;
    descriptionFallback = `Document-level monitor targeting ${docIndices} with ${queryCount} queries`;
  } else if (kind === 'bucket' && input && 'search' in input) {
    const bucketIndices = input.search.indices?.join(', ') || 'unknown indices';
    descriptionFallback = `Bucket aggregation monitor targeting ${bucketIndices}`;
  } else {
    const queryIndices = input && 'search' in input ? input.search.indices?.join(', ') : null;
    descriptionFallback = `${summary.monitorType} monitor targeting ${
      queryIndices || 'unknown indices'
    }`;
  }
  const description = trigger?.actions?.[0]?.message_template?.source || descriptionFallback;

  // Fetch condition preview: run the monitor's query as a date_histogram to build a time-series
  let conditionPreviewData: Array<{ timestamp: number; value: number }> = [];
  try {
    conditionPreviewData = await fetchOSPreviewTimeSeries(osBackend, client, ds, monitor);
  } catch {
    // Preview data fetch is best-effort
  }
  // Fallback: try dry-run execution if time-series extraction produced nothing
  if (conditionPreviewData.length === 0) {
    try {
      const execResult = await osBackend.runMonitor(client, monitorId, true);
      conditionPreviewData = extractOSPreviewData(execResult);
    } catch {
      // Dry run is best-effort — some monitors may not support it
    }
  }

  return {
    ...summary,
    description,
    // AI summary not available from OS alerting API — empty triggers flyout fallback
    aiSummary: '',
    firingPeriod: undefined,
    lookbackPeriod: undefined,
    alertHistory,
    conditionPreviewData,
    notificationRouting,
    // Suppression rules from the in-memory service (not from OS API)
    suppressionRules: [],
    raw: monitor,
  };
}

export async function getPromRuleDetail(
  promBackend: PrometheusBackend,
  client: AlertingOSClient,
  ds: Datasource,
  ruleId: string
): Promise<UnifiedRule | null> {
  const groups = await promBackend.getRuleGroups(client, ds);

  // ruleId format: "{dsId}-{groupName}-{ruleName}"
  for (const group of groups) {
    for (const rule of group.rules) {
      if (rule.type !== 'alerting') continue;
      const alertingRule = rule as PromAlertingRule;
      const id = `${ds.id}-${group.name}-${alertingRule.name}`;
      if (id !== ruleId) continue;

      const summary = promRuleToUnified(alertingRule, group.name, ds.id);

      // Real alert history from the rule's embedded alerts
      const alertHistory: AlertHistoryEntry[] = (alertingRule.alerts || []).map((a) => ({
        timestamp: a.activeAt,
        state: promStateToUnified(a.state),
        value: a.value,
        message: a.annotations.summary || a.annotations.description || a.state,
      }));

      // Description from annotations
      const description =
        alertingRule.annotations.description ||
        alertingRule.annotations.summary ||
        `PromQL rule: ${alertingRule.query}`;

      return {
        ...summary,
        description,
        // AI summary not available from Prometheus API — empty triggers flyout fallback
        aiSummary: '',
        firingPeriod: undefined,
        lookbackPeriod: undefined,
        alertHistory,
        conditionPreviewData: await fetchPromPreviewData(
          promBackend,
          client,
          ds,
          alertingRule.query,
          alertingRule
        ),
        notificationRouting: [],
        suppressionRules: [],
        raw: alertingRule,
      };
    }
  }
  return null;
}

/**
 * Get full detail for a single alert including raw backend data.
 */
export async function getAlertDetail(
  datasourceService: DatasourceService,
  osBackend: OpenSearchBackend | undefined,
  promBackend: PrometheusBackend | undefined,
  client: AlertingOSClient,
  dsId: string,
  alertId: string
): Promise<UnifiedAlert | null> {
  const ds = await datasourceService.get(dsId);
  if (!ds) return null;

  if (ds.type === 'opensearch' && osBackend) {
    const { alerts } = await osBackend.getAlerts(client);
    const alert = alerts.find((a) => a.id === alertId);
    if (!alert) return null;
    const summary = osAlertToUnified(alert, ds!.id);
    return { ...summary, raw: alert };
  } else if (ds.type === 'prometheus' && promBackend) {
    const promAlerts = await promBackend.getAlerts(client, ds);
    const resolvedId = ds!.id;
    const alert = promAlerts.find(
      (a) => `${resolvedId}-${a.labels.alertname}-${a.labels.instance || ''}` === alertId
    );
    if (!alert) return null;
    const summary = promAlertToUnified(alert, resolvedId);
    return { ...summary, raw: alert };
  }
  return null;
}

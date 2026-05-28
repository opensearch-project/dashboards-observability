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
 *   - `getOSRuleDetail` — full OS monitor detail (history + preview)
 *   - `getPromRuleDetail` — full Prometheus rule detail
 *   - `getAlertDetail` — full alert detail with raw backend data
 *
 * Notification routing is intentionally not fetched here — the rule
 * flyout no longer surfaces it inline. Alertmanager owns Prom routing
 * and the standalone Routing tab is the canonical place for it.
 */
import type { RequestHandlerContext } from '../../../../../src/core/server';
import {
  AlertHistoryEntry,
  AlertingOSClient,
  Datasource,
  DatasourceService,
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
  promRuleToUnified,
  promStateToUnified,
} from './alert_utils';
import { fetchOSPreviewTimeSeries, fetchPromPreviewData } from './alert_preview';

/**
 * Get full detail for a single rule/monitor. Real metadata where the
 * upstream API exposes it (alert history, monitor config, annotations);
 * `aiSummary` and `suppressionRules` are intentionally empty — no API
 * source today and the flyout treats them as optional.
 */
export async function getRuleDetail(
  datasourceService: DatasourceService,
  osBackend: OpenSearchBackend | undefined,
  promBackend: PrometheusBackend | undefined,
  client: AlertingOSClient,
  dsId: string,
  ruleId: string,
  ctx?: RequestHandlerContext
): Promise<UnifiedRule | null> {
  const ds = await datasourceService.get(dsId);
  if (!ds) return null;

  if (ds.type === 'opensearch' && osBackend) {
    return getOSRuleDetail(osBackend, client, ds, ruleId);
  } else if (ds.type === 'prometheus' && promBackend) {
    return getPromRuleDetail(promBackend, client, ds, ruleId, ctx);
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

  // Fetch real alert history for this monitor — scoped at the upstream
  // via `monitorId`, bounded to 20 rows so the upstream returns one
  // small page even on busy monitors with thousands of alerts, and
  // sorted by `start_time desc` so the "Recent alerts" label is honest
  // (default OS Alerting ordering is shard-order-dependent).
  let alertHistory: AlertHistoryEntry[] = [];
  try {
    const { alerts } = await osBackend.getAlerts(client, {
      monitorId,
      limit: 20,
      sortString: 'start_time',
      sortOrder: 'desc',
    });
    alertHistory = alerts.map((a) => ({
      timestamp: new Date(a.start_time).toISOString(),
      state: osStateToUnified(a.state),
      value: a.severity,
      message: a.error_message || (a.state === 'ACTIVE' ? 'Threshold exceeded' : 'Resolved'),
    }));
  } catch {
    // Alert history fetch is best-effort
  }

  // Build description from trigger message template or input type
  const trigger = monitor.triggers[0];
  const kind = detectMonitorKind(monitor);
  const input = monitor.inputs[0];
  let descriptionFallback: string;
  if (kind === 'ppl' && input && 'ppl_input' in input) {
    descriptionFallback = `PPL monitor: ${input.ppl_input.query}`;
  } else if (kind === 'cluster_metrics' && input && 'uri' in input) {
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
  const firstActionMessage =
    trigger && 'ppl_trigger' in trigger
      ? trigger.ppl_trigger.actions?.[0]?.message_template?.source
      : trigger?.actions?.[0]?.message_template?.source;
  const description = firstActionMessage || descriptionFallback;

  // Fetch condition preview: run the monitor's query as a date_histogram to
  // build a time-series. If extraction produces no points the flyout's
  // `ConditionPreviewGraph` shows its own empty state — we deliberately do
  // NOT fall back to `runMonitor(_, dryRun=true)`, which re-executes the
  // customer's monitor against live data on every flyout open.
  let conditionPreviewData: Array<{ timestamp: number; value: number }> = [];
  try {
    conditionPreviewData = await fetchOSPreviewTimeSeries(osBackend, client, ds, monitor);
  } catch {
    // Preview data fetch is best-effort
  }

  return {
    ...summary,
    description,
    firingPeriod: undefined,
    lookbackPeriod: undefined,
    alertHistory,
    conditionPreviewData,
    // Notification routing is no longer surfaced inline on the rule
    // flyout. The standalone Routing tab (Alertmanager-fed for Prom; OS
    // destinations for OS) owns it. We keep the empty array on the
    // response shape so existing UnifiedRule consumers don't need a
    // type change.
    notificationRouting: [],
    // Suppression rules from the in-memory service (not from OS API)
    suppressionRules: [],
    raw: monitor,
  };
}

export async function getPromRuleDetail(
  promBackend: PrometheusBackend,
  client: AlertingOSClient,
  ds: Datasource,
  ruleId: string,
  ctx?: RequestHandlerContext
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
        firingPeriod: undefined,
        lookbackPeriod: undefined,
        alertHistory,
        conditionPreviewData: await fetchPromPreviewData(
          promBackend,
          ctx,
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
 *
 * The OS Alerting REST endpoint (`_plugins/_alerting/monitors/alerts`)
 * does not expose a per-id filter, so we paginate scoped by `monitorId`
 * and short-circuit pagination on the first page that contains the
 * target alert (`findAlertId`). With `monitorId` set, the upstream
 * scans one monitor's alerts; the early exit caps the work at the
 * page that holds the row.
 */
export async function getAlertDetail(
  datasourceService: DatasourceService,
  osBackend: OpenSearchBackend | undefined,
  promBackend: PrometheusBackend | undefined,
  client: AlertingOSClient,
  dsId: string,
  alertId: string,
  monitorId?: string
): Promise<UnifiedAlert | null> {
  const ds = await datasourceService.get(dsId);
  if (!ds) return null;

  if (ds.type === 'opensearch' && osBackend) {
    const { alerts } = await osBackend.getAlerts(client, {
      findAlertId: alertId,
      ...(monitorId ? { monitorId } : {}),
    });
    const alert = alerts.find((a) => a.id === alertId);
    if (!alert) return null;
    const summary = osAlertToUnified(alert, ds!.id);
    return { ...summary, raw: alert };
  } else if (ds.type === 'prometheus' && promBackend) {
    // Prom doesn't expose a per-alert lookup; the previous code scanned the
    // entire firing-alerts list to find one row. The flyout already has the
    // summary's labels/annotations on hand and falls back to rendering them
    // when this returns null, so the scan is wasted work.
    return null;
  }
  return null;
}

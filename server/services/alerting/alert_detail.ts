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
import type {
  RequestHandlerContext,
  OpenSearchDashboardsRequest,
} from '../../../../../src/core/server';
import {
  ADDetector,
  ADForecaster,
  AlertHistoryEntry,
  AlertingOSClient,
  Datasource,
  DatasourceService,
  OpenSearchBackend,
  PromAlertingRule,
  PrometheusBackend,
  UnifiedAlert,
  UnifiedDefinitionType,
  UnifiedRule,
} from '../../../common/types/alerting';
import {
  detectMonitorKind,
  adDetectorToUnifiedRuleSummary,
  adForecasterToUnifiedRuleSummary,
  osAlertToUnified,
  osMonitorToUnifiedRuleSummary,
  osStateToUnified,
  promRuleToUnified,
  promStateToUnified,
} from './alert_utils';
import { fetchOSPreviewTimeSeries, fetchPromPreviewData } from './alert_preview';
import { isStatusCode } from './errors';

interface ADGetDetectorResponse {
  _id?: string;
  _primary_term?: number;
  _seq_no?: number;
  anomaly_detector?: Record<string, unknown>;
  anomaly_detector_job?: Record<string, unknown>;
}

interface ADGetForecasterResponse {
  _id?: string;
  _primary_term?: number;
  _seq_no?: number;
  forecaster?: Record<string, unknown>;
  forecaster_job?: Record<string, unknown>;
  realtime_task?: Record<string, unknown>;
  run_once_task?: Record<string, unknown>;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

function normalizeDetectorResponse(body: ADGetDetectorResponse, detectorId: string): ADDetector {
  const detectorSource = asRecord(body.anomaly_detector);
  const job = asRecord(body.anomaly_detector_job);
  return {
    ...detectorSource,
    id: body._id || detectorId,
    ...(body._primary_term !== undefined ? { primary_term: body._primary_term } : {}),
    ...(body._seq_no !== undefined ? { seq_no: body._seq_no } : {}),
    ...(Object.keys(job).length > 0 ? { anomaly_detector_job: job } : {}),
  } as ADDetector;
}

function normalizeForecasterResponse(
  body: ADGetForecasterResponse,
  forecasterId: string
): ADForecaster {
  const forecasterSource = asRecord(body.forecaster);
  const job = asRecord(body.forecaster_job);
  const realtimeTask = asRecord(body.realtime_task);
  const runOnceTask = asRecord(body.run_once_task);
  return {
    ...forecasterSource,
    id: body._id || forecasterId,
    ...(body._primary_term !== undefined ? { primary_term: body._primary_term } : {}),
    ...(body._seq_no !== undefined ? { seq_no: body._seq_no } : {}),
    ...(Object.keys(job).length > 0 ? { forecaster_job: job } : {}),
    ...(Object.keys(realtimeTask).length > 0 ? { realtime_task: realtimeTask } : {}),
    ...(Object.keys(runOnceTask).length > 0 ? { run_once_task: runOnceTask } : {}),
  } as ADForecaster;
}

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
  ctx?: RequestHandlerContext,
  definitionType?: UnifiedDefinitionType,
  sourceRequest?: OpenSearchDashboardsRequest
): Promise<UnifiedRule | null> {
  const ds = await datasourceService.get(dsId);
  if (!ds) return null;

  if (ds.type === 'opensearch' && osBackend) {
    if (definitionType === 'detector') return getADDetectorDetail(client, ds, ruleId);
    if (definitionType === 'forecaster') return getADForecasterDetail(client, ds, ruleId);
    if (definitionType === 'monitor') return getOSRuleDetail(osBackend, client, ds, ruleId);

    const monitor = await getOSRuleDetail(osBackend, client, ds, ruleId);
    const detector = monitor ?? (await getADDetectorDetail(client, ds, ruleId));
    return detector ?? getADForecasterDetail(client, ds, ruleId);
  } else if (ds.type === 'prometheus' && promBackend) {
    return getPromRuleDetail(promBackend, client, ds, ruleId, ctx, sourceRequest);
  }
  return null;
}

export async function getADDetectorDetail(
  client: AlertingOSClient,
  ds: Datasource,
  detectorId: string
): Promise<UnifiedRule | null> {
  let detector: ADDetector;
  try {
    const response = await client.transport.request<ADGetDetectorResponse>({
      method: 'GET',
      path: `/_plugins/_anomaly_detection/detectors/${encodeURIComponent(detectorId)}`,
      querystring: { job: true, task: true },
    });
    if (!response.body?.anomaly_detector) return null;
    detector = normalizeDetectorResponse(response.body, detectorId);
  } catch (err) {
    if (isStatusCode(err, 404)) return null;
    throw err;
  }

  const summary = adDetectorToUnifiedRuleSummary(detector, ds.id);
  return {
    ...summary,
    description: detector.description || '',
    alertHistory: [],
    conditionPreviewData: [],
    notificationRouting: [],
    suppressionRules: [],
    raw: detector,
  };
}

export async function getADForecasterDetail(
  client: AlertingOSClient,
  ds: Datasource,
  forecasterId: string
): Promise<UnifiedRule | null> {
  let forecaster: ADForecaster;
  try {
    const response = await client.transport.request<ADGetForecasterResponse>({
      method: 'GET',
      path: `/_plugins/_forecast/forecasters/${encodeURIComponent(forecasterId)}`,
      querystring: { job: true, task: true },
    });
    if (!response.body?.forecaster) return null;
    forecaster = normalizeForecasterResponse(response.body, forecasterId);
  } catch (err) {
    if (isStatusCode(err, 404)) return null;
    throw err;
  }

  const summary = adForecasterToUnifiedRuleSummary(forecaster, ds.id);
  return {
    ...summary,
    description: forecaster.description || '',
    alertHistory: [],
    conditionPreviewData: [],
    notificationRouting: [],
    suppressionRules: [],
    raw: forecaster,
  };
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
  ctx?: RequestHandlerContext,
  sourceRequest?: OpenSearchDashboardsRequest
): Promise<UnifiedRule | null> {
  const groups = await promBackend.getRuleGroups(client, ds);

  // ruleId format: "{dsId}-{groupName}-{ruleName}"
  for (const group of groups) {
    for (const rule of group.rules) {
      if (rule.type !== 'alerting') continue;
      const alertingRule = rule as PromAlertingRule;
      const id = `${ds.id}-${group.name}-${alertingRule.name}`;
      if (id !== ruleId) continue;

      const summary = promRuleToUnified(alertingRule, group.name, ds.id, group.interval);

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
          alertingRule,
          sourceRequest
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
 * OpenSearch only. The OS Alerting REST endpoint
 * (`_plugins/_alerting/monitors/alerts`) does not expose a per-id
 * filter, so we paginate scoped by `monitorId` and short-circuit
 * pagination on the first page that contains the target alert
 * (`findAlertId`). With `monitorId` set, the upstream scans one
 * monitor's alerts; the early exit caps the work at the page that
 * holds the row.
 *
 * Prometheus has no per-alert lookup endpoint, and the flyout already
 * has the summary's labels/annotations on hand — the UI short-circuits
 * the round-trip on the client, so this function is never called for
 * Prom datasources. Non-OS datasources resolve to `null` here as a
 * defensive fallthrough.
 */
export async function getAlertDetail(
  datasourceService: DatasourceService,
  osBackend: OpenSearchBackend | undefined,
  client: AlertingOSClient,
  dsId: string,
  alertId: string,
  monitorId?: string
): Promise<UnifiedAlert | null> {
  const ds = await datasourceService.get(dsId);
  if (!ds || ds.type !== 'opensearch' || !osBackend) return null;

  const { alerts } = await osBackend.getAlerts(client, {
    findAlertId: alertId,
    ...(monitorId ? { monitorId } : {}),
  });
  const alert = alerts.find((a) => a.id === alertId);
  if (!alert) return null;
  const summary = osAlertToUnified(alert, ds.id);
  return { ...summary, raw: alert };
}

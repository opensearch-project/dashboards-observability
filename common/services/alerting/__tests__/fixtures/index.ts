/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  OSMonitor,
  OSAlert,
  OSDestination,
  PromRuleGroup,
  PromAlert,
  PrometheusWorkspace,
  AlertHistoryEntry,
  NotificationRouting,
  SuppressionRule,
} from '../../../../types/alerting/types';

/** Shared labels — dedup across Prom fixtures. `_workspace` scopes to a workspace. */
export const sampleAlertLabels = {
  alertname: 'HighCpuUsage',
  instance: 'i-0abc123:9100',
  severity: 'warning',
  team: 'infra',
  service: 'node-exporter',
  environment: 'production',
  region: 'us-east-1',
  _workspace: 'ws-prod-001',
} as const;

// ---------- OpenSearch Alerting ----------
export const sampleOSDestination: OSDestination = {
  id: 'dest-slack-1',
  type: 'slack',
  name: 'ops-alerts-slack',
  last_update_time: 1_700_000_000_000,
  slack: { url: 'https://hooks.slack.com/services/xxx' },
};

/** Query-level monitor, one trigger, one Slack action. */
export const sampleOSMonitor: OSMonitor = {
  id: 'mon-1',
  type: 'monitor',
  monitor_type: 'query_level_monitor',
  name: 'High Error Rate',
  enabled: true,
  last_update_time: 1_700_000_000_000,
  schedule: { period: { interval: 1, unit: 'MINUTES' } },
  inputs: [
    {
      search: {
        indices: ['logs-*'],
        query: {
          size: 0,
          query: { match_all: {} },
          aggs: { error_count: { filter: { range: { status: { gte: 500 } } } } },
        },
      },
    },
  ],
  triggers: [
    {
      id: 'trig-1',
      name: 'Error count > 100',
      severity: '1',
      condition: {
        script: {
          source: 'ctx.results[0].aggregations.error_count.doc_count > 100',
          lang: 'painless',
        },
      },
      actions: [
        {
          id: 'act-1',
          name: 'Notify Slack',
          destination_id: 'dest-slack-1',
          message_template: { source: 'High error rate' },
          throttle_enabled: true,
          throttle: { value: 10, unit: 'MINUTES' },
        },
      ],
    },
  ],
};

/** `state`: ACTIVE | ACKNOWLEDGED | COMPLETED | ERROR. */
export const sampleOSAlert: OSAlert = {
  id: 'alert-1',
  version: 1,
  monitor_id: 'mon-1',
  monitor_name: 'High Error Rate',
  monitor_version: 1,
  trigger_id: 'trig-1',
  trigger_name: 'Error count > 100',
  state: 'ACTIVE',
  severity: '1',
  error_message: null,
  start_time: 1_700_000_000_000,
  last_notification_time: 1_700_000_300_000,
  end_time: null,
  acknowledged_time: null,
  action_execution_results: [
    { action_id: 'act-1', last_execution_time: 1_700_000_300_000, throttled_count: 2 },
  ],
};

// ---------- Prometheus / Alertmanager ----------
export const samplePrometheusWorkspace: PrometheusWorkspace = {
  id: 'ws-prod-001',
  name: 'production',
  alias: 'Production Monitoring',
  region: 'us-east-1',
  status: 'active',
};

/** `state`: 'firing' | 'pending' | 'inactive'. `value` is stringified. */
export const samplePromAlert: PromAlert = {
  labels: { ...sampleAlertLabels },
  annotations: { summary: 'CPU usage above 80% on i-0abc123:9100' },
  state: 'firing',
  activeAt: '2026-04-23T21:35:00.000Z',
  value: '92.3',
};

export const samplePromRuleGroup: PromRuleGroup = {
  name: 'node_alerts',
  file: '/etc/prometheus/rules/ws-prod-001/node.yml',
  interval: 60,
  rules: [
    {
      type: 'alerting',
      name: 'HighCpuUsage',
      health: 'ok',
      state: 'firing',
      query: '100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80',
      duration: 300,
      labels: { ...sampleAlertLabels, application: 'platform' },
      annotations: {
        summary: 'CPU usage above 80% on {{ $labels.instance }}',
        runbook_url: 'https://wiki.example.com/runbooks/high-cpu',
      },
      alerts: [samplePromAlert],
      lastEvaluation: '2026-04-23T21:35:00.000Z',
      evaluationTime: 0.003,
    },
  ],
};

// ---------- Unified alert-detail enrichment ----------
/** `state`: 'active' | 'resolved' | 'acknowledged'. */
export const sampleAlertHistoryEntry: AlertHistoryEntry = {
  timestamp: '2026-04-23T20:00:00.000Z',
  state: 'active',
  value: '87.4',
  message: 'Threshold exceeded',
};

/** `channel`: 'Slack' | 'Email' | 'Webhook' | 'None'. */
export const sampleNotificationRouting: NotificationRouting = {
  channel: 'Slack',
  destination: '#ops-alerts',
  severity: ['critical', 'high'],
  throttle: '10 minutes',
};

export const sampleSuppressionRule: SuppressionRule = {
  id: 'sup-1',
  name: 'Staging quiet hours',
  reason: 'Reduce noise from staging environment',
  schedule: 'Daily 22:00-06:00 UTC',
  active: true,
};

// ---------- Prometheus metadata (trimmed from 44/30/17) ----------
export const samplePromMetrics = ['node_cpu_seconds_total', 'http_requests_total', 'up'] as const;
export const samplePromLabelNames = [
  'instance',
  'job',
  'severity',
  'service',
  'environment',
] as const;
export const samplePromLabelValues: Record<string, readonly string[]> = {
  severity: ['critical', 'warning', 'info'],
  environment: ['production', 'staging', 'development'],
  method: ['GET', 'POST', 'PUT', 'DELETE'],
};

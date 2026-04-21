/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mock Prometheus / Alertmanager backend — simulates real Prometheus API responses.
 */
import {
  AlertingOSClient,
  Datasource,
  Logger,
  PrometheusBackend,
  PrometheusMetadataProvider,
  PrometheusMetricMetadata,
  PrometheusWorkspace,
  AlertmanagerStatus,
  PromAlert,
  PromAlertingRule,
  PromRuleGroup,
} from '../../../common/types/alerting/types';
import { MOCK_METRICS, MOCK_LABEL_NAMES, MOCK_LABEL_VALUES } from './mock_data';

export class MockPrometheusBackend implements PrometheusBackend, PrometheusMetadataProvider {
  readonly type = 'prometheus' as const;
  private ruleGroups: Map<string, PromRuleGroup[]> = new Map();
  private activeAlerts: Map<string, PromAlert[]> = new Map();
  private workspaces: Map<string, PrometheusWorkspace[]> = new Map();

  constructor(_logger: Logger) {}

  async getRuleGroups(_client: AlertingOSClient, ds: Datasource): Promise<PromRuleGroup[]> {
    // If workspace-scoped, filter by workspace
    if (ds.workspaceId) {
      const allGroups = this.ruleGroups.get(ds.parentDatasourceId || ds.id) ?? [];
      return allGroups.filter((g) => g.file.includes(ds.workspaceId!));
    }
    return this.ruleGroups.get(ds.id) ?? [];
  }

  async getAlerts(_client: AlertingOSClient, ds: Datasource): Promise<PromAlert[]> {
    const dsKey = ds.parentDatasourceId || ds.id;
    const allAlerts = this.activeAlerts.get(dsKey) ?? [];
    if (ds.workspaceId) {
      return allAlerts.filter((a) => a.labels._workspace === ds.workspaceId);
    }
    return allAlerts;
  }

  async listWorkspaces(_client: AlertingOSClient, ds: Datasource): Promise<PrometheusWorkspace[]> {
    return this.workspaces.get(ds.id) ?? [];
  }

  // --- Seeding ---

  seed(dsId: string): void {
    const now = new Date().toISOString();
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    // Timestamps available for future use: oneHourAgo, oneDayAgo

    // Create workspaces for this Prometheus datasource
    const wsProduction: PrometheusWorkspace = {
      id: 'ws-prod-001',
      name: 'production',
      alias: 'Production Monitoring',
      region: 'us-east-1',
      status: 'active',
    };
    const wsStaging: PrometheusWorkspace = {
      id: 'ws-staging-002',
      name: 'staging',
      alias: 'Staging Environment',
      region: 'us-west-2',
      status: 'active',
    };
    const wsDev: PrometheusWorkspace = {
      id: 'ws-dev-003',
      name: 'development',
      alias: 'Dev/Test',
      region: 'us-west-2',
      status: 'active',
    };
    this.workspaces.set(dsId, [wsProduction, wsStaging, wsDev]);

    const severities = ['critical', 'warning', 'info'];
    const teams = ['infra', 'platform', 'sre', 'data', 'security', 'network'];
    const services = [
      'node-exporter',
      'api-gateway',
      'kubernetes',
      'postgres',
      'redis',
      'kafka',
      'nginx',
      'blackbox-exporter',
    ];
    const regions = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'];

    const allGroups: PromRuleGroup[] = [];

    // Helper to generate rules for a workspace
    const generateWorkspaceRules = (wsId: string, wsName: string, ruleCount: number) => {
      const groupCount = Math.ceil(ruleCount / 5);
      for (let g = 0; g < groupCount; g++) {
        const groupName = `${wsName}_alerts_group_${g}`;
        const rules: PromAlertingRule[] = [];
        const rulesInGroup = Math.min(5, ruleCount - g * 5);

        for (let r = 0; r < rulesInGroup; r++) {
          const idx = g * 5 + r;
          const sev = severities[idx % severities.length];
          const team = teams[idx % teams.length];
          const service = services[idx % services.length];
          const region = regions[idx % regions.length];
          const state = idx < 3 ? 'firing' : idx < 6 ? 'pending' : 'inactive';
          const ruleName = `${wsName}_rule_${idx}_${service}`;

          const alerts: PromAlert[] = [];
          if (state === 'firing' || state === 'pending') {
            alerts.push({
              labels: {
                alertname: ruleName,
                severity: sev,
                team,
                service,
                environment: wsName,
                region,
                instance: `i-${idx.toString(16).padStart(7, '0')}:9100`,
                _workspace: wsId,
              },
              annotations: { summary: `${ruleName} on ${service}` },
              state,
              activeAt: state === 'firing' ? fiveMinAgo : now,
              value: `${(Math.random() * 100).toFixed(1)}`,
            });
          }

          rules.push({
            type: 'alerting',
            name: ruleName,
            health: 'ok',
            state,
            query: `some_metric{service="${service}",workspace="${wsName}"} > ${50 + idx}`,
            duration: 300,
            labels: {
              severity: sev,
              team,
              service,
              environment: wsName,
              region,
              application: 'platform',
              _workspace: wsId,
            },
            annotations: { summary: `${ruleName} alert on ${service}` },
            alerts,
            lastEvaluation: fiveMinAgo,
            evaluationTime: 0.002,
          });
        }

        allGroups.push({
          name: groupName,
          file: `/etc/prometheus/rules/${wsId}/${wsName}_${g}.yml`,
          interval: 60,
          rules,
        });
      }
    };

    // Production: 30 rules, Staging: 15 rules, Dev: 10 rules = 55 total
    generateWorkspaceRules(wsProduction.id, 'production', 30);
    generateWorkspaceRules(wsStaging.id, 'staging', 15);
    generateWorkspaceRules(wsDev.id, 'development', 10);

    // Also add the original hand-crafted rules for production workspace
    const handcraftedGroups: PromRuleGroup[] = [
      {
        name: 'node_alerts',
        file: `/etc/prometheus/rules/${wsProduction.id}/node.yml`,
        interval: 60,
        rules: [
          {
            type: 'alerting',
            name: 'HighCpuUsage',
            health: 'ok',
            state: 'firing',
            query:
              '100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80',
            duration: 300,
            labels: {
              severity: 'warning',
              team: 'infra',
              service: 'node-exporter',
              environment: 'production',
              region: 'us-east-1',
              application: 'platform',
              _workspace: wsProduction.id,
            },
            annotations: {
              summary: 'CPU usage above 80% on {{ $labels.instance }}',
              runbook_url: 'https://wiki.example.com/runbooks/high-cpu',
            },
            alerts: [
              {
                labels: {
                  alertname: 'HighCpuUsage',
                  instance: 'i-0abc123:9100',
                  severity: 'warning',
                  team: 'infra',
                  service: 'node-exporter',
                  environment: 'production',
                  region: 'us-east-1',
                  _workspace: wsProduction.id,
                },
                annotations: { summary: 'CPU usage above 80% on i-0abc123:9100' },
                state: 'firing',
                activeAt: fiveMinAgo,
                value: '92.3',
              },
            ],
            lastEvaluation: fiveMinAgo,
            evaluationTime: 0.003,
          },
          {
            type: 'alerting',
            name: 'HighMemoryUsage',
            health: 'ok',
            state: 'firing',
            query: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 90',
            duration: 600,
            labels: {
              severity: 'critical',
              team: 'infra',
              service: 'node-exporter',
              environment: 'production',
              region: 'us-east-1',
              application: 'platform',
              _workspace: wsProduction.id,
            },
            annotations: {
              summary: 'Memory usage above 90% on {{ $labels.instance }}',
              runbook_url: 'https://wiki.example.com/runbooks/high-memory',
            },
            alerts: [
              {
                labels: {
                  alertname: 'HighMemoryUsage',
                  instance: 'i-0def456:9100',
                  severity: 'critical',
                  team: 'infra',
                  service: 'node-exporter',
                  environment: 'production',
                  region: 'us-east-1',
                  _workspace: wsProduction.id,
                },
                annotations: { summary: 'Memory usage above 90% on i-0def456:9100' },
                state: 'firing',
                activeAt: tenMinAgo,
                value: '94.7',
              },
            ],
            lastEvaluation: fiveMinAgo,
            evaluationTime: 0.002,
          },
        ],
      },
      {
        name: 'app_alerts',
        file: `/etc/prometheus/rules/${wsProduction.id}/app.yml`,
        interval: 30,
        rules: [
          {
            type: 'alerting',
            name: 'HighErrorRate',
            health: 'ok',
            state: 'firing',
            query:
              'sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05',
            duration: 300,
            labels: {
              severity: 'critical',
              team: 'platform',
              service: 'api-gateway',
              environment: 'production',
              region: 'us-east-1',
              application: 'checkout',
              _workspace: wsProduction.id,
            },
            annotations: {
              summary: 'Error rate above 5%',
              runbook_url: 'https://wiki.example.com/runbooks/high-error-rate',
            },
            alerts: [
              {
                labels: {
                  alertname: 'HighErrorRate',
                  severity: 'critical',
                  team: 'platform',
                  service: 'api-gateway',
                  environment: 'production',
                  region: 'us-east-1',
                  _workspace: wsProduction.id,
                },
                annotations: { summary: 'Error rate above 5%' },
                state: 'firing',
                activeAt: fiveMinAgo,
                value: '0.082',
              },
            ],
            lastEvaluation: fiveMinAgo,
            evaluationTime: 0.005,
          },
          {
            type: 'alerting',
            name: 'PodCrashLooping',
            health: 'ok',
            state: 'firing',
            query: 'rate(kube_pod_container_status_restarts_total[15m]) * 60 * 5 > 0',
            duration: 900,
            labels: {
              severity: 'critical',
              team: 'sre',
              service: 'kubernetes',
              environment: 'production',
              region: 'us-east-1',
              application: 'order-service',
              _workspace: wsProduction.id,
            },
            annotations: { summary: 'Pod {{ $labels.pod }} is crash looping' },
            alerts: [
              {
                labels: {
                  alertname: 'PodCrashLooping',
                  severity: 'critical',
                  team: 'sre',
                  pod: 'order-service-7d4f8b-x2k9p',
                  namespace: 'production',
                  service: 'kubernetes',
                  environment: 'production',
                  region: 'us-east-1',
                  _workspace: wsProduction.id,
                },
                annotations: { summary: 'Pod order-service-7d4f8b-x2k9p is crash looping' },
                state: 'firing',
                activeAt: tenMinAgo,
                value: '3',
              },
            ],
            lastEvaluation: fiveMinAgo,
            evaluationTime: 0.002,
          },
        ],
      },
    ];

    allGroups.push(...handcraftedGroups);
    this.ruleGroups.set(dsId, allGroups);

    // Active alerts = all firing/pending alerts from all rules
    const active: PromAlert[] = [];
    for (const g of allGroups) {
      for (const r of g.rules) {
        if (r.type === 'alerting') {
          for (const a of r.alerts) {
            if (a.state === 'firing' || a.state === 'pending') {
              active.push(a);
            }
          }
        }
      }
    }
    this.activeAlerts.set(dsId, active);
  }

  // ---- PrometheusMetadataProvider methods ----

  async getMetricNames(_client: AlertingOSClient, _ds: Datasource): Promise<string[]> {
    return [...MOCK_METRICS];
  }

  async getLabelNames(
    _client: AlertingOSClient,
    _ds: Datasource,
    metric?: string
  ): Promise<string[]> {
    // In a real backend, label names would be filtered by metric.
    // For mock mode, return all label names but optionally filter some out
    // if a metric is provided (simulate a smaller set).
    if (metric) {
      // Return a subset — the labels most likely to exist on any metric
      return MOCK_LABEL_NAMES.filter(
        (l) => !['cpu', 'mode', 'device', 'mountpoint', 'fstype', 'le', 'quantile'].includes(l)
      );
    }
    return [...MOCK_LABEL_NAMES];
  }

  async getLabelValues(
    _client: AlertingOSClient,
    _ds: Datasource,
    labelName: string,
    _selector?: string
  ): Promise<string[]> {
    const values = MOCK_LABEL_VALUES[labelName];
    return values ? [...values] : [];
  }

  async getMetricMetadata(
    _client: AlertingOSClient,
    _ds: Datasource
  ): Promise<PrometheusMetricMetadata[]> {
    return MOCK_METRICS.map((metric) => ({
      metric,
      type: inferMetricType(metric),
      help: `Mock help text for ${metric}`,
    }));
  }

  async getAlertmanagerStatus(_client: AlertingOSClient): Promise<AlertmanagerStatus> {
    return {
      cluster: {
        status: 'ready',
        peers: [{ name: 'alertmanager-0', address: '10.0.0.1:9094' }],
      },
      config: {
        original: [
          'global:',
          '  resolve_timeout: 5m',
          'route:',
          '  receiver: default-receiver',
          '  group_by: [alertname, cluster, service]',
          '  group_wait: 30s',
          '  group_interval: 5m',
          '  repeat_interval: 4h',
          '  routes:',
          '    - receiver: critical-slack',
          '      match:',
          '        severity: critical',
          '      group_wait: 10s',
          '      continue: false',
          '    - receiver: warning-email',
          '      match:',
          '        severity: warning',
          '      group_wait: 1m',
          '      continue: true',
          'receivers:',
          '  - name: default-receiver',
          '    webhook_configs:',
          '      - url: http://localhost:5603/api/webhooks/alertmanager',
          '  - name: critical-slack',
          '    slack_configs:',
          '      - channel: "#critical-alerts"',
          '  - name: warning-email',
          '    email_configs:',
          '      - to: oncall@example.com',
          'inhibit_rules:',
          '  - source_match:',
          '      severity: critical',
          '    target_match:',
          '      severity: warning',
          '    equal: [alertname, cluster, service]',
        ].join('\n'),
      },
      uptime: new Date(Date.now() - 48 * 3600_000).toISOString(),
      versionInfo: { version: '0.27.0', branch: 'HEAD', buildDate: '2024-03-15' },
    };
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** Infer Prometheus metric type from name suffix heuristics. */
function inferMetricType(name: string): PrometheusMetricMetadata['type'] {
  if (name.endsWith('_total') || name.endsWith('_count')) return 'counter';
  if (name.endsWith('_bucket')) return 'histogram';
  if (name.endsWith('_sum')) return 'counter'; // histogram/summary sub-metric
  if (
    name.endsWith('_bytes') ||
    name.endsWith('_seconds') ||
    name.endsWith('_ratio') ||
    name.endsWith('_percent') ||
    name.endsWith('_info') ||
    name === 'up'
  )
    return 'gauge';
  if (name.includes('duration') || name.includes('latency')) return 'histogram';
  return 'gauge'; // default assumption for unknown metrics
}

// ============================================================================
// Helpers
// ============================================================================
/** Infer Prometheus metric type from name suffix heuristics. */
function inferMetricType(name: string): PrometheusMetricMetadata['type'] {
  if (name.endsWith('_total') || name.endsWith('_count')) return 'counter';
  if (name.endsWith('_bucket')) return 'histogram';
  if (name.endsWith('_sum')) return 'counter'; // histogram/summary sub-metric
  if (
    name.endsWith('_bytes') ||
    name.endsWith('_seconds') ||
    name.endsWith('_ratio') ||
    name.endsWith('_percent') ||
    name.endsWith('_info') ||
    name === 'up'
  )
    return 'gauge';
  if (name.includes('duration') || name.includes('latency')) return 'histogram';
  return 'gauge'; // default assumption for unknown metrics
}

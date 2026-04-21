/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mock backends — simulate real OpenSearch Alerting and Prometheus API responses.
 */
import {
  Datasource,
  Logger,
  OpenSearchBackend,
  OSMonitor,
  OSAlert,
  OSDestination,
} from '../../../common/types/alerting/types';

let idCounter = 100;
const nextId = () => `mock-${++idCounter}`;

// ============================================================================
// Mock OpenSearch Alerting Backend
// ============================================================================

export class MockOpenSearchBackend implements OpenSearchBackend {
  readonly type = 'opensearch' as const;
  private monitors: Map<string, Map<string, OSMonitor>> = new Map(); // dsId -> monitorId -> monitor
  private alerts: Map<string, OSAlert[]> = new Map(); // dsId -> alerts
  private destinations: Map<string, Map<string, OSDestination>> = new Map();
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  // --- Monitors ---

  async getMonitors(ds: Datasource): Promise<OSMonitor[]> {
    return Array.from(this.monitors.get(ds.id)?.values() ?? []);
  }

  async getMonitor(ds: Datasource, monitorId: string): Promise<OSMonitor | null> {
    return this.monitors.get(ds.id)?.get(monitorId) ?? null;
  }

  async createMonitor(ds: Datasource, input: Omit<OSMonitor, 'id'>): Promise<OSMonitor> {
    const id = nextId();
    const monitor: OSMonitor = { ...input, id };
    if (!this.monitors.has(ds.id)) this.monitors.set(ds.id, new Map());
    this.monitors.get(ds.id)!.set(id, monitor);
    this.logger.info(`[OS Mock] Created monitor ${id} for ${ds.id}`);
    return monitor;
  }

  async updateMonitor(
    ds: Datasource,
    monitorId: string,
    input: Partial<OSMonitor>
  ): Promise<OSMonitor | null> {
    const m = this.monitors.get(ds.id)?.get(monitorId);
    if (!m) return null;
    Object.assign(m, input, { last_update_time: Date.now() });
    return m;
  }

  async deleteMonitor(ds: Datasource, monitorId: string): Promise<boolean> {
    return this.monitors.get(ds.id)?.delete(monitorId) ?? false;
  }

  async runMonitor(ds: Datasource, monitorId: string, _dryRun?: boolean): Promise<unknown> {
    // Return a realistic execution result based on monitor type
    const monitor = this.monitors.get(ds.id)?.get(monitorId);
    if (monitor) {
      const input = monitor.inputs[0];
      if (input && 'uri' in input) {
        // Cluster metrics monitor — simulate API result
        if (input.uri.api_type === 'CLUSTER_HEALTH') {
          return {
            input_results: {
              results: [
                {
                  cluster_name: 'opensearch-cluster',
                  status: 'yellow',
                  number_of_nodes: 5,
                  active_primary_shards: 42,
                  active_shards: 84,
                  unassigned_shards: 3,
                  number_of_pending_tasks: 0,
                },
              ],
            },
            trigger_results: {
              [monitor.triggers[0]?.id || 'trigger-1']: { triggered: true },
            },
            period_start: new Date(Date.now() - 60_000).toISOString(),
            period_end: new Date().toISOString(),
          };
        }
        // Other cluster metrics (nodes stats, etc.)
        return {
          input_results: {
            results: [{ number_of_nodes: 5 }],
          },
          trigger_results: {
            [monitor.triggers[0]?.id || 'trigger-1']: { triggered: false },
          },
          period_start: new Date(Date.now() - 60_000).toISOString(),
          period_end: new Date().toISOString(),
        };
      }
    }
    return {
      input_results: {
        results: [{ hits: { total: { value: 25 }, hits: [] } }],
      },
      trigger_results: {},
      period_start: Date.now() - 300_000,
      period_end: Date.now(),
    };
  }

  async searchQuery(
    _ds: Datasource,
    _indices: string[],
    _body: Record<string, unknown>
  ): Promise<unknown> {
    // Generate 12 realistic time-series buckets over the last hour
    const now = Date.now();
    const bucketIntervalMs = 5 * 60_000; // 5-minute buckets
    const bucketCount = 12;
    const buckets = Array.from({ length: bucketCount }, (_, i) => {
      const key = now - (bucketCount - 1 - i) * bucketIntervalMs;
      // Simulate varying doc counts with a realistic pattern
      const baseValue = 15 + Math.floor(Math.sin(i * 0.8) * 10 + Math.random() * 5);
      return {
        key,
        key_as_string: new Date(key).toISOString(),
        doc_count: Math.max(0, baseValue),
      };
    });
    return {
      hits: { total: { value: buckets.reduce((sum, b) => sum + b.doc_count, 0) }, hits: [] },
      aggregations: {
        time_buckets: { buckets },
      },
    };
  }

  // --- Alerts ---

  async getAlerts(ds: Datasource): Promise<{ alerts: OSAlert[]; totalAlerts: number }> {
    const alerts = this.alerts.get(ds.id) ?? [];
    return { alerts, totalAlerts: alerts.length };
  }

  async acknowledgeAlerts(ds: Datasource, _monitorId: string, alertIds: string[]): Promise<any> {
    const alerts = this.alerts.get(ds.id) ?? [];
    for (const a of alerts) {
      if (alertIds.includes(a.id)) {
        a.state = 'ACKNOWLEDGED';
        a.acknowledged_time = Date.now();
      }
    }
    return { success: true };
  }

  // --- Destinations ---

  async getDestinations(ds: Datasource): Promise<OSDestination[]> {
    return Array.from(this.destinations.get(ds.id)?.values() ?? []);
  }

  async createDestination(
    ds: Datasource,
    input: Omit<OSDestination, 'id'>
  ): Promise<OSDestination> {
    const id = nextId();
    const dest: OSDestination = { ...input, id };
    if (!this.destinations.has(ds.id)) this.destinations.set(ds.id, new Map());
    this.destinations.get(ds.id)!.set(id, dest);
    return dest;
  }

  async deleteDestination(ds: Datasource, destId: string): Promise<boolean> {
    return this.destinations.get(ds.id)?.delete(destId) ?? false;
  }

  // --- Seeding ---

  seed(dsId: string): void {
    const now = Date.now();
    const fiveMinAgo = now - 5 * 60_000;
    const oneHourAgo = now - 60 * 60_000;
    const oneDayAgo = now - 24 * 60 * 60_000;
    const threeDaysAgo = now - 3 * 24 * 60 * 60_000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60_000;

    // Destinations
    if (!this.destinations.has(dsId)) this.destinations.set(dsId, new Map());
    const slackDest: OSDestination = {
      id: nextId(),
      type: 'slack',
      name: 'ops-alerts-slack',
      last_update_time: now,
      slack: { url: 'https://hooks.slack.com/services/xxx' },
    };
    const emailDest: OSDestination = {
      id: nextId(),
      type: 'email',
      name: 'oncall-email',
      last_update_time: now,
      email: { recipients: ['oncall@example.com'] },
    };
    this.destinations.get(dsId)!.set(slackDest.id, slackDest);
    this.destinations.get(dsId)!.set(emailDest.id, emailDest);

    // Monitors
    if (!this.monitors.has(dsId)) this.monitors.set(dsId, new Map());
    const monitors: OSMonitor[] = [
      {
        id: nextId(),
        type: 'monitor',
        monitor_type: 'query_level_monitor',
        name: 'High Error Rate',
        enabled: true,
        last_update_time: now,
        schedule: { period: { interval: 1, unit: 'MINUTES' } },
        inputs: [
          {
            search: {
              indices: ['logs-*'],
              query: {
                query: {
                  bool: {
                    filter: [
                      {
                        range: {
                          '@timestamp': {
                            gte: '{{period_end}}||-5m',
                            lte: '{{period_end}}',
                            format: 'epoch_millis',
                          },
                        },
                      },
                    ],
                  },
                },
                size: 0,
                aggs: { error_count: { filter: { range: { status: { gte: 500 } } } } },
              },
            },
          },
        ],
        triggers: [
          {
            id: nextId(),
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
                id: nextId(),
                name: 'Notify Slack',
                destination_id: slackDest.id,
                message_template: {
                  source:
                    'High error rate: {{ctx.results[0].aggregations.error_count.doc_count}} errors in last 5m',
                },
                throttle_enabled: true,
                throttle: { value: 10, unit: 'MINUTES' },
              },
            ],
          },
        ],
      },
      {
        id: nextId(),
        type: 'monitor',
        monitor_type: 'query_level_monitor',
        name: 'Slow Response Time',
        enabled: true,
        last_update_time: now,
        schedule: { period: { interval: 5, unit: 'MINUTES' } },
        inputs: [
          {
            search: {
              indices: ['apm-*'],
              query: {
                query: {
                  bool: {
                    filter: [
                      {
                        range: {
                          '@timestamp': {
                            gte: '{{period_end}}||-10m',
                            lte: '{{period_end}}',
                            format: 'epoch_millis',
                          },
                        },
                      },
                    ],
                  },
                },
                size: 0,
                aggs: { avg_latency: { avg: { field: 'transaction.duration.us' } } },
              },
            },
          },
        ],
        triggers: [
          {
            id: nextId(),
            name: 'Avg latency > 5s',
            severity: '2',
            condition: {
              script: {
                source: 'ctx.results[0].aggregations.avg_latency.value > 5000000',
                lang: 'painless',
              },
            },
            actions: [
              {
                id: nextId(),
                name: 'Notify Slack',
                destination_id: slackDest.id,
                message_template: {
                  source: 'Slow responses: avg {{ctx.results[0].aggregations.avg_latency.value}}us',
                },
                throttle_enabled: false,
              },
            ],
          },
        ],
      },
      {
        id: nextId(),
        type: 'monitor',
        monitor_type: 'bucket_level_monitor',
        name: 'Disk Usage by Host',
        enabled: false,
        last_update_time: oneHourAgo,
        schedule: { period: { interval: 15, unit: 'MINUTES' } },
        inputs: [
          {
            search: {
              indices: ['metrics-*'],
              query: {
                size: 0,
                query: { match_all: {} },
                aggs: {
                  hosts: {
                    terms: { field: 'host.name' },
                    aggs: { disk_pct: { avg: { field: 'system.filesystem.used.pct' } } },
                  },
                },
              },
            },
          },
        ],
        triggers: [
          {
            id: nextId(),
            name: 'Disk > 90%',
            severity: '2',
            condition: {
              script: { source: 'params._count > 0 && params.disk_pct > 0.9', lang: 'painless' },
            },
            actions: [],
          },
        ],
      },
      {
        id: nextId(),
        type: 'monitor',
        monitor_type: 'query_level_monitor',
        name: 'Authentication Failures',
        enabled: true,
        last_update_time: oneDayAgo,
        schedule: { period: { interval: 5, unit: 'MINUTES' } },
        inputs: [
          {
            search: {
              indices: ['security-*'],
              query: {
                query: {
                  bool: { filter: [{ term: { 'event.action': 'authentication_failure' } }] },
                },
                size: 0,
              },
            },
          },
        ],
        triggers: [
          {
            id: nextId(),
            name: 'Auth failures > 50',
            severity: '1',
            condition: {
              script: { source: 'ctx.results[0].hits.total.value > 50', lang: 'painless' },
            },
            actions: [
              {
                id: nextId(),
                name: 'Notify Slack',
                destination_id: slackDest.id,
                message_template: { source: 'Auth failures spike detected' },
                throttle_enabled: true,
                throttle: { value: 15, unit: 'MINUTES' },
              },
              {
                id: nextId(),
                name: 'Email Oncall',
                destination_id: emailDest.id,
                message_template: { source: 'Auth failures spike detected' },
                throttle_enabled: false,
              },
            ],
          },
        ],
      },
      {
        id: nextId(),
        type: 'monitor',
        monitor_type: 'query_level_monitor',
        name: 'Payment Processing Errors',
        enabled: true,
        last_update_time: threeDaysAgo,
        schedule: { period: { interval: 1, unit: 'MINUTES' } },
        inputs: [
          {
            search: {
              indices: ['payments-*'],
              query: { query: { bool: { filter: [{ term: { status: 'failed' } }] } }, size: 0 },
            },
          },
        ],
        triggers: [
          {
            id: nextId(),
            name: 'Payment errors > 10',
            severity: '1',
            condition: {
              script: { source: 'ctx.results[0].hits.total.value > 10', lang: 'painless' },
            },
            actions: [
              {
                id: nextId(),
                name: 'Email Oncall',
                destination_id: emailDest.id,
                message_template: { source: 'Payment processing errors detected' },
                throttle_enabled: false,
              },
            ],
          },
        ],
      },
      {
        id: nextId(),
        type: 'monitor',
        monitor_type: 'doc_level_monitor',
        name: 'Log Anomaly Detection',
        enabled: true,
        last_update_time: oneWeekAgo,
        schedule: { period: { interval: 10, unit: 'MINUTES' } },
        inputs: [
          {
            doc_level_input: {
              description: 'Detect anomalous log patterns across application logs',
              indices: ['logs-*', 'ss4o_logs-*'],
              queries: [
                {
                  id: 'dlq-1',
                  name: 'Critical errors',
                  query: '{ "match": { "level": "CRITICAL" } }',
                  tags: ['severity:critical', 'auto-remediate'],
                },
                {
                  id: 'dlq-2',
                  name: 'OOM events',
                  query: '{ "match_phrase": { "message": "OutOfMemoryError" } }',
                  tags: ['severity:high', 'memory'],
                },
                {
                  id: 'dlq-3',
                  name: 'Timeout patterns',
                  query:
                    '{ "bool": { "should": [{ "match_phrase": { "message": "timed out" } }, { "match_phrase": { "message": "deadline exceeded" } }] } }',
                  tags: ['severity:medium', 'latency'],
                },
              ],
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock doc_level_input shape
          } as any,
        ],
        triggers: [
          {
            id: nextId(),
            name: 'Anomaly score > 0.8',
            severity: '3',
            condition: {
              script: { source: 'ctx.results[0].anomaly_score > 0.8', lang: 'painless' },
            },
            actions: [
              {
                id: nextId(),
                name: 'Notify Slack',
                destination_id: slackDest.id,
                message_template: { source: 'Log anomaly detected' },
                throttle_enabled: true,
                throttle: { value: 30, unit: 'MINUTES' },
              },
            ],
          },
        ],
      },
      // --- Cluster Metrics Monitor ---
      {
        id: nextId(),
        type: 'monitor',
        monitor_type: 'query_level_monitor',
        name: 'Cluster Health Status',
        enabled: true,
        last_update_time: now,
        schedule: { period: { interval: 1, unit: 'MINUTES' } },
        inputs: [
          {
            uri: {
              api_type: 'CLUSTER_HEALTH',
              path: '_cluster/health',
              path_params: '',
              url: '',
              clusters: [],
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock cluster metrics URI input
          } as any,
        ],
        triggers: [
          {
            id: nextId(),
            name: 'Cluster not green',
            severity: '1',
            condition: {
              script: {
                source: "ctx.results[0].status != 'green'",
                lang: 'painless',
              },
            },
            actions: [
              {
                id: nextId(),
                name: 'Notify Slack',
                destination_id: slackDest.id,
                message_template: {
                  source:
                    'Cluster health is {{ctx.results[0].status}} — {{ctx.results[0].number_of_nodes}} nodes, {{ctx.results[0].unassigned_shards}} unassigned shards',
                },
                throttle_enabled: true,
                throttle: { value: 5, unit: 'MINUTES' },
              },
              {
                id: nextId(),
                name: 'Email Oncall',
                destination_id: emailDest.id,
                message_template: {
                  source: 'URGENT: Cluster health degraded to {{ctx.results[0].status}}',
                },
                throttle_enabled: false,
              },
            ],
          },
        ],
      },
      // --- Cluster Metrics: Nodes Stats ---
      {
        id: nextId(),
        type: 'monitor',
        monitor_type: 'query_level_monitor',
        name: 'Node JVM Heap Pressure',
        enabled: true,
        last_update_time: oneDayAgo,
        schedule: { period: { interval: 5, unit: 'MINUTES' } },
        inputs: [
          {
            uri: {
              api_type: 'NODES_STATS',
              path: '_nodes/stats/jvm',
              path_params: '',
              url: '',
              clusters: [],
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock nodes stats URI input
          } as any,
        ],
        triggers: [
          {
            id: nextId(),
            name: 'JVM heap > 85%',
            severity: '2',
            condition: {
              script: {
                source:
                  'ctx.results[0].nodes.values().stream().anyMatch(n -> n.jvm.mem.heap_used_percent > 85)',
                lang: 'painless',
              },
            },
            actions: [
              {
                id: nextId(),
                name: 'Notify Slack',
                destination_id: slackDest.id,
                message_template: {
                  source:
                    'JVM heap pressure detected on one or more nodes — check _nodes/stats/jvm',
                },
                throttle_enabled: true,
                throttle: { value: 15, unit: 'MINUTES' },
              },
            ],
          },
        ],
      },
      // --- Bucket-Level: CPU by Service ---
      {
        id: nextId(),
        type: 'monitor',
        monitor_type: 'bucket_level_monitor',
        name: 'CPU Usage by Service',
        enabled: true,
        last_update_time: oneHourAgo,
        schedule: { period: { interval: 5, unit: 'MINUTES' } },
        inputs: [
          {
            search: {
              indices: ['metrics-*', 'ss4o_metrics-*'],
              query: {
                size: 0,
                query: {
                  bool: {
                    filter: [
                      {
                        range: {
                          '@timestamp': {
                            gte: '{{period_end}}||-10m',
                            lte: '{{period_end}}',
                            format: 'epoch_millis',
                          },
                        },
                      },
                    ],
                  },
                },
                aggs: {
                  services: {
                    terms: { field: 'service.name', size: 50 },
                    aggs: {
                      avg_cpu: { avg: { field: 'system.cpu.total.pct' } },
                      max_cpu: { max: { field: 'system.cpu.total.pct' } },
                    },
                  },
                },
              },
            },
          },
        ],
        triggers: [
          {
            id: nextId(),
            name: 'Service CPU > 80%',
            severity: '2',
            condition: {
              script: {
                source: 'params._count > 0 && params.avg_cpu > 0.8',
                lang: 'painless',
              },
            },
            actions: [
              {
                id: nextId(),
                name: 'Notify Slack',
                destination_id: slackDest.id,
                message_template: {
                  source: 'Service {{bucket_keys}} averaging {{params.avg_cpu}}% CPU over last 10m',
                },
                throttle_enabled: true,
                throttle: { value: 10, unit: 'MINUTES' },
              },
            ],
          },
        ],
      },
      // --- Document-Level: Security audit events ---
      {
        id: nextId(),
        type: 'monitor',
        monitor_type: 'doc_level_monitor',
        name: 'Security Audit Events',
        enabled: true,
        last_update_time: threeDaysAgo,
        schedule: { period: { interval: 1, unit: 'MINUTES' } },
        inputs: [
          {
            doc_level_input: {
              description: 'Monitor security-sensitive events in audit logs',
              indices: ['security-auditlog-*'],
              queries: [
                {
                  id: 'sec-1',
                  name: 'Privilege escalation',
                  query: '{ "match": { "event.action": "role_escalation" } }',
                  tags: ['compliance', 'severity:critical'],
                },
                {
                  id: 'sec-2',
                  name: 'Bulk data export',
                  query: '{ "range": { "response.bytes": { "gte": 104857600 } } }',
                  tags: ['data-exfiltration', 'severity:high'],
                },
              ],
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock doc_level_input shape
          } as any,
        ],
        triggers: [
          {
            id: nextId(),
            name: 'Security event detected',
            severity: '1',
            condition: {
              script: {
                source: 'ctx.results[0].hits.total.value > 0',
                lang: 'painless',
              },
            },
            actions: [
              {
                id: nextId(),
                name: 'Email Oncall',
                destination_id: emailDest.id,
                message_template: {
                  source:
                    'Security audit event: {{ctx.results[0].hits.hits[0]._source.event.action}}',
                },
                throttle_enabled: false,
              },
              {
                id: nextId(),
                name: 'Notify Slack',
                destination_id: slackDest.id,
                message_template: { source: 'Security audit event detected — check audit logs' },
                throttle_enabled: true,
                throttle: { value: 5, unit: 'MINUTES' },
              },
            ],
          },
        ],
      },
    ];
    for (const m of monitors) this.monitors.get(dsId)!.set(m.id, m);

    // Alerts
    const osAlerts: OSAlert[] = [
      {
        id: nextId(),
        version: 1,
        monitor_id: monitors[0].id,
        monitor_name: monitors[0].name,
        monitor_version: 1,
        trigger_id: monitors[0].triggers[0].id,
        trigger_name: monitors[0].triggers[0].name,
        state: 'ACTIVE',
        severity: '1',
        error_message: null,
        start_time: fiveMinAgo,
        last_notification_time: now,
        end_time: null,
        acknowledged_time: null,
        action_execution_results: [
          {
            action_id: monitors[0].triggers[0].actions[0].id,
            last_execution_time: now,
            throttled_count: 2,
          },
        ],
      },
      {
        id: nextId(),
        version: 3,
        monitor_id: monitors[1].id,
        monitor_name: monitors[1].name,
        monitor_version: 1,
        trigger_id: monitors[1].triggers[0].id,
        trigger_name: monitors[1].triggers[0].name,
        state: 'ACKNOWLEDGED',
        severity: '2',
        error_message: null,
        start_time: oneHourAgo,
        last_notification_time: fiveMinAgo,
        end_time: null,
        acknowledged_time: fiveMinAgo,
        action_execution_results: [],
      },
      {
        id: nextId(),
        version: 1,
        monitor_id: monitors[3].id,
        monitor_name: monitors[3].name,
        monitor_version: 1,
        trigger_id: monitors[3].triggers[0].id,
        trigger_name: monitors[3].triggers[0].name,
        state: 'ACTIVE',
        severity: '1',
        error_message: null,
        start_time: oneDayAgo,
        last_notification_time: now,
        end_time: null,
        acknowledged_time: null,
        action_execution_results: [],
      },
      // Alert for Cluster Health Status monitor (index 6)
      {
        id: nextId(),
        version: 1,
        monitor_id: monitors[6].id,
        monitor_name: monitors[6].name,
        monitor_version: 1,
        trigger_id: monitors[6].triggers[0].id,
        trigger_name: monitors[6].triggers[0].name,
        state: 'ACTIVE',
        severity: '1',
        error_message: null,
        start_time: fiveMinAgo,
        last_notification_time: now,
        end_time: null,
        acknowledged_time: null,
        action_execution_results: [
          {
            action_id: monitors[6].triggers[0].actions[0].id,
            last_execution_time: now,
            throttled_count: 1,
          },
        ],
      },
      // Alert for Security Audit Events monitor (index 9)
      {
        id: nextId(),
        version: 1,
        monitor_id: monitors[9].id,
        monitor_name: monitors[9].name,
        monitor_version: 1,
        trigger_id: monitors[9].triggers[0].id,
        trigger_name: monitors[9].triggers[0].name,
        state: 'ACTIVE',
        severity: '1',
        error_message: null,
        start_time: oneHourAgo,
        last_notification_time: fiveMinAgo,
        end_time: null,
        acknowledged_time: null,
        action_execution_results: [],
      },
      // Alert for CPU by Service bucket monitor (index 8)
      {
        id: nextId(),
        version: 1,
        monitor_id: monitors[8].id,
        monitor_name: monitors[8].name,
        monitor_version: 1,
        trigger_id: monitors[8].triggers[0].id,
        trigger_name: monitors[8].triggers[0].name,
        state: 'ACKNOWLEDGED',
        severity: '2',
        error_message: null,
        start_time: oneHourAgo,
        last_notification_time: oneHourAgo,
        end_time: null,
        acknowledged_time: fiveMinAgo,
        action_execution_results: [],
      },
    ];
    this.alerts.set(dsId, osAlerts);
  }
}

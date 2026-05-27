/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alert template catalog for the Monitor Template Wizard. Defines the
 * `AlertTemplate` + `ApplicationCategory` shapes and the full static
 * `APPLICATION_CATALOG` — OTEL-aligned application buckets with their
 * preconfigured alert rules (CPU high, memory high, 5xx rate, etc.).
 *
 * Pure TS — no React / JSX imports — so tests and other utilities can
 * import the catalog without pulling in the wizard UI.
 *
 * Note: the `runbook_url` annotation was removed from every template per
 * reviewer feedback (Comment 14) — the previous `runbooks.example.com`
 * URLs were placeholder links and confused users.
 */
import { i18n } from '@osd/i18n';
import { UnifiedAlertSeverity } from '../../../../common/types/alerting';

// ============================================================================
// OTEL Application Categories & Preconfigured Alert Templates
// ============================================================================

export interface AlertTemplate {
  id: string;
  name: string;
  description: string;
  query: string;
  condition: string;
  severity: UnifiedAlertSeverity;
  forDuration: string;
  evaluationInterval: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  requiredMetrics: string[];
  otelSignal: 'metrics' | 'traces' | 'logs';
}

export interface ApplicationCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  otelNamespace: string;
  metricPrefixes: string[];
  discoveredMetrics: string[];
  templates: AlertTemplate[];
  color: string;
}

// All known OTEL-aligned application categories with their alert templates
export const APPLICATION_CATALOG: Array<Omit<ApplicationCategory, 'discoveredMetrics'>> = [
  {
    id: 'host',
    name: i18n.translate(
      'observability.alerting.monitorTemplateWizard.templates.category.host.name',
      {
        defaultMessage: 'Host / Node',
      }
    ),
    icon: 'compute',
    description: i18n.translate(
      'observability.alerting.monitorTemplateWizard.templates.category.host.description',
      {
        defaultMessage:
          'System-level metrics from node_exporter following OTEL system.* conventions',
      }
    ),
    otelNamespace: 'system',
    metricPrefixes: ['node_', 'system_'],
    color: '#0077CC',
    templates: [
      {
        id: 'host-cpu-high',
        name: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.host.cpuHigh.name',
          { defaultMessage: 'High CPU Usage' }
        ),
        description: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.host.cpuHigh.description',
          {
            defaultMessage:
              'CPU utilization exceeds 85% for sustained period, indicating potential resource exhaustion',
          }
        ),
        query: '100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
        condition: '> 85',
        severity: 'high',
        forDuration: '5m',
        evaluationInterval: '1m',
        labels: { severity: 'high', category: 'infrastructure', otel_signal: 'metrics' },
        annotations: {
          summary: 'High CPU usage on {{ $labels.instance }}',
          description:
            'CPU usage is above 85% for more than 5 minutes on {{ $labels.instance }}. Current value: {{ $value }}%',
        },
        requiredMetrics: ['node_cpu_seconds_total'],
        otelSignal: 'metrics',
      },
      {
        id: 'host-memory-high',
        name: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.host.memoryHigh.name',
          { defaultMessage: 'High Memory Usage' }
        ),
        description: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.host.memoryHigh.description',
          {
            defaultMessage: 'Available memory drops below 15% of total, risk of OOM kills',
          }
        ),
        query: '(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100',
        condition: '> 85',
        severity: 'high',
        forDuration: '5m',
        evaluationInterval: '1m',
        labels: { severity: 'high', category: 'infrastructure', otel_signal: 'metrics' },
        annotations: {
          summary: 'High memory usage on {{ $labels.instance }}',
          description:
            'Memory usage is above 85% on {{ $labels.instance }}. Available: {{ $value }}%',
        },
        requiredMetrics: ['node_memory_MemAvailable_bytes', 'node_memory_MemTotal_bytes'],
        otelSignal: 'metrics',
      },
      {
        id: 'host-disk-space',
        name: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.host.diskSpace.name',
          { defaultMessage: 'Disk Space Low' }
        ),
        description: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.host.diskSpace.description',
          {
            defaultMessage: 'Filesystem usage exceeds 90%, risk of disk full',
          }
        ),
        query: '(1 - node_filesystem_avail_bytes / node_filesystem_size_bytes) * 100',
        condition: '> 90',
        severity: 'critical',
        forDuration: '10m',
        evaluationInterval: '5m',
        labels: { severity: 'critical', category: 'infrastructure', otel_signal: 'metrics' },
        annotations: {
          summary: 'Disk space low on {{ $labels.instance }}:{{ $labels.mountpoint }}',
          description:
            'Filesystem {{ $labels.mountpoint }} is {{ $value }}% full on {{ $labels.instance }}',
        },
        requiredMetrics: ['node_filesystem_avail_bytes', 'node_filesystem_size_bytes'],
        otelSignal: 'metrics',
      },
      {
        id: 'host-load-high',
        name: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.host.loadHigh.name',
          { defaultMessage: 'High System Load' }
        ),
        description: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.host.loadHigh.description',
          {
            defaultMessage: 'System load average (15m) exceeds number of CPUs',
          }
        ),
        query: 'node_load15',
        condition: '> 4',
        severity: 'medium',
        forDuration: '15m',
        evaluationInterval: '5m',
        labels: { severity: 'warning', category: 'infrastructure', otel_signal: 'metrics' },
        annotations: {
          summary: 'High system load on {{ $labels.instance }}',
          description: '15-minute load average is {{ $value }} on {{ $labels.instance }}',
        },
        requiredMetrics: ['node_load15'],
        otelSignal: 'metrics',
      },
      {
        id: 'host-network-errors',
        name: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.host.networkErrors.name',
          { defaultMessage: 'Network Receive Drops' }
        ),
        description: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.host.networkErrors.description',
          {
            defaultMessage: 'Network interface dropping incoming packets, possible saturation',
          }
        ),
        query: 'rate(node_network_receive_drop_total[5m])',
        condition: '> 0',
        severity: 'medium',
        forDuration: '5m',
        evaluationInterval: '1m',
        labels: { severity: 'warning', category: 'network', otel_signal: 'metrics' },
        annotations: {
          summary: 'Network drops on {{ $labels.instance }}:{{ $labels.device }}',
          description:
            'Interface {{ $labels.device }} is dropping {{ $value }} packets/sec on {{ $labels.instance }}',
        },
        requiredMetrics: ['node_network_receive_drop_total'],
        otelSignal: 'metrics',
      },
    ],
  },
  {
    id: 'http',
    name: i18n.translate(
      'observability.alerting.monitorTemplateWizard.templates.category.http.name',
      {
        defaultMessage: 'HTTP / API',
      }
    ),
    icon: 'globe',
    description: i18n.translate(
      'observability.alerting.monitorTemplateWizard.templates.category.http.description',
      {
        defaultMessage: 'HTTP server metrics following OTEL http.server.* semantic conventions',
      }
    ),
    otelNamespace: 'http.server',
    metricPrefixes: ['http_'],
    color: '#00BFB3',
    templates: [
      {
        id: 'http-error-rate',
        name: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.http.errorRate.name',
          { defaultMessage: 'High Error Rate (5xx)' }
        ),
        description: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.http.errorRate.description',
          {
            defaultMessage: 'Server error rate exceeds 5% of total requests',
          }
        ),
        query:
          'sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100',
        condition: '> 5',
        severity: 'critical',
        forDuration: '2m',
        evaluationInterval: '30s',
        labels: { severity: 'critical', category: 'application', otel_signal: 'metrics' },
        annotations: {
          summary: 'High HTTP 5xx error rate',
          description: '{{ $value }}% of HTTP requests are returning 5xx errors',
        },
        requiredMetrics: ['http_requests_total'],
        otelSignal: 'metrics',
      },
      {
        id: 'http-latency-p99',
        name: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.http.latencyP99.name',
          { defaultMessage: 'High P99 Latency' }
        ),
        description: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.http.latencyP99.description',
          {
            defaultMessage: '99th percentile request latency exceeds 2 seconds',
          }
        ),
        query:
          'histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))',
        condition: '> 2',
        severity: 'high',
        forDuration: '5m',
        evaluationInterval: '1m',
        labels: { severity: 'high', category: 'application', otel_signal: 'metrics' },
        annotations: {
          summary: 'High P99 latency for HTTP requests',
          description: 'P99 latency is {{ $value }}s, exceeding 2s threshold',
        },
        requiredMetrics: ['http_request_duration_seconds_bucket'],
        otelSignal: 'metrics',
      },
      {
        id: 'http-request-spike',
        name: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.http.requestSpike.name',
          { defaultMessage: 'Request Rate Spike' }
        ),
        description: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.http.requestSpike.description',
          {
            defaultMessage: 'Request rate increased by more than 3x compared to 1-hour average',
          }
        ),
        query: 'sum(rate(http_requests_total[5m])) / sum(rate(http_requests_total[1h]))',
        condition: '> 3',
        severity: 'medium',
        forDuration: '5m',
        evaluationInterval: '1m',
        labels: { severity: 'warning', category: 'application', otel_signal: 'metrics' },
        annotations: {
          summary: 'HTTP request rate spike detected',
          description: 'Request rate is {{ $value }}x the 1-hour average',
        },
        requiredMetrics: ['http_requests_total'],
        otelSignal: 'metrics',
      },
    ],
  },
  {
    id: 'kubernetes',
    name: i18n.translate(
      'observability.alerting.monitorTemplateWizard.templates.category.kubernetes.name',
      { defaultMessage: 'Kubernetes' }
    ),
    icon: 'logoKubernetes',
    description: i18n.translate(
      'observability.alerting.monitorTemplateWizard.templates.category.kubernetes.description',
      {
        defaultMessage:
          'Kubernetes cluster metrics from kube-state-metrics following OTEL k8s.* conventions',
      }
    ),
    otelNamespace: 'k8s',
    metricPrefixes: ['kube_'],
    color: '#326CE5',
    templates: [
      {
        id: 'k8s-pod-restarts',
        name: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.k8s.podRestarts.name',
          { defaultMessage: 'Pod Crash Looping' }
        ),
        description: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.k8s.podRestarts.description',
          {
            defaultMessage: 'Pod has restarted more than 5 times in the last hour',
          }
        ),
        query: 'increase(kube_pod_container_status_restarts_total[1h])',
        condition: '> 5',
        severity: 'critical',
        forDuration: '5m',
        evaluationInterval: '1m',
        labels: { severity: 'critical', category: 'kubernetes', otel_signal: 'metrics' },
        annotations: {
          summary: 'Pod {{ $labels.namespace }}/{{ $labels.pod }} is crash looping',
          description:
            'Pod {{ $labels.pod }} in namespace {{ $labels.namespace }} has restarted {{ $value }} times in the last hour',
        },
        requiredMetrics: ['kube_pod_container_status_restarts_total'],
        otelSignal: 'metrics',
      },
      {
        id: 'k8s-deployment-replicas',
        name: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.k8s.deploymentReplicas.name',
          { defaultMessage: 'Deployment Replica Mismatch' }
        ),
        description: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.k8s.deploymentReplicas.description',
          {
            defaultMessage: 'Deployment has fewer ready replicas than desired',
          }
        ),
        query: 'kube_deployment_status_replicas',
        condition: '< 1',
        severity: 'high',
        forDuration: '10m',
        evaluationInterval: '2m',
        labels: { severity: 'high', category: 'kubernetes', otel_signal: 'metrics' },
        annotations: {
          summary: 'Deployment {{ $labels.deployment }} has no ready replicas',
          description:
            'Deployment {{ $labels.deployment }} in {{ $labels.namespace }} has {{ $value }} replicas',
        },
        requiredMetrics: ['kube_deployment_status_replicas'],
        otelSignal: 'metrics',
      },
    ],
  },
  {
    id: 'container',
    name: i18n.translate(
      'observability.alerting.monitorTemplateWizard.templates.category.container.name',
      { defaultMessage: 'Container Runtime' }
    ),
    icon: 'package',
    description: i18n.translate(
      'observability.alerting.monitorTemplateWizard.templates.category.container.description',
      {
        defaultMessage: 'Container-level resource metrics following OTEL container.* conventions',
      }
    ),
    otelNamespace: 'container',
    metricPrefixes: ['container_'],
    color: '#9B59B6',
    templates: [
      {
        id: 'container-cpu-throttle',
        name: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.container.cpuThrottle.name',
          { defaultMessage: 'Container CPU High' }
        ),
        description: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.container.cpuThrottle.description',
          {
            defaultMessage: 'Container CPU usage exceeds 80% of its limit',
          }
        ),
        query: 'rate(container_cpu_usage_seconds_total[5m]) * 100',
        condition: '> 80',
        severity: 'high',
        forDuration: '5m',
        evaluationInterval: '1m',
        labels: { severity: 'high', category: 'container', otel_signal: 'metrics' },
        annotations: {
          summary: 'Container {{ $labels.container }} CPU high',
          description:
            'Container {{ $labels.container }} in pod {{ $labels.pod }} is using {{ $value }}% CPU',
        },
        requiredMetrics: ['container_cpu_usage_seconds_total'],
        otelSignal: 'metrics',
      },
      {
        id: 'container-memory-high',
        name: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.container.memoryHigh.name',
          { defaultMessage: 'Container Memory High' }
        ),
        description: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.container.memoryHigh.description',
          {
            defaultMessage: 'Container memory usage exceeds 1GB',
          }
        ),
        query: 'container_memory_usage_bytes / 1024 / 1024 / 1024',
        condition: '> 1',
        severity: 'medium',
        forDuration: '10m',
        evaluationInterval: '2m',
        labels: { severity: 'warning', category: 'container', otel_signal: 'metrics' },
        annotations: {
          summary: 'Container {{ $labels.container }} memory high',
          description: 'Container {{ $labels.container }} is using {{ $value }}GB memory',
        },
        requiredMetrics: ['container_memory_usage_bytes'],
        otelSignal: 'metrics',
      },
    ],
  },
  {
    id: 'database',
    name: i18n.translate(
      'observability.alerting.monitorTemplateWizard.templates.category.database.name',
      { defaultMessage: 'Database' }
    ),
    icon: 'database',
    description: i18n.translate(
      'observability.alerting.monitorTemplateWizard.templates.category.database.description',
      {
        defaultMessage: 'Database connection and query metrics following OTEL db.* conventions',
      }
    ),
    otelNamespace: 'db',
    metricPrefixes: ['db_'],
    color: '#E67E22',
    templates: [
      {
        id: 'db-connection-pool-exhaustion',
        name: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.db.connectionPool.name',
          { defaultMessage: 'Connection Pool Exhaustion' }
        ),
        description: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.db.connectionPool.description',
          {
            defaultMessage: 'Available database connections below 10% of pool size',
          }
        ),
        query: '(db_connection_pool_available / db_connection_pool_total) * 100',
        condition: '< 10',
        severity: 'critical',
        forDuration: '2m',
        evaluationInterval: '30s',
        labels: { severity: 'critical', category: 'database', otel_signal: 'metrics' },
        annotations: {
          summary: 'Database connection pool nearly exhausted',
          description: 'Only {{ $value }}% of database connections available',
        },
        requiredMetrics: ['db_connection_pool_available', 'db_connection_pool_total'],
        otelSignal: 'metrics',
      },
      {
        id: 'db-slow-queries',
        name: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.db.slowQueries.name',
          { defaultMessage: 'Slow Database Queries' }
        ),
        description: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.db.slowQueries.description',
          {
            defaultMessage: 'Average query duration exceeds 500ms',
          }
        ),
        query: 'rate(db_query_duration_seconds[5m])',
        condition: '> 0.5',
        severity: 'medium',
        forDuration: '5m',
        evaluationInterval: '1m',
        labels: { severity: 'warning', category: 'database', otel_signal: 'metrics' },
        annotations: {
          summary: 'Slow database queries detected',
          description: 'Average query duration is {{ $value }}s',
        },
        requiredMetrics: ['db_query_duration_seconds'],
        otelSignal: 'metrics',
      },
    ],
  },
  {
    id: 'process',
    name: i18n.translate(
      'observability.alerting.monitorTemplateWizard.templates.category.process.name',
      { defaultMessage: 'Process / Runtime' }
    ),
    icon: 'gear',
    description: i18n.translate(
      'observability.alerting.monitorTemplateWizard.templates.category.process.description',
      {
        defaultMessage: 'Process-level metrics following OTEL process.runtime.* conventions',
      }
    ),
    otelNamespace: 'process.runtime',
    metricPrefixes: ['process_', 'go_'],
    color: '#2ECC71',
    templates: [
      {
        id: 'process-high-fds',
        name: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.process.highFds.name',
          { defaultMessage: 'High File Descriptor Usage' }
        ),
        description: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.process.highFds.description',
          {
            defaultMessage: 'Process has more than 1000 open file descriptors',
          }
        ),
        query: 'process_open_fds',
        condition: '> 1000',
        severity: 'medium',
        forDuration: '10m',
        evaluationInterval: '5m',
        labels: { severity: 'warning', category: 'process', otel_signal: 'metrics' },
        annotations: {
          summary: 'High file descriptor count on {{ $labels.instance }}',
          description: 'Process has {{ $value }} open file descriptors',
        },
        requiredMetrics: ['process_open_fds'],
        otelSignal: 'metrics',
      },
      {
        id: 'go-goroutine-leak',
        name: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.process.goroutineLeak.name',
          { defaultMessage: 'Goroutine Leak' }
        ),
        description: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.process.goroutineLeak.description',
          {
            defaultMessage: 'Go goroutine count exceeds 5000, possible leak',
          }
        ),
        query: 'go_goroutines',
        condition: '> 5000',
        severity: 'high',
        forDuration: '10m',
        evaluationInterval: '2m',
        labels: { severity: 'high', category: 'runtime', otel_signal: 'metrics' },
        annotations: {
          summary: 'Possible goroutine leak on {{ $labels.instance }}',
          description: 'Goroutine count is {{ $value }}',
        },
        requiredMetrics: ['go_goroutines'],
        otelSignal: 'metrics',
      },
    ],
  },
  {
    id: 'probes',
    name: i18n.translate(
      'observability.alerting.monitorTemplateWizard.templates.category.probes.name',
      { defaultMessage: 'Synthetic / Probes' }
    ),
    icon: 'heartbeatFill',
    description: i18n.translate(
      'observability.alerting.monitorTemplateWizard.templates.category.probes.description',
      {
        defaultMessage:
          'Blackbox exporter probes for endpoint availability and SSL certificate monitoring',
      }
    ),
    otelNamespace: 'probe',
    metricPrefixes: ['probe_'],
    color: '#E74C3C',
    templates: [
      {
        id: 'probe-endpoint-down',
        name: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.probes.endpointDown.name',
          { defaultMessage: 'Endpoint Down' }
        ),
        description: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.probes.endpointDown.description',
          {
            defaultMessage: 'Probe target is unreachable',
          }
        ),
        query: 'probe_success',
        condition: '== 0',
        severity: 'critical',
        forDuration: '2m',
        evaluationInterval: '30s',
        labels: { severity: 'critical', category: 'availability', otel_signal: 'metrics' },
        annotations: {
          summary: 'Endpoint {{ $labels.instance }} is down',
          description: 'Probe to {{ $labels.instance }} has been failing for 2 minutes',
        },
        requiredMetrics: ['probe_success'],
        otelSignal: 'metrics',
      },
      {
        id: 'probe-ssl-expiry',
        name: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.probes.sslExpiry.name',
          { defaultMessage: 'SSL Certificate Expiring' }
        ),
        description: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.probes.sslExpiry.description',
          {
            defaultMessage: 'SSL certificate expires within 30 days',
          }
        ),
        query: '(probe_ssl_earliest_cert_expiry - time()) / 86400',
        condition: '< 30',
        severity: 'high',
        forDuration: '1h',
        evaluationInterval: '30m',
        labels: { severity: 'high', category: 'security', otel_signal: 'metrics' },
        annotations: {
          summary: 'SSL certificate for {{ $labels.instance }} expiring soon',
          description: 'Certificate expires in {{ $value }} days',
        },
        requiredMetrics: ['probe_ssl_earliest_cert_expiry'],
        otelSignal: 'metrics',
      },
    ],
  },
  {
    id: 'scrape',
    name: i18n.translate(
      'observability.alerting.monitorTemplateWizard.templates.category.scrape.name',
      { defaultMessage: 'Prometheus Internals' }
    ),
    icon: 'monitoringApp',
    description: i18n.translate(
      'observability.alerting.monitorTemplateWizard.templates.category.scrape.description',
      {
        defaultMessage:
          'Prometheus self-monitoring: target health, scrape performance, and up status',
      }
    ),
    otelNamespace: 'prometheus',
    metricPrefixes: ['up', 'scrape_'],
    color: '#95A5A6',
    templates: [
      {
        id: 'target-down',
        name: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.scrape.targetDown.name',
          { defaultMessage: 'Scrape Target Down' }
        ),
        description: i18n.translate(
          'observability.alerting.monitorTemplateWizard.templates.scrape.targetDown.description',
          {
            defaultMessage: 'Prometheus scrape target is unreachable',
          }
        ),
        query: 'up',
        condition: '== 0',
        severity: 'critical',
        forDuration: '3m',
        evaluationInterval: '1m',
        labels: { severity: 'critical', category: 'monitoring', otel_signal: 'metrics' },
        annotations: {
          summary: 'Target {{ $labels.instance }} ({{ $labels.job }}) is down',
          description: 'Prometheus cannot scrape {{ $labels.instance }} for job {{ $labels.job }}',
        },
        requiredMetrics: ['up'],
        otelSignal: 'metrics',
      },
    ],
  },
];

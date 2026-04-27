/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AI Monitor Wizard — auto-generates monitors for common OTEL/Prometheus applications.
 * Scans discovered metrics, groups by application category, and offers preconfigured
 * alert rules that follow OTEL semantic conventions.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiTitle,
  EuiText,
  EuiSpacer,
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiBadge,
  EuiPanel,
  EuiIcon,
  EuiCallOut,
  EuiProgress,
  EuiHorizontalRule,
  EuiToolTip,
  EuiCheckbox,
  EuiLoadingSpinner,
  EuiSelect,
  EuiFieldText,
  EuiFormRow,
} from '@elastic/eui';
import { MOCK_METRICS } from './promql_editor';
import { UnifiedAlertSeverity } from '../../../common/types/alerting/types';

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
const APPLICATION_CATALOG: Array<Omit<ApplicationCategory, 'discoveredMetrics'>> = [
  {
    id: 'host',
    name: 'Host / Node',
    icon: 'compute',
    description: 'System-level metrics from node_exporter following OTEL system.* conventions',
    otelNamespace: 'system',
    metricPrefixes: ['node_', 'system_'],
    color: '#0077CC',
    templates: [
      {
        id: 'host-cpu-high',
        name: 'High CPU Usage',
        description:
          'CPU utilization exceeds 85% for sustained period, indicating potential resource exhaustion',
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
          runbook_url: 'https://runbooks.example.com/host/high-cpu',
        },
        requiredMetrics: ['node_cpu_seconds_total'],
        otelSignal: 'metrics',
      },
      {
        id: 'host-memory-high',
        name: 'High Memory Usage',
        description: 'Available memory drops below 15% of total, risk of OOM kills',
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
          runbook_url: 'https://runbooks.example.com/host/high-memory',
        },
        requiredMetrics: ['node_memory_MemAvailable_bytes', 'node_memory_MemTotal_bytes'],
        otelSignal: 'metrics',
      },
      {
        id: 'host-disk-space',
        name: 'Disk Space Low',
        description: 'Filesystem usage exceeds 90%, risk of disk full',
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
          runbook_url: 'https://runbooks.example.com/host/disk-space',
        },
        requiredMetrics: ['node_filesystem_avail_bytes', 'node_filesystem_size_bytes'],
        otelSignal: 'metrics',
      },
      {
        id: 'host-load-high',
        name: 'High System Load',
        description: 'System load average (15m) exceeds number of CPUs',
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
        name: 'Network Receive Drops',
        description: 'Network interface dropping incoming packets, possible saturation',
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
    name: 'HTTP / API',
    icon: 'globe',
    description: 'HTTP server metrics following OTEL http.server.* semantic conventions',
    otelNamespace: 'http.server',
    metricPrefixes: ['http_'],
    color: '#00BFB3',
    templates: [
      {
        id: 'http-error-rate',
        name: 'High Error Rate (5xx)',
        description: 'Server error rate exceeds 5% of total requests',
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
          runbook_url: 'https://runbooks.example.com/http/error-rate',
        },
        requiredMetrics: ['http_requests_total'],
        otelSignal: 'metrics',
      },
      {
        id: 'http-latency-p99',
        name: 'High P99 Latency',
        description: '99th percentile request latency exceeds 2 seconds',
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
          runbook_url: 'https://runbooks.example.com/http/latency',
        },
        requiredMetrics: ['http_request_duration_seconds_bucket'],
        otelSignal: 'metrics',
      },
      {
        id: 'http-request-spike',
        name: 'Request Rate Spike',
        description: 'Request rate increased by more than 3x compared to 1-hour average',
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
    name: 'Kubernetes',
    icon: 'logoKubernetes',
    description:
      'Kubernetes cluster metrics from kube-state-metrics following OTEL k8s.* conventions',
    otelNamespace: 'k8s',
    metricPrefixes: ['kube_'],
    color: '#326CE5',
    templates: [
      {
        id: 'k8s-pod-restarts',
        name: 'Pod Crash Looping',
        description: 'Pod has restarted more than 5 times in the last hour',
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
          runbook_url: 'https://runbooks.example.com/k8s/crashloop',
        },
        requiredMetrics: ['kube_pod_container_status_restarts_total'],
        otelSignal: 'metrics',
      },
      {
        id: 'k8s-deployment-replicas',
        name: 'Deployment Replica Mismatch',
        description: 'Deployment has fewer ready replicas than desired',
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
    name: 'Container Runtime',
    icon: 'package',
    description: 'Container-level resource metrics following OTEL container.* conventions',
    otelNamespace: 'container',
    metricPrefixes: ['container_'],
    color: '#9B59B6',
    templates: [
      {
        id: 'container-cpu-throttle',
        name: 'Container CPU High',
        description: 'Container CPU usage exceeds 80% of its limit',
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
        name: 'Container Memory High',
        description: 'Container memory usage exceeds 1GB',
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
    name: 'Database',
    icon: 'database',
    description: 'Database connection and query metrics following OTEL db.* conventions',
    otelNamespace: 'db',
    metricPrefixes: ['db_'],
    color: '#E67E22',
    templates: [
      {
        id: 'db-connection-pool-exhaustion',
        name: 'Connection Pool Exhaustion',
        description: 'Available database connections below 10% of pool size',
        query: '(db_connection_pool_available / db_connection_pool_total) * 100',
        condition: '< 10',
        severity: 'critical',
        forDuration: '2m',
        evaluationInterval: '30s',
        labels: { severity: 'critical', category: 'database', otel_signal: 'metrics' },
        annotations: {
          summary: 'Database connection pool nearly exhausted',
          description: 'Only {{ $value }}% of database connections available',
          runbook_url: 'https://runbooks.example.com/db/connection-pool',
        },
        requiredMetrics: ['db_connection_pool_available', 'db_connection_pool_total'],
        otelSignal: 'metrics',
      },
      {
        id: 'db-slow-queries',
        name: 'Slow Database Queries',
        description: 'Average query duration exceeds 500ms',
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
    name: 'Process / Runtime',
    icon: 'gear',
    description: 'Process-level metrics following OTEL process.runtime.* conventions',
    otelNamespace: 'process.runtime',
    metricPrefixes: ['process_', 'go_'],
    color: '#2ECC71',
    templates: [
      {
        id: 'process-high-fds',
        name: 'High File Descriptor Usage',
        description: 'Process has more than 1000 open file descriptors',
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
        name: 'Goroutine Leak',
        description: 'Go goroutine count exceeds 5000, possible leak',
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
    name: 'Synthetic / Probes',
    icon: 'heartbeatFill',
    description:
      'Blackbox exporter probes for endpoint availability and SSL certificate monitoring',
    otelNamespace: 'probe',
    metricPrefixes: ['probe_'],
    color: '#E74C3C',
    templates: [
      {
        id: 'probe-endpoint-down',
        name: 'Endpoint Down',
        description: 'Probe target is unreachable',
        query: 'probe_success',
        condition: '== 0',
        severity: 'critical',
        forDuration: '2m',
        evaluationInterval: '30s',
        labels: { severity: 'critical', category: 'availability', otel_signal: 'metrics' },
        annotations: {
          summary: 'Endpoint {{ $labels.instance }} is down',
          description: 'Probe to {{ $labels.instance }} has been failing for 2 minutes',
          runbook_url: 'https://runbooks.example.com/probes/endpoint-down',
        },
        requiredMetrics: ['probe_success'],
        otelSignal: 'metrics',
      },
      {
        id: 'probe-ssl-expiry',
        name: 'SSL Certificate Expiring',
        description: 'SSL certificate expires within 30 days',
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
    name: 'Prometheus Internals',
    icon: 'monitoringApp',
    description: 'Prometheus self-monitoring: target health, scrape performance, and up status',
    otelNamespace: 'prometheus',
    metricPrefixes: ['up', 'scrape_'],
    color: '#95A5A6',
    templates: [
      {
        id: 'target-down',
        name: 'Scrape Target Down',
        description: 'Prometheus scrape target is unreachable',
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

// ============================================================================
// Metric Discovery Engine
// ============================================================================

function discoverApplications(metrics: string[]): ApplicationCategory[] {
  return APPLICATION_CATALOG.map((cat) => {
    const discovered = metrics.filter((m) =>
      cat.metricPrefixes.some((prefix) => (prefix === m ? true : m.startsWith(prefix)))
    );
    return { ...cat, discoveredMetrics: discovered };
  }).filter((cat) => cat.discoveredMetrics.length > 0);
}

function countAvailableTemplates(cat: ApplicationCategory): { available: number; total: number } {
  const available = cat.templates.filter((t) =>
    t.requiredMetrics.every((rm) => cat.discoveredMetrics.includes(rm))
  ).length;
  return { available, total: cat.templates.length };
}

// ============================================================================
// Severity helpers
// ============================================================================

import { SEVERITY_COLORS } from './shared_constants';

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

// ============================================================================
// Wizard Steps
// ============================================================================

type WizardStep = 'scanning' | 'review' | 'configure' | 'summary';

export interface AiMonitorWizardProps {
  onClose: () => void;
  onCreateMonitors: (monitors: AlertTemplate[]) => void;
}

export const AiMonitorWizard: React.FC<AiMonitorWizardProps> = ({ onClose, onCreateMonitors }) => {
  const [step, setStep] = useState<WizardStep>('scanning');
  const [scanProgress, setScanProgress] = useState(0);
  const [applications, setApplications] = useState<ApplicationCategory[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());
  const [severityOverrides, setSeverityOverrides] = useState<Record<string, UnifiedAlertSeverity>>(
    {}
  );
  const [labelPrefix, setLabelPrefix] = useState('');

  // Simulate scanning
  useEffect(() => {
    if (step !== 'scanning') return;
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 25 + 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        const discovered = discoverApplications(MOCK_METRICS);
        setApplications(discovered);
        // Pre-select all available templates
        const allIds = new Set<string>();
        discovered.forEach((cat) => {
          cat.templates.forEach((t) => {
            if (t.requiredMetrics.every((rm) => cat.discoveredMetrics.includes(rm))) {
              allIds.add(t.id);
            }
          });
        });
        setSelectedTemplates(allIds);
        setTimeout(() => setStep('review'), 400);
      }
      setScanProgress(Math.min(progress, 100));
    }, 300);
    return () => clearInterval(interval);
  }, [step]);

  const totalDiscoveredMetrics = useMemo(
    () => applications.reduce((sum, a) => sum + a.discoveredMetrics.length, 0),
    [applications]
  );

  const totalAvailableAlerts = useMemo(
    () => applications.reduce((sum, a) => sum + countAvailableTemplates(a).available, 0),
    [applications]
  );

  const toggleTemplate = (id: string) => {
    setSelectedTemplates((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCategory = (cat: ApplicationCategory, selectAll: boolean) => {
    setSelectedTemplates((prev) => {
      const next = new Set(prev);
      cat.templates.forEach((t) => {
        if (t.requiredMetrics.every((rm) => cat.discoveredMetrics.includes(rm))) {
          if (selectAll) next.add(t.id);
          else next.delete(t.id);
        }
      });
      return next;
    });
  };

  const isCategoryFullySelected = (cat: ApplicationCategory) =>
    cat.templates
      .filter((t) => t.requiredMetrics.every((rm) => cat.discoveredMetrics.includes(rm)))
      .every((t) => selectedTemplates.has(t.id));

  const isCategoryPartiallySelected = (cat: ApplicationCategory) => {
    const available = cat.templates.filter((t) =>
      t.requiredMetrics.every((rm) => cat.discoveredMetrics.includes(rm))
    );
    const selected = available.filter((t) => selectedTemplates.has(t.id));
    return selected.length > 0 && selected.length < available.length;
  };

  const handleCreate = () => {
    const monitors: AlertTemplate[] = [];
    applications.forEach((cat) => {
      cat.templates.forEach((t) => {
        if (selectedTemplates.has(t.id)) {
          const override = severityOverrides[t.id];
          const finalTemplate = override
            ? { ...t, severity: override, labels: { ...t.labels, severity: override } }
            : t;
          if (labelPrefix) {
            finalTemplate.labels = {
              ...finalTemplate.labels,
              monitor_source: 'ai-wizard',
              prefix: labelPrefix,
            };
          } else {
            finalTemplate.labels = { ...finalTemplate.labels, monitor_source: 'ai-wizard' };
          }
          monitors.push(finalTemplate);
        }
      });
    });
    onCreateMonitors(monitors);
  };

  // ---- Render helpers ----

  const renderScanning = () => (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <EuiLoadingSpinner size="xl" />
      <EuiSpacer size="l" />
      <EuiTitle size="s">
        <h3>Scanning Prometheus Metrics</h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        Discovering OTEL-compatible metrics and matching against known application patterns...
      </EuiText>
      <EuiSpacer size="l" />
      <EuiProgress value={scanProgress} max={100} size="l" color="primary" />
      <EuiSpacer size="s" />
      <EuiText size="xs" color="subdued">
        {Math.round(scanProgress)}% — Analyzing metric namespaces
      </EuiText>
    </div>
  );

  const renderReview = () => (
    <div>
      <EuiCallOut title="Metrics Discovery Complete" color="success" iconType="check" size="s">
        <EuiText size="xs">
          Found <strong>{totalDiscoveredMetrics} metrics</strong> across{' '}
          <strong>{applications.length} application categories</strong>.{' '}
          <strong>{totalAvailableAlerts} preconfigured alerts</strong> are available based on your
          metrics.
        </EuiText>
      </EuiCallOut>
      <EuiSpacer size="m" />

      {applications.map((cat) => {
        const { available, total } = countAvailableTemplates(cat);
        const fullySelected = isCategoryFullySelected(cat);
        const partiallySelected = isCategoryPartiallySelected(cat);

        return (
          <div key={cat.id} style={{ marginBottom: 12 }}>
            <EuiPanel paddingSize="m" hasBorder>
              <EuiFlexGroup alignItems="center" responsive={false} gutterSize="s">
                <EuiFlexItem grow={false}>
                  <EuiCheckbox
                    id={`cat-${cat.id}`}
                    checked={fullySelected}
                    indeterminate={partiallySelected}
                    onChange={() => toggleCategory(cat, !fullySelected)}
                    aria-label={`Select all ${cat.name} alerts`}
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiIcon type={cat.icon} size="l" color={cat.color} />
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText size="s">
                    <strong>{cat.name}</strong>
                  </EuiText>
                  <EuiText size="xs" color="subdued">
                    {cat.description}
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiFlexGroup gutterSize="xs" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiBadge color="hollow">{cat.discoveredMetrics.length} metrics</EuiBadge>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiBadge color={available === total ? 'success' : 'warning'}>
                        {available}/{total} alerts ready
                      </EuiBadge>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiToolTip content={`OTEL namespace: ${cat.otelNamespace}`}>
                        <EuiBadge color="primary">OTEL</EuiBadge>
                      </EuiToolTip>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>
              </EuiFlexGroup>

              <EuiSpacer size="s" />

              {/* Discovered metrics preview */}
              <EuiFlexGroup gutterSize="xs" wrap responsive={false} style={{ marginBottom: 8 }}>
                {cat.discoveredMetrics.slice(0, 6).map((m) => (
                  <EuiFlexItem grow={false} key={m}>
                    <EuiBadge color="hollow" style={{ fontSize: 10 }}>
                      {m}
                    </EuiBadge>
                  </EuiFlexItem>
                ))}
                {cat.discoveredMetrics.length > 6 && (
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs" color="subdued">
                      +{cat.discoveredMetrics.length - 6} more
                    </EuiText>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>

              <EuiHorizontalRule margin="xs" />

              {/* Alert templates */}
              {cat.templates.map((t) => {
                const metricsAvailable = t.requiredMetrics.every((rm) =>
                  cat.discoveredMetrics.includes(rm)
                );
                const missingMetrics = t.requiredMetrics.filter(
                  (rm) => !cat.discoveredMetrics.includes(rm)
                );

                return (
                  <EuiFlexGroup
                    key={t.id}
                    alignItems="center"
                    responsive={false}
                    gutterSize="s"
                    style={{ padding: '4px 0', opacity: metricsAvailable ? 1 : 0.5 }}
                  >
                    <EuiFlexItem grow={false}>
                      <EuiCheckbox
                        id={`tmpl-${t.id}`}
                        checked={selectedTemplates.has(t.id)}
                        onChange={() => toggleTemplate(t.id)}
                        disabled={!metricsAvailable}
                        aria-label={`Select ${t.name}`}
                      />
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiText size="xs">
                        <strong>{t.name}</strong>
                      </EuiText>
                      <EuiText size="xs" color="subdued">
                        {t.description}
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiBadge color={SEVERITY_COLORS[t.severity]}>{t.severity}</EuiBadge>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiToolTip content={`Query: ${t.query} ${t.condition}`}>
                        <EuiBadge color="hollow" style={{ fontSize: 10 }}>
                          {t.condition} for {t.forDuration}
                        </EuiBadge>
                      </EuiToolTip>
                    </EuiFlexItem>
                    {!metricsAvailable && (
                      <EuiFlexItem grow={false}>
                        <EuiToolTip content={`Missing: ${missingMetrics.join(', ')}`}>
                          <EuiBadge color="danger">missing metrics</EuiBadge>
                        </EuiToolTip>
                      </EuiFlexItem>
                    )}
                  </EuiFlexGroup>
                );
              })}
            </EuiPanel>
          </div>
        );
      })}
    </div>
  );

  const renderConfigure = () => {
    const selectedList = applications
      .flatMap((cat) =>
        cat.templates
          .filter((t) => selectedTemplates.has(t.id))
          .map((t) => ({ ...t, category: cat.name }))
      )
      .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4));

    return (
      <div>
        <EuiCallOut
          title={`${selectedList.length} monitors selected`}
          color="primary"
          iconType="check"
          size="s"
        >
          <EuiText size="xs">
            Review and customize severity levels before creating. You can also add a label prefix to
            group these monitors.
          </EuiText>
        </EuiCallOut>
        <EuiSpacer size="m" />

        <EuiFormRow
          label="Label Prefix (optional)"
          helpText="Added as a label to all generated monitors for easy filtering"
        >
          <EuiFieldText
            placeholder="e.g. my-team, production"
            value={labelPrefix}
            onChange={(e) => setLabelPrefix(e.target.value)}
            compressed
            aria-label="Label prefix"
          />
        </EuiFormRow>

        <EuiSpacer size="m" />

        <EuiPanel paddingSize="s" color="subdued">
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {selectedList.map((t) => (
              <EuiFlexGroup
                key={t.id}
                alignItems="center"
                responsive={false}
                gutterSize="s"
                style={{ padding: '6px 4px', borderBottom: '1px solid #eee' }}
              >
                <EuiFlexItem>
                  <EuiText size="xs">
                    <strong>{t.name}</strong>
                  </EuiText>
                  <EuiText size="xs" color="subdued">
                    {t.category}
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false} style={{ width: 130 }}>
                  <EuiSelect
                    options={[
                      { value: 'critical', text: 'Critical' },
                      { value: 'high', text: 'High' },
                      { value: 'medium', text: 'Medium' },
                      { value: 'low', text: 'Low' },
                      { value: 'info', text: 'Info' },
                    ]}
                    value={severityOverrides[t.id] || t.severity}
                    onChange={(e) =>
                      setSeverityOverrides((prev) => ({
                        ...prev,
                        [t.id]: e.target.value as UnifiedAlertSeverity,
                      }))
                    }
                    compressed
                    aria-label={`Severity for ${t.name}`}
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiToolTip content={`${t.query} ${t.condition}`}>
                    <EuiIcon type="inspect" />
                  </EuiToolTip>
                </EuiFlexItem>
              </EuiFlexGroup>
            ))}
          </div>
        </EuiPanel>
      </div>
    );
  };

  const renderSummary = () => {
    const count = selectedTemplates.size;
    const bySeverity: Record<string, number> = {};
    applications.forEach((cat) => {
      cat.templates.forEach((t) => {
        if (selectedTemplates.has(t.id)) {
          const sev = severityOverrides[t.id] || t.severity;
          bySeverity[sev] = (bySeverity[sev] || 0) + 1;
        }
      });
    });

    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <EuiIcon type="check" size="xxl" color="success" />
        <EuiSpacer size="m" />
        <EuiTitle size="m">
          <h2>{count} Monitors Created</h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText size="s" color="subdued">
          All monitors have been created and are now active. They will begin evaluating on their
          configured intervals.
        </EuiText>
        <EuiSpacer size="m" />
        <EuiFlexGroup justifyContent="center" gutterSize="s" wrap>
          {Object.entries(bySeverity)
            .sort((a, b) => (SEVERITY_ORDER[a[0]] ?? 4) - (SEVERITY_ORDER[b[0]] ?? 4))
            .map(([sev, n]) => (
              <EuiFlexItem grow={false} key={sev}>
                <EuiBadge color={SEVERITY_COLORS[sev]}>
                  {n} {sev}
                </EuiBadge>
              </EuiFlexItem>
            ))}
        </EuiFlexGroup>
        {labelPrefix && (
          <>
            <EuiSpacer size="s" />
            <EuiText size="xs" color="subdued">
              All monitors labeled with <EuiBadge color="hollow">prefix:{labelPrefix}</EuiBadge> and{' '}
              <EuiBadge color="hollow">monitor_source:ai-wizard</EuiBadge>
            </EuiText>
          </>
        )}
      </div>
    );
  };

  // ---- Step navigation ----

  const canGoNext = () => {
    if (step === 'review') return selectedTemplates.size > 0;
    if (step === 'configure') return selectedTemplates.size > 0;
    return false;
  };

  const handleNext = () => {
    if (step === 'review') setStep('configure');
    else if (step === 'configure') {
      handleCreate();
      setStep('summary');
    }
  };

  const handleBack = () => {
    if (step === 'configure') setStep('review');
  };

  const stepContent = () => {
    switch (step) {
      case 'scanning':
        return renderScanning();
      case 'review':
        return renderReview();
      case 'configure':
        return renderConfigure();
      case 'summary':
        return renderSummary();
    }
  };

  const stepTitle = () => {
    switch (step) {
      case 'scanning':
        return 'Scanning Metrics';
      case 'review':
        return 'Select Monitors';
      case 'configure':
        return 'Configure';
      case 'summary':
        return 'Complete';
    }
  };

  const stepNumber = () => {
    switch (step) {
      case 'scanning':
        return 1;
      case 'review':
        return 2;
      case 'configure':
        return 3;
      case 'summary':
        return 4;
    }
  };

  return (
    <EuiFlyout onClose={onClose} size="l" ownFocus aria-labelledby="aiMonitorWizardTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center" responsive={false} gutterSize="m">
          <EuiFlexItem grow={false}>
            <EuiIcon type="sparkles" size="l" color="primary" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiTitle size="m">
              <h2 id="aiMonitorWizardTitle">AI Monitor Setup</h2>
            </EuiTitle>
            <EuiText size="xs" color="subdued">
              Auto-generate monitors from discovered OTEL metrics — Step {stepNumber()} of 4:{' '}
              {stepTitle()}
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            {step !== 'scanning' && step !== 'summary' && (
              <EuiBadge color="primary">{selectedTemplates.size} selected</EuiBadge>
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>{stepContent()}</EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem grow={false}>
            {step === 'summary' ? (
              <EuiButton onClick={onClose}>Done</EuiButton>
            ) : (
              <EuiButtonEmpty onClick={onClose}>Cancel</EuiButtonEmpty>
            )}
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s" responsive={false}>
              {step === 'configure' && (
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty onClick={handleBack}>Back</EuiButtonEmpty>
                </EuiFlexItem>
              )}
              {step !== 'scanning' && step !== 'summary' && (
                <EuiFlexItem grow={false}>
                  <EuiButton fill onClick={handleNext} isDisabled={!canGoNext()}>
                    {step === 'configure'
                      ? `Create ${selectedTemplates.size} Monitors`
                      : 'Next: Configure'}
                  </EuiButton>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};

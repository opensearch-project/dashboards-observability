/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mock data enrichment for unified rule/alert detail fields.
 *
 * These generators produce fake AI summaries, alert histories, preview data,
 * notification routing, and suppression rules for development and demo purposes.
 * They should NOT be used in production code paths.
 */
import {
  UnifiedAlertSeverity,
  UnifiedAlertState,
  MonitorStatus,
  AlertHistoryEntry,
  NotificationRouting,
  SuppressionRule,
} from '../../../common/types/alerting/types';

// ============================================================================
// Mock detail data generators
// ============================================================================

export function generateMockPreviewData(
  severity: UnifiedAlertSeverity
): Array<{ timestamp: number; value: number }> {
  const now = Date.now();
  const points: Array<{ timestamp: number; value: number }> = [];
  const baseValue = severity === 'critical' ? 85 : severity === 'high' ? 60 : 30;
  for (let i = 29; i >= 0; i--) {
    const noise = (Math.random() - 0.5) * 20;
    const spike = i < 5 ? 15 + Math.random() * 10 : 0;
    points.push({ timestamp: now - i * 60000, value: Math.max(0, baseValue + noise + spike) });
  }
  return points;
}

export function generateMockAlertHistory(
  _status: MonitorStatus,
  _severity: UnifiedAlertSeverity
): AlertHistoryEntry[] {
  const now = Date.now();
  const history: AlertHistoryEntry[] = [];
  const states: UnifiedAlertState[] = ['active', 'resolved', 'active', 'acknowledged', 'resolved'];
  for (let i = 0; i < 5; i++) {
    history.push({
      timestamp: new Date(now - (i + 1) * 3600000 * (1 + Math.random() * 12)).toISOString(),
      state: states[i % states.length],
      value: `${(Math.random() * 100).toFixed(1)}`,
      message:
        states[i % states.length] === 'active' ? 'Threshold exceeded' : 'Recovered to normal',
    });
  }
  return history;
}

export function generateMockNotificationRouting(destNames: string[]): NotificationRouting[] {
  const routes: NotificationRouting[] = [];
  for (const name of destNames) {
    if (name.toLowerCase().includes('slack')) {
      routes.push({
        channel: 'Slack',
        destination: '#ops-alerts',
        severity: ['critical', 'high'],
        throttle: '10 minutes',
      });
    } else if (name.toLowerCase().includes('email')) {
      routes.push({
        channel: 'Email',
        destination: 'oncall@example.com',
        severity: ['critical'],
        throttle: '30 minutes',
      });
    } else {
      routes.push({ channel: 'Webhook', destination: name, throttle: '5 minutes' });
    }
  }
  if (routes.length === 0) {
    routes.push({ channel: 'None', destination: 'No routing configured' });
  }
  return routes;
}

export function generateMockSuppressionRules(labels: Record<string, string>): SuppressionRule[] {
  const rules: SuppressionRule[] = [];
  if (labels.environment === 'staging') {
    rules.push({
      id: 'sup-1',
      name: 'Staging quiet hours',
      reason: 'Reduce noise from staging environment',
      schedule: 'Daily 22:00-06:00 UTC',
      active: true,
    });
  }
  if (labels.team === 'infra') {
    rules.push({
      id: 'sup-2',
      name: 'Maintenance window',
      reason: 'Weekly infrastructure maintenance',
      schedule: 'Sat 02:00-06:00 UTC',
      active: true,
    });
  }
  if (labels.service === 'node-exporter') {
    rules.push({
      id: 'sup-3',
      name: 'Auto-scaling cooldown',
      reason: 'Suppress during scale-out events',
      matchLabels: { event: 'autoscale' },
      active: false,
    });
  }
  return rules;
}

// ============================================================================
// AI Summaries and Descriptions (mock data for demo/dev)
// ============================================================================

const AI_SUMMARIES: Record<string, string> = {
  'High Error Rate':
    'This monitor tracks HTTP 5xx errors across the logs-* index pattern. It has fired 3 times in the past 7 days, primarily during peak traffic hours (14:00-18:00 UTC). The most common trigger is backend timeout errors from the checkout service. Consider increasing the threshold or adding a rate-of-change condition to reduce noise.',
  'Slow Response Time':
    'Monitors average API latency from APM data. Currently stable but has shown a gradual upward trend over the past 2 weeks (+12% p50 latency). The last firing correlated with a deployment of the order-service. No action needed now, but worth investigating the latency trend.',
  'Disk Usage by Host':
    'Bucket-level monitor checking disk usage per host. Currently disabled. When last active, it generated frequent alerts for host i-0ghi789 which has a known small root volume. Consider adding a label-based exclusion for that host before re-enabling.',
  'Authentication Failures':
    'Tracks authentication failure spikes in security logs. Has been firing intermittently due to a bot scanning campaign from IP range 203.0.113.0/24. The security team is aware and has added WAF rules. Alert frequency should decrease within 24 hours.',
  'Payment Processing Errors':
    'Critical monitor for payment failures. Currently healthy. Last triggered 3 days ago during a brief payment gateway outage (resolved in 8 minutes). This monitor has a 100% true-positive rate over the past 30 days — no tuning needed.',
  'Log Anomaly Detection':
    'ML-based anomaly detection on log patterns. Fires when anomaly score exceeds 0.8. Has a ~15% false-positive rate, mostly triggered by deployment-related log pattern changes. Consider adding a suppression rule during deployment windows.',
  HighCpuUsage:
    'Prometheus alert tracking CPU utilization across node-exporter targets. Currently firing on i-0abc123 at 92.3%. This host has been consistently hot for 2 days — likely needs vertical scaling or workload redistribution. The alert has fired 8 times this week.',
  HighMemoryUsage:
    'Critical memory pressure alert. Currently firing on i-0def456 at 94.7% memory usage. This correlates with a memory leak in the Java application running on this host (heap growing ~2% per hour). Recommend restarting the application and filing a bug for the leak.',
  DiskSpaceLow:
    'Disk space warning in staging environment. Currently pending (not yet past the 15-minute duration threshold). The staging environment accumulates test data that is cleaned weekly. This is expected behavior and will auto-resolve after the next cleanup job.',
  HighErrorRate:
    'HTTP 5xx error rate exceeding 5% threshold. Currently firing at 8.2% error rate. Root cause appears to be connection pool exhaustion on the api-gateway service. The error rate spiked 5 minutes ago and is still climbing. Immediate investigation recommended.',
  HighLatencyP99:
    'P99 latency monitor for HTTP requests. Currently inactive and healthy. Last fired 3 days ago during a database migration. The latency spike was transient and resolved within 20 minutes.',
  PodCrashLooping:
    'Kubernetes pod restart monitor. The order-service pod is crash looping with OOMKilled status. Memory limit is set to 512Mi but the service is requesting ~600Mi under load. Recommend increasing the memory limit to 768Mi.',
  DatabaseConnectionPoolExhausted:
    'Database connection pool monitor for PostgreSQL. Currently healthy with 45 of 50 connections available. Has not fired in the past 30 days. The connection pool was sized correctly after the last capacity review.',
  CertificateExpiringSoon:
    'TLS certificate expiry monitor. The certificate for api.example.com expires in 22 days. Auto-renewal is configured but has failed twice. Check the cert-manager logs and ensure the DNS-01 challenge is working correctly.',
  NetworkPacketDrops:
    'Network packet drop monitor across node-exporter targets. Currently inactive. Last fired during a network maintenance window 2 weeks ago. No action needed.',
};

export function getAiSummary(name: string): string {
  return (
    AI_SUMMARIES[name] ||
    `This monitor tracks ${name.toLowerCase()} conditions. It is currently operating within normal parameters. No recent anomalies detected in the evaluation history.`
  );
}

export function getDescription(name: string, monitorType: string, query: string): string {
  const descriptions: Record<string, string> = {
    'High Error Rate':
      'Monitors HTTP 5xx error count in the logs-* index. Triggers when error count exceeds 100 in a 5-minute window. Critical for detecting service degradation.',
    'Slow Response Time':
      'Tracks average transaction latency from APM data. Alerts when average response time exceeds 5 seconds over a 10-minute evaluation window.',
    'Disk Usage by Host':
      'Bucket-level monitor that checks disk usage percentage per host. Groups by host.name and alerts when any host exceeds 90% disk utilization.',
    'Authentication Failures':
      'Security monitor tracking authentication failure events. Triggers on spikes exceeding 50 failures in a 5-minute window to detect brute force attempts.',
    'Payment Processing Errors':
      'Critical business monitor for payment processing failures. Alerts when failed payment count exceeds 10 in a 1-minute window.',
    'Log Anomaly Detection':
      'ML-powered anomaly detection on log patterns. Uses doc-level monitoring to identify unusual log entries with anomaly scores above 0.8.',
    HighCpuUsage:
      'Prometheus alerting rule monitoring CPU utilization across all node-exporter instances. Uses irate over 5-minute windows, excluding idle CPU time.',
    HighMemoryUsage:
      'Monitors available memory as a percentage of total memory. Critical alert for memory pressure that could lead to OOM kills.',
    DiskSpaceLow:
      'Filesystem space monitor for root mountpoint. Warns when available space drops below 15% to prevent disk-full incidents.',
    HighErrorRate:
      'Calculates the ratio of 5xx responses to total HTTP requests. Critical indicator of service health and availability.',
    HighLatencyP99:
      'Tracks the 99th percentile of HTTP request duration. Alerts when tail latency exceeds 2 seconds, indicating degraded user experience.',
    PodCrashLooping:
      'Kubernetes pod stability monitor. Detects pods that are restarting frequently, indicating application crashes or resource constraints.',
    DatabaseConnectionPoolExhausted:
      'Monitors available database connections. Critical alert when pool is nearly exhausted, which would cause application errors.',
    CertificateExpiringSoon:
      'TLS certificate expiry monitor using blackbox-exporter probes. Warns 30 days before expiry to allow time for renewal.',
    NetworkPacketDrops:
      'Network health monitor tracking packet drops on all interfaces. Indicates network congestion or hardware issues.',
  };
  return descriptions[name] || `${monitorType} monitor evaluating: ${query.substring(0, 100)}...`;
}

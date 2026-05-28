/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the Prometheus-episode → unified mapper.
 *
 * Exercised cases:
 *   - Active episode (`stillActiveAtRangeEnd`) ⇒ `state: 'active'`.
 *   - Resolved episode ⇒ `state: 'resolved'`.
 *   - Missing `labels.severity` ⇒ fallback `'medium'` (plan override —
 *     historical episodes prefer medium over `'info'` so they sort with
 *     real alerts rather than below them).
 *   - `truncatedStart` flag ⇒ `annotations.truncatedStart = 'true'`.
 */
import {
  osAlertToUnified,
  osMonitorToUnifiedRuleSummary,
  promEpisodeToUnified,
} from '../alert_utils';
import type { OSMonitor } from '../../../../common/types/alerting';

describe('promEpisodeToUnified', () => {
  const START = Date.UTC(2024, 0, 15, 12, 0, 0);
  const END = Date.UTC(2024, 0, 15, 13, 0, 0);

  it('maps an active episode to state "active" with critical severity', () => {
    const u = promEpisodeToUnified(
      {
        labels: { alertname: 'HighCPU', instance: 'i-1', severity: 'critical' },
        startMs: START,
        endMs: END,
        stillActiveAtRangeEnd: true,
      },
      'ds-prom'
    );
    expect(u.state).toBe('active');
    expect(u.severity).toBe('critical');
    expect(u.name).toBe('HighCPU');
    expect(u.datasourceId).toBe('ds-prom');
    expect(u.datasourceType).toBe('prometheus');
    expect(u.startTime).toBe(new Date(START).toISOString());
    expect(u.lastUpdated).toBe(new Date(END).toISOString());
  });

  it('maps a resolved episode to state "resolved"', () => {
    const u = promEpisodeToUnified(
      {
        labels: { alertname: 'HighCPU', severity: 'high' },
        startMs: START,
        endMs: END,
      },
      'ds-prom'
    );
    expect(u.state).toBe('resolved');
    expect(u.severity).toBe('high');
  });

  it('missing severity ⇒ fallback "medium" (historical-episode override)', () => {
    const u = promEpisodeToUnified(
      {
        labels: { alertname: 'NoSev' },
        startMs: START,
        endMs: END,
      },
      'ds-prom'
    );
    expect(u.severity).toBe('medium');
  });

  it('empty-string severity ⇒ fallback "medium" (treated same as missing)', () => {
    // Empty-string severity labels turn up on Prometheus recording rules;
    // they should sort with the historical-episode fallback rather than
    // slipping through to `promSeverityFromLabels` (which would return
    // `'info'`, sinking the episode below real alerts).
    const u = promEpisodeToUnified(
      {
        labels: { alertname: 'EmptySev', severity: '' },
        startMs: START,
        endMs: END,
      },
      'ds-prom'
    );
    expect(u.severity).toBe('medium');
  });

  it('truncatedStart flag emits annotations.truncatedStart = "true"', () => {
    const u = promEpisodeToUnified(
      {
        labels: { alertname: 'EarlyFire', severity: 'high' },
        startMs: START,
        endMs: END,
        truncatedStart: true,
      },
      'ds-prom'
    );
    expect(u.annotations.truncatedStart).toBe('true');
  });

  it('no truncatedStart ⇒ annotation absent', () => {
    const u = promEpisodeToUnified(
      {
        labels: { alertname: 'X', severity: 'low' },
        startMs: START,
        endMs: END,
      },
      'ds-prom'
    );
    expect(u.annotations.truncatedStart).toBeUndefined();
  });

  it('id incorporates datasource, alertname, label-hash, and startMs', () => {
    const u = promEpisodeToUnified(
      {
        labels: { alertname: 'X', instance: 'host-1' },
        startMs: 12345,
        endMs: END,
      },
      'ds-prom'
    );
    // Human-readable parts stay in the id for log-grep-ability.
    expect(u.id).toContain('ds-prom');
    expect(u.id).toContain('X');
    expect(u.id).toContain('12345');
    // The label set (`instance: host-1` among them) is rolled into an
    // 8-char hex hash, not emitted verbatim — otherwise we can't
    // disambiguate rules with no `instance` label but different
    // `service_name` / `job` / etc.
    expect(u.id).toMatch(/ds-prom-X-[0-9a-f]{8}-12345/);
  });

  it('differing labels ⇒ different ids (same alertname)', () => {
    const a = promEpisodeToUnified(
      {
        labels: { alertname: 'ServiceError', service_name: 'cart' },
        startMs: 1000,
        endMs: 2000,
      },
      'ds-prom'
    );
    const b = promEpisodeToUnified(
      {
        labels: { alertname: 'ServiceError', service_name: 'checkout' },
        startMs: 1000,
        endMs: 2000,
      },
      'ds-prom'
    );
    expect(a.id).not.toBe(b.id);
  });

  it('same labels ⇒ deterministic id (hash is stable)', () => {
    // Two separate calls with the same inputs must produce the same id —
    // otherwise the UI's React key would churn and tables would flash.
    const u1 = promEpisodeToUnified(
      { labels: { alertname: 'X', severity: 'info' }, startMs: 0, endMs: 1 },
      'ds-prom'
    );
    const u2 = promEpisodeToUnified(
      { labels: { alertname: 'X', severity: 'info' }, startMs: 0, endMs: 1 },
      'ds-prom'
    );
    expect(u1.id).toBe(u2.id);
  });

  it('label-hash is insensitive to key insertion order', () => {
    const u1 = promEpisodeToUnified(
      { labels: { alertname: 'X', severity: 'info', job: 'a' }, startMs: 0, endMs: 1 },
      'ds-prom'
    );
    const u2 = promEpisodeToUnified(
      { labels: { job: 'a', severity: 'info', alertname: 'X' }, startMs: 0, endMs: 1 },
      'ds-prom'
    );
    expect(u1.id).toBe(u2.id);
  });
});

describe('osAlertToUnified', () => {
  const baseAlert = {
    id: 'alert-1',
    monitor_id: 'mon-abc',
    monitor_name: 'My Monitor',
    trigger_name: 'trig-1',
    state: 'ACTIVE',
    severity: '2',
    error_message: null,
    start_time: Date.UTC(2024, 0, 15, 12, 0, 0),
    last_notification_time: Date.UTC(2024, 0, 15, 12, 5, 0),
    end_time: null,
    acknowledged_time: null,
    action_execution_results: [],
  };

  it('includes monitor_id in labels for acknowledge support', () => {
    const u = osAlertToUnified(baseAlert as never, 'ds-os');
    expect(u.labels.monitor_id).toBe('mon-abc');
    expect(u.labels.monitor_name).toBe('My Monitor');
    expect(u.labels.trigger_name).toBe('trig-1');
  });

  it('maps datasourceId from the passed dsId', () => {
    const u = osAlertToUnified(baseAlert as never, 'ds-os');
    expect(u.datasourceId).toBe('ds-os');
    expect(u.datasourceType).toBe('opensearch');
  });
});

// ============================================================================
// osMonitorToUnifiedRuleSummary — monitorType derivation from index prefixes
// ============================================================================
//
// Regression coverage for the L5 cleanup that hoisted the previously-inline
// prefix list into named `LOG_INDEX_PREFIXES` / `APM_INDEX_PREFIXES`
// constants. Encodes the schema list so adding a new well-known schema
// (e.g. SS4O metrics) is a one-line constant change with a single test
// case to follow.

describe('osMonitorToUnifiedRuleSummary — monitorType derivation', () => {
  function buildMonitor(indices: string[]): OSMonitor {
    return ({
      id: 'mon-1',
      type: 'monitor',
      monitor_type: 'query_level_monitor',
      name: 'm',
      enabled: true,
      schedule: { period: { interval: 1, unit: 'MINUTES' } },
      inputs: [
        {
          search: {
            indices,
            query: { size: 0, query: { match_all: {} } },
          },
        },
      ],
      triggers: [],
      last_update_time: 1700000000000,
    } as unknown) as OSMonitor;
  }

  it.each([['logs-2024.01.15'], ['logs-prod-app'], ['ss4o_logs-myapp'], ['ss4o_logs']])(
    'classifies %s as a log monitor',
    (idx) => {
      expect(osMonitorToUnifiedRuleSummary(buildMonitor([idx]), 'ds').monitorType).toBe('log');
    }
  );

  it.each([
    ['otel-v1-apm-span'],
    ['otel-v1-apm-service-map'],
    ['ss4o_traces-myapp'],
    ['ss4o_traces'],
  ])('classifies %s as an apm monitor', (idx) => {
    expect(osMonitorToUnifiedRuleSummary(buildMonitor([idx]), 'ds').monitorType).toBe('apm');
  });

  it('falls back to "metric" for indices that match no schema prefix', () => {
    const r = osMonitorToUnifiedRuleSummary(buildMonitor(['my-custom-index', 'foo-*']), 'ds');
    expect(r.monitorType).toBe('metric');
  });

  it('falls back to "metric" when no input indices are present', () => {
    const r = osMonitorToUnifiedRuleSummary(buildMonitor([]), 'ds');
    expect(r.monitorType).toBe('metric');
  });

  it('treats the first matching prefix as authoritative — log wins over apm when both are present', () => {
    const r = osMonitorToUnifiedRuleSummary(buildMonitor(['logs-app', 'otel-v1-apm-span']), 'ds');
    expect(r.monitorType).toBe('log');
  });
});

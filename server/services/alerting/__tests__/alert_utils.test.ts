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
  adDetectorToUnifiedRuleSummary,
  adForecasterToUnifiedRuleSummary,
  extractADAnomalyResultIdsFromMonitor,
  osAlertToUnified,
  osMonitorToUnifiedRuleSummary,
  promEpisodeToUnified,
  runtimeStateToMonitorStatus,
  stripTrailingComparison,
} from '../alert_utils';
import type { MonitorStatus, OSMonitor } from '../../../../common/types/alerting';

describe('stripTrailingComparison', () => {
  it('strips a simple trailing comparison', () => {
    expect(stripTrailingComparison('rate(http_requests_total[5m]) > 0.5')).toBe(
      'rate(http_requests_total[5m])'
    );
  });

  it('strips every comparison operator', () => {
    expect(stripTrailingComparison('up >= 1')).toBe('up');
    expect(stripTrailingComparison('up <= 1')).toBe('up');
    expect(stripTrailingComparison('up < 1')).toBe('up');
    expect(stripTrailingComparison('up == 0')).toBe('up');
    expect(stripTrailingComparison('up != 0')).toBe('up');
  });

  it('handles scientific-notation and negative thresholds', () => {
    expect(stripTrailingComparison('foo > 1e3')).toBe('foo');
    expect(stripTrailingComparison('foo > 1.5e-3')).toBe('foo');
    expect(stripTrailingComparison('foo > -0.5')).toBe('foo');
  });

  it('leaves a compound / multi-comparison expression unchanged rather than mangling it', () => {
    // Stripping only the trailing `> 2` would yield the nonsensical
    // `a > 1 and b`; the residual comparison is detected so the whole
    // expression is preserved instead.
    const compound = 'a > 1 and b > 2';
    expect(stripTrailingComparison(compound)).toBe(compound);
  });

  it('returns the original when the expression is only a comparison / avoids empty output', () => {
    // A metric-less expression trims to empty after the strip; fall back to the
    // original so we never issue an empty query.
    expect(stripTrailingComparison('   ')).toBe('');
    expect(stripTrailingComparison('up')).toBe('up');
  });
});

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
// osMonitorToUnifiedRuleSummary — monitorType derivation
// ============================================================================
//
// The Rules-tab "Type" is derived from the detected monitor kind: composite,
// cluster-metrics, and anomaly-detector monitors keep their own types; every
// other OpenSearch monitor — per-query, per-bucket, per-document — is surfaced
// under a single "Log" type (the old apm/log/metric index-name heuristic was
// removed because it guessed a data domain rather than the monitor mechanism).

describe('osMonitorToUnifiedRuleSummary — monitorType derivation', () => {
  function buildMonitor(indices: string[]): OSMonitor {
    return {
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
    } as unknown as OSMonitor;
  }

  it.each([['logs-2024.01.15'], ['logs-prod-app'], ['ss4o_logs-myapp'], ['ss4o_logs']])(
    'classifies %s as a log monitor',
    (idx) => {
      expect(osMonitorToUnifiedRuleSummary(buildMonitor([idx]), 'ds').monitorType).toBe('log');
    }
  );

  // Per-query monitors are surfaced as "log" regardless of the index they
  // target — the index-name domain heuristic (apm/metric) was removed.
  it.each([['otel-v1-apm-span'], ['ss4o_traces-myapp'], ['my-custom-index'], ['foo-*']])(
    'classifies a query monitor over %s as a log monitor',
    (idx) => {
      expect(osMonitorToUnifiedRuleSummary(buildMonitor([idx]), 'ds').monitorType).toBe('log');
    }
  );

  it('classifies a query monitor with no indices as a log monitor', () => {
    expect(osMonitorToUnifiedRuleSummary(buildMonitor([]), 'ds').monitorType).toBe('log');
  });

  it.each([['.opendistro-anomaly-results*'], ['opensearch-ad-plugin-result-test-history-*']])(
    'classifies %s as an anomaly detector monitor',
    (idx) => {
      expect(osMonitorToUnifiedRuleSummary(buildMonitor([idx]), 'ds').monitorType).toBe(
        'anomaly_detector_monitor'
      );
    }
  );

  it('classifies detector-id query monitors as anomaly detector monitors', () => {
    const monitor = buildMonitor(['custom-results-index']);
    const input = monitor.inputs[0] as Extract<OSMonitor['inputs'][number], { search: unknown }>;
    input.search.query = {
      size: 1,
      query: {
        bool: {
          filter: [{ term: { detector_id: { value: 'detector-1' } } }],
        },
      },
      aggregations: {
        max_anomaly_grade: { max: { field: 'anomaly_grade' } },
      },
    };
    expect(osMonitorToUnifiedRuleSummary(monitor, 'ds').monitorType).toBe(
      'anomaly_detector_monitor'
    );
  });

  it('extracts explicit anomaly result ids from detector-backed monitor queries', () => {
    const monitor = buildMonitor(['.opendistro-anomaly-results*']);
    const input = monitor.inputs[0] as Extract<OSMonitor['inputs'][number], { search: unknown }>;
    input.search.query = {
      query: {
        bool: {
          filter: [
            { term: { detector_id: { value: 'detector-1' } } },
            { term: { _id: { value: 'anomaly-1' } } },
            { terms: { anomaly_result_id: ['anomaly-2'] } },
          ],
        },
      },
    };

    expect(extractADAnomalyResultIdsFromMonitor(monitor)).toEqual(['anomaly-1', 'anomaly-2']);
  });

  it('classifies bucket-level monitors as a log monitor', () => {
    const m = {
      ...buildMonitor(['logs-x']),
      monitor_type: 'bucket_level_monitor',
    } as unknown as OSMonitor;
    expect(osMonitorToUnifiedRuleSummary(m, 'ds').monitorType).toBe('log');
  });

  it('classifies doc-level monitors as a log monitor', () => {
    const m = {
      ...buildMonitor([]),
      monitor_type: 'doc_level_monitor',
      inputs: [{ doc_level_input: { description: '', indices: ['logs-x'], queries: [] } }],
    } as unknown as OSMonitor;
    expect(osMonitorToUnifiedRuleSummary(m, 'ds').monitorType).toBe('log');
  });

  it('keeps cluster-metrics monitors classified as cluster_metrics', () => {
    const m = {
      ...buildMonitor([]),
      inputs: [
        {
          uri: {
            api_type: 'CLUSTER_HEALTH',
            path: '/_cluster/health',
            path_params: '',
            url: '',
            clusters: [],
          },
        },
      ],
    } as unknown as OSMonitor;
    expect(osMonitorToUnifiedRuleSummary(m, 'ds').monitorType).toBe('cluster_metrics');
  });

  it('classifies composite (workflow) monitors as "composite" and surfaces member monitor ids', () => {
    // Workflows are returned by the monitors search with no monitor_type (so
    // mapMonitor coerces to query_level_monitor); the composite_input is the
    // authoritative signal.
    const composite = {
      id: 'wf-1',
      type: 'monitor',
      monitor_type: 'query_level_monitor',
      name: 'composite-wf',
      enabled: true,
      schedule: { period: { interval: 1, unit: 'MINUTES' } },
      inputs: [
        {
          composite_input: {
            sequence: {
              delegates: [
                { order: 2, monitor_id: 'mon-b' },
                { order: 1, monitor_id: 'mon-a' },
              ],
            },
          },
        },
      ],
      triggers: [],
      last_update_time: 1700000000000,
    } as unknown as OSMonitor;

    const r = osMonitorToUnifiedRuleSummary(composite, 'ds');
    expect(r.monitorType).toBe('composite');
    expect(r.labels?.monitor_kind).toBe('composite');
    // Ordered by `order`, so mon-a (order 1) precedes mon-b (order 2).
    expect(r.labels?.composite_delegates).toBe('mon-a,mon-b');
    expect(r.query).toBe('mon-a, mon-b');
  });
});

describe('adForecasterToUnifiedRuleSummary', () => {
  it('maps a forecasting forecaster into a read-only unified rule summary', () => {
    const rule = adForecasterToUnifiedRuleSummary(
      {
        id: 'forecaster-1',
        name: 'CPU forecast',
        description: 'Forecast host CPU',
        indices: ['metrics-*'],
        time_field: '@timestamp',
        category_field: ['host'],
        last_update_time: Date.UTC(2026, 5, 10, 12, 0, 0),
        forecast_interval: { period: { interval: 5, unit: 'Minutes' } },
        window_delay: { period: { interval: 1, unit: 'Minutes' } },
        feature_attributes: [
          {
            feature_name: 'cpu_sum',
            feature_enabled: true,
            aggregation_query: { cpu_sum: { sum: { field: 'cpu' } } },
          },
        ],
        user: { name: 'admin' },
      },
      'ds-os'
    );

    expect(rule.definitionType).toBe('forecaster');
    expect(rule.monitorType).toBe('forecaster');
    expect(rule.name).toBe('CPU forecast');
    expect(rule.query).toBe('metrics-*');
    expect(rule.condition).toBe('1 feature forecasted');
    expect(rule.labels.source).toBe('forecasting');
    expect(rule.labels.forecaster_type).toBe('high_cardinality');
    expect(rule.labels.time_field).toBe('@timestamp');
    expect(rule.annotations.features).toBe('cpu_sum');
    expect(rule.evaluationInterval).toBe('5 minutes');
    expect(rule.pendingPeriod).toBe('1 minutes');
    expect(rule.createdBy).toBe('admin');
  });

  it('uses the forecaster runtime state as the unified rule status', () => {
    const rule = adForecasterToUnifiedRuleSummary(
      {
        id: 'forecaster-1',
        name: 'CPU forecast',
        curState: 'INITIALIZING_FORECAST' as MonitorStatus,
        indices: ['metrics-*'],
      },
      'ds-os'
    );

    expect(rule.status).toBe('Initializing forecast');
    expect(rule.healthStatus).toBe('healthy');
  });
});

describe('adDetectorToUnifiedRuleSummary', () => {
  it('uses the detector runtime state as the unified rule status', () => {
    const rule = adDetectorToUnifiedRuleSummary(
      {
        id: 'detector-1',
        name: 'Flight detector',
        curState: 'RUNNING' as MonitorStatus,
        indices: ['flights'],
      },
      'ds-os'
    );

    expect(rule.status).toBe('Running');
    expect(rule.enabled).toBe(true);
    expect(rule.healthStatus).toBe('healthy');
  });

  it('marks stopped detectors as disabled/no data', () => {
    const rule = adDetectorToUnifiedRuleSummary(
      {
        id: 'detector-1',
        name: 'Flight detector',
        curState: 'DISABLED' as MonitorStatus,
        indices: ['flights'],
      },
      'ds-os'
    );

    expect(rule.status).toBe('Stopped');
    expect(rule.enabled).toBe(false);
    expect(rule.healthStatus).toBe('no_data');
  });

  it('does not report a detector as running when runtime and job state are unavailable', () => {
    const rule = adDetectorToUnifiedRuleSummary(
      {
        id: 'detector-1',
        name: 'Never-started detector',
        indices: ['flights'],
      },
      'ds-os'
    );

    expect(rule.status).toBe('Inactive not started');
    expect(rule.enabled).toBe(false);
    expect(rule.healthStatus).toBe('no_data');
  });

  it('uses the detector job state when runtime profile state is unavailable', () => {
    const rule = adDetectorToUnifiedRuleSummary(
      {
        id: 'detector-1',
        name: 'Running detector',
        indices: ['flights'],
        anomaly_detector_job: { enabled: true },
      },
      'ds-os'
    );

    expect(rule.status).toBe('Running');
    expect(rule.enabled).toBe(true);
    expect(rule.healthStatus).toBe('healthy');
  });
});

describe('runtimeStateToMonitorStatus', () => {
  it('normalizes AD profile state keys to display labels', () => {
    expect(runtimeStateToMonitorStatus('INIT')).toBe('Initializing');
    expect(runtimeStateToMonitorStatus('Awaiting data to restart')).toBe(
      'Awaiting data to restart'
    );
  });
});

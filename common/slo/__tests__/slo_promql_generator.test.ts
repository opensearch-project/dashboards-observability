/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DEFAULT_MWMBR_TIERS,
  RECORDING_WINDOWS,
  generateSloRuleGroup,
  parseDurationToMs,
  findClosestRecordingWindow,
  ruleSuffix,
  slugifySloObjective,
} from '../slo_promql_generator';
import type { SloDocument } from '../slo_types';

function baseSlo(overrides: Partial<SloDocument['spec']> = {}): SloDocument {
  return {
    id: 'slo-test-001',
    spec: {
      datasourceId: 'prom-ds-001',
      name: 'API Availability',
      enabled: true,
      mode: 'active',
      service: 'api-gateway',
      owner: { teams: ['platform'] },
      sli: {
        type: 'single',
        definition: {
          backend: 'prometheus',
          type: 'availability',
          calcMethod: 'events',
          metric: 'http_requests_total',
          goodEventsFilter: 'status_code!~"5.."',
        },
        dimensions: [
          { name: 'service', value: 'api-gateway' },
          { name: 'handler', value: '/api/v1/users' },
        ],
      },
      objectives: [{ name: 'availability-99-9', target: 0.999 }],
      budgetWarningThresholds: [
        { threshold: 0.5, severity: 'warning' },
        { threshold: 0.2, severity: 'critical' },
      ],
      window: { type: 'rolling', duration: '30d' },
      alerting: { strategy: 'mwmbr', burnRates: DEFAULT_MWMBR_TIERS.map((t) => ({ ...t })) },
      alarms: {
        sliHealth: { enabled: false },
        attainmentBreach: { enabled: false },
        budgetWarning: { enabled: true },
        noData: { enabled: false, forDuration: '10m' },
        resolved: { enabled: false },
      },
      exclusionWindows: [],
      labels: {},
      annotations: {},
      ...overrides,
    },
    status: {
      version: 1,
      createdAt: '2026-04-22T00:00:00.000Z',
      createdBy: 'test',
      updatedAt: '2026-04-22T00:00:00.000Z',
      updatedBy: 'test',
      provisioning: {
        backend: 'prometheus',
        alertGroupName: 'slo:api_availability_abcd1234',
        rulerNamespace: 'slo-generated',
      },
    },
  };
}

describe('parseDurationToMs', () => {
  it('parses common Prometheus durations', () => {
    expect(parseDurationToMs('5m')).toBe(5 * 60_000);
    expect(parseDurationToMs('1h')).toBe(3_600_000);
    expect(parseDurationToMs('3d')).toBe(3 * 86_400_000);
    expect(parseDurationToMs('1w')).toBe(604_800_000);
  });
  it('returns 0 for unparseable input', () => {
    expect(parseDurationToMs('bogus')).toBe(0);
    expect(parseDurationToMs('')).toBe(0);
  });
});

describe('findClosestRecordingWindow', () => {
  it('returns the first window >= target', () => {
    expect(findClosestRecordingWindow('5m')).toBe('5m');
    expect(findClosestRecordingWindow('45m')).toBe('1h');
    expect(findClosestRecordingWindow('1d')).toBe('1d');
  });
  it('returns the longest recording window when the target exceeds all windows', () => {
    expect(findClosestRecordingWindow('30d')).toBe('3d');
    expect(findClosestRecordingWindow('7d')).toBe('3d');
  });
});

describe('ruleSuffix', () => {
  it('is deterministic', () => {
    const a = ruleSuffix('ws1', 'slo-1', 'obj-a');
    const b = ruleSuffix('ws1', 'slo-1', 'obj-a');
    expect(a).toBe(b);
  });
  it('distinguishes workspaces, SLOs, and objectives', () => {
    const a = ruleSuffix('ws1', 'slo-1', 'obj-a');
    const b = ruleSuffix('ws2', 'slo-1', 'obj-a');
    const c = ruleSuffix('ws1', 'slo-2', 'obj-a');
    const d = ruleSuffix('ws1', 'slo-1', 'obj-b');
    expect(new Set([a, b, c, d]).size).toBe(4);
  });
  it('is 8 hex characters', () => {
    const s = ruleSuffix('x', 'y', 'z');
    expect(s).toMatch(/^[0-9a-f]{8}$/);
  });

  // Pinned-hash guard: rule-name contract commits to
  // sha256(workspace:sloId:objective).slice(0,8). Value computed with:
  //   node -e "console.log(require('crypto').createHash('sha256')
  //     .update('ws-1:slo-abc:availability').digest('hex').slice(0,8))"
  // If this value changes, external dashboards / Alertmanager silences /
  // GitOps manifests pinning rule names will break. Coordinate a migration
  // before touching this.
  it('matches the pinned sha256 prefix for a known triple', () => {
    expect(ruleSuffix('ws-1', 'slo-abc', 'availability')).toBe('3e048ec6');
  });
});

describe('slugifySloObjective', () => {
  it('lowercases and collapses non-alphanum to underscores', () => {
    expect(slugifySloObjective('API Gateway', 'availability-99-9')).toBe(
      'api_gateway_availability_99_9'
    );
  });
});

describe('generateSloRuleGroup — availability, single objective', () => {
  it('generates 7 recording + 4 burn-rate + 2 budget warnings = 13 rules', () => {
    const group = generateSloRuleGroup(baseSlo());
    expect(group.rules).toHaveLength(13);

    const recording = group.rules.filter((r) => r.type === 'recording');
    const alerting = group.rules.filter((r) => r.type === 'alerting');
    expect(recording).toHaveLength(7);
    expect(alerting).toHaveLength(6);

    const burnRates = alerting.filter((r) => r.labels.slo_alarm_type === 'burn_rate');
    const warnings = alerting.filter((r) => r.labels.slo_alarm_type === 'error_budget_warning');
    expect(burnRates).toHaveLength(4);
    expect(warnings).toHaveLength(2);
  });

  it('emits one recording rule per RECORDING_WINDOWS entry', () => {
    const group = generateSloRuleGroup(baseSlo());
    const recordingWindows = group.rules
      .filter((r) => r.type === 'recording')
      .map((r) => r.labels.slo_window)
      .sort();
    expect(recordingWindows).toEqual([...RECORDING_WINDOWS].sort());
  });

  it('attaches slo_id, slo_name, slo_objective, slo_service on every rule', () => {
    const group = generateSloRuleGroup(baseSlo());
    for (const rule of group.rules) {
      expect(rule.labels.slo_id).toBe('slo-test-001');
      expect(rule.labels.slo_name).toBe('API Availability');
      expect(rule.labels.slo_objective).toBe('availability-99-9');
      expect(rule.labels.slo_service).toBe('api-gateway');
      expect(rule.labels.slo_owner_team).toBe('platform');
    }
  });

  it('propagates spec.labels as slo_label_<key>', () => {
    const doc = baseSlo({ labels: { compliance: 'pci', region: ['us-west-2', 'us-east-1'] } });
    const group = generateSloRuleGroup(doc);
    const rule = group.rules[0];
    expect(rule.labels.slo_label_compliance).toBe('pci');
    expect(rule.labels.slo_label_region).toBe('us-west-2,us-east-1');
  });

  it('does not propagate spec.annotations', () => {
    const doc = baseSlo({ annotations: { runbook: 'https://wiki/slo/api' } });
    const group = generateSloRuleGroup(doc);
    for (const rule of group.rules) {
      expect(rule.labels.slo_label_runbook).toBeUndefined();
      expect(rule.labels.runbook).toBeUndefined();
      expect(rule.annotations?.runbook).toBeUndefined();
    }
  });

  it('burn-rate thresholds match burnRateMultiplier * errorBudget', () => {
    const group = generateSloRuleGroup(baseSlo());
    const burnRates = group.rules.filter(
      (r) => r.type === 'alerting' && r.labels.slo_alarm_type === 'burn_rate'
    );
    // 99.9% target → 0.001 error budget → page-quick threshold = 14.4 × 0.001 = 0.0144
    const pageQuick = burnRates.find((r) => r.labels.slo_burn_rate_multiplier === '14.4')!;
    expect(pageQuick.expr).toContain('> 0.0144');
    const pageSlow = burnRates.find((r) => r.labels.slo_burn_rate_multiplier === '6')!;
    expect(pageSlow.expr).toContain('> 0.006');
  });

  // Regression: target=0.99999 with multiplier=0.001 yields threshold=1e-8.
  // Earlier impl emitted toFixed(6).trim() = "0", so the alert expr collapsed
  // to `... > 0` and fired on any non-zero error.
  it('preserves sub-decimal thresholds via exponential notation', () => {
    const doc = baseSlo({
      objectives: [{ name: 'extreme-target', target: 0.99999 }],
      alerting: {
        strategy: 'mwmbr',
        burnRates: [
          {
            shortWindow: '5m',
            longWindow: '1h',
            burnRateMultiplier: 0.001,
            severity: 'page',
            createAlarm: true,
            forDuration: '2m',
          },
        ],
      },
    });
    const group = generateSloRuleGroup(doc);
    const burnRate = group.rules.find(
      (r) => r.type === 'alerting' && r.labels.slo_alarm_type === 'burn_rate'
    );
    expect(burnRate).toBeDefined();
    // Threshold is non-zero (would otherwise produce a false-alarm storm).
    expect(burnRate!.expr).not.toMatch(/>\s*0(\D|$)/);
    // Sub-decimal threshold renders in exponential notation.
    expect(burnRate!.expr).toMatch(/>\s*\d(\.\d+)?e-\d/);
  });

  // Guards against #S5-burnrate-label-mismatch. Recording rules emit different
  // `slo_window` label values for the short vs. long window (e.g. 5m vs 1h), so
  // a bare `and` join produces an empty vector and the alert never fires. The
  // fix is `and ignoring(slo_window)`. If this test fails, every MWMBR
  // burn-rate alert is silently broken end-to-end.
  it('joins short/long recording rules with `and ignoring(slo_window)` so vector match succeeds', () => {
    const group = generateSloRuleGroup(baseSlo());
    const burnRates = group.rules.filter(
      (r) => r.type === 'alerting' && r.labels.slo_alarm_type === 'burn_rate'
    );
    // Design §6.4 — 4 MWMBR tiers (PageQuick, PageSlow, TicketQuick, TicketSlow).
    expect(burnRates).toHaveLength(4);
    for (const rule of burnRates) {
      expect(rule.expr).toContain('and ignoring(slo_window)');
      // No bare `and` that would hit slo_window on the right-hand side.
      expect(rule.expr).not.toMatch(/\nand\n/);
    }

    // Semantic guard: for the join to succeed, the two recording-rule label
    // sets the alert references must differ only in `slo_window`. If anything
    // else diverges (e.g. a future label added only to one window),
    // `ignoring(slo_window)` is no longer sufficient.
    const recording = group.rules.filter((r) => r.type === 'recording');
    const shortRec = recording.find((r) => r.labels.slo_window === '5m')!;
    const longRec = recording.find((r) => r.labels.slo_window === '1h')!;
    const stripWindow = (labels: Record<string, string>) => {
      const { slo_window: _ignored, ...rest } = labels;
      return rest;
    };
    expect(stripWindow(shortRec.labels)).toEqual(stripWindow(longRec.labels));
  });
});

describe('generateSloRuleGroup — shadow mode', () => {
  it('suppresses all alerting rules; only recording rules are emitted', () => {
    const doc = baseSlo({ mode: 'shadow' });
    const group = generateSloRuleGroup(doc);
    const alerting = group.rules.filter((r) => r.type === 'alerting');
    expect(alerting).toHaveLength(0);
    expect(group.rules.length).toBe(7);
  });
});

describe('generateSloRuleGroup — multi-objective', () => {
  it('multiplies rule counts by the number of objectives', () => {
    const doc = baseSlo({
      objectives: [
        { name: 'availability-99-9', target: 0.999 },
        { name: 'availability-99-5', target: 0.995 },
      ],
    });
    const group = generateSloRuleGroup(doc);
    // 13 rules × 2 objectives = 26
    expect(group.rules).toHaveLength(26);
  });
});

describe('generateSloRuleGroup — latency_threshold', () => {
  it('uses histogram_bucket metrics and the objective latency bound', () => {
    const doc = baseSlo({
      sli: {
        type: 'single',
        definition: {
          backend: 'prometheus',
          type: 'latency_threshold',
          calcMethod: 'events',
          metric: 'http_request_duration_seconds_bucket',
          latencyThresholdUnit: 'seconds',
        },
        dimensions: [{ name: 'service', value: 'api' }],
      },
      objectives: [{ name: 'latency-p99', target: 0.99, latencyThreshold: 0.5 }],
    });
    const group = generateSloRuleGroup(doc);
    const rec5m = group.rules.find((r) => r.type === 'recording' && r.labels.slo_window === '5m')!;
    expect(rec5m.expr).toContain('http_request_duration_seconds_bucket');
    expect(rec5m.expr).toContain('le="0.5"');
    expect(rec5m.expr).toContain('le="+Inf"');
  });

  it('scales ms thresholds to seconds for the le selector', () => {
    const doc = baseSlo({
      sli: {
        type: 'single',
        definition: {
          backend: 'prometheus',
          type: 'latency_threshold',
          calcMethod: 'events',
          metric: 'http_request_duration_milliseconds_bucket',
          latencyThresholdUnit: 'milliseconds',
        },
        dimensions: [{ name: 'service', value: 'api' }],
      },
      objectives: [{ name: 'latency-p99', target: 0.99, latencyThreshold: 500 }],
    });
    const group = generateSloRuleGroup(doc);
    const rec = group.rules.find((r) => r.type === 'recording' && r.labels.slo_window === '5m')!;
    expect(rec.expr).toContain('le="0.5"');
  });
});

describe('generateSloRuleGroup — window approximation', () => {
  it('tags attainment alerts with slo_window_approximated when window > 3d', () => {
    const doc = baseSlo({
      alarms: {
        sliHealth: { enabled: false },
        attainmentBreach: { enabled: true },
        budgetWarning: { enabled: true },
        noData: { enabled: false, forDuration: '10m' },
        resolved: { enabled: false },
      },
    });
    const group = generateSloRuleGroup(doc);
    const attainment = group.rules.find(
      (r) => r.type === 'alerting' && r.labels.slo_alarm_type === 'attainment'
    )!;
    expect(attainment.labels.slo_window_approximated).toBe('true');
  });

  it('does not tag attainment alerts when window <= 3d', () => {
    const doc = baseSlo({
      window: { type: 'rolling', duration: '3d' },
      alarms: {
        sliHealth: { enabled: false },
        attainmentBreach: { enabled: true },
        budgetWarning: { enabled: true },
        noData: { enabled: false, forDuration: '10m' },
        resolved: { enabled: false },
      },
    });
    const group = generateSloRuleGroup(doc);
    const attainment = group.rules.find(
      (r) => r.type === 'alerting' && r.labels.slo_alarm_type === 'attainment'
    )!;
    expect(attainment.labels.slo_window_approximated).toBeUndefined();
  });
});

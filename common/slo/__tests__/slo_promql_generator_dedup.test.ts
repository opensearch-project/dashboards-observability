/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Dedup-mode generator split.
 *
 * Exercises the fingerprint-keyed recording-group builder and the
 * per-SLO alert-group builder. The critical invariants:
 *
 *   - Recording rules carry NO SLO-identity labels (only `slo_window`).
 *   - Alert rules DO carry full SLO identity labels.
 *   - fpA === fpB  ⟹  recordingRulesFor(fpA) === recordingRulesFor(fpB)
 *     (byte-equal) — the dedup invariant the registry relies on.
 *   - Shadow mode / `createAlarm: false` yields an empty alert group; the
 *     caller is responsible for inserting a sentinel.
 */

import {
  DEFAULT_MWMBR_TIERS,
  dedupRecordingGroupName,
  dedupRecordingRuleName,
  generateAlertGroupFor,
  generateRecordingGroupForFingerprint,
} from '../slo_promql_generator';
import type { SingleSli, SloDocument, SloSpec } from '../slo_types';

function validSpec(overrides: Partial<SloSpec> = {}): SloSpec {
  return {
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
        goodEventsFilter: 'status!~"5.."',
      },
      dimensions: [{ name: 'service', value: 'api-gateway' }],
    },
    objectives: [{ name: 'availability-99-9', target: 0.999 }],
    budgetWarningThresholds: [{ threshold: 0.5, severity: 'warning' }],
    window: { type: 'rolling', duration: '28d' },
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
  };
}

function doc(spec: SloSpec = validSpec(), id = 'slo-abc'): SloDocument {
  return {
    id,
    spec,
    status: {
      version: 1,
      createdAt: '2026-04-28T10:00:00.000Z',
      createdBy: 'alice',
      updatedAt: '2026-04-28T10:00:00.000Z',
      updatedBy: 'alice',
      provisioning: {
        backend: 'prometheus',
        rulerNamespace: 'slo-generated-prom-ds-001',
      },
    },
  };
}

const FP_A = 'a1b2c3d4e5f60718';
const FP_B = 'f0e1d2c3b4a59687';

describe('dedupRecordingGroupName / dedupRecordingRuleName', () => {
  it('emits the slo:rec:<fp> group name', () => {
    expect(dedupRecordingGroupName(FP_A)).toBe(`slo:rec:${FP_A}`);
  });

  it('emits the slo:sli_error:ratio_rate_<w>:sli_<fp> rule name', () => {
    expect(dedupRecordingRuleName(FP_A, '5m')).toBe(`slo:sli_error:ratio_rate_5m:sli_${FP_A}`);
  });
});

describe('generateRecordingGroupForFingerprint', () => {
  const availSli = validSpec().sli as SingleSli;

  it('emits 7 recording rules (one per RECORDING_WINDOWS)', () => {
    const group = generateRecordingGroupForFingerprint({
      fingerprint: FP_A,
      sli: availSli,
    });
    expect(group).not.toBeNull();
    expect(group!.groupName).toBe(`slo:rec:${FP_A}`);
    expect(group!.rules).toHaveLength(7);
    expect(group!.rules.every((r) => r.type === 'recording')).toBe(true);
  });

  it('rule names follow the fingerprint-keyed scheme (no slug / suffix)', () => {
    const group = generateRecordingGroupForFingerprint({
      fingerprint: FP_A,
      sli: availSli,
    });
    for (const rule of group!.rules) {
      expect(rule.name.startsWith(`slo:sli_error:ratio_rate_`)).toBe(true);
      expect(rule.name.endsWith(`:sli_${FP_A}`)).toBe(true);
    }
  });

  it('recording-rule labels do NOT contain any SLO identity labels', () => {
    const group = generateRecordingGroupForFingerprint({
      fingerprint: FP_A,
      sli: availSli,
    });
    for (const rule of group!.rules) {
      // `slo_window` is the only permitted label on recording rules in
      // dedup mode. Any identity label would defeat the sharing.
      expect(Object.keys(rule.labels).sort()).toEqual(['slo_window']);
      for (const key of Object.keys(rule.labels)) {
        expect(key).not.toMatch(/^slo_id$|^slo_name$|^slo_service$|^slo_objective$|^slo_owner/);
      }
    }
  });

  it('is byte-equal across SLI inputs that yielded the same fingerprint', () => {
    // The dedup invariant: two SLIs that produced the same fingerprint MUST
    // produce identical recording rules. We simulate this by handing the
    // generator the same fingerprint with two differently-named-but-equivalent
    // SLIs (here: identical, so the property holds trivially). The real
    // invariant is enforced upstream by the fingerprint function; this test
    // pins the byte-equality the registry relies on.
    const a = generateRecordingGroupForFingerprint({
      fingerprint: FP_A,
      sli: availSli,
    });
    const b = generateRecordingGroupForFingerprint({
      fingerprint: FP_A,
      sli: availSli,
    });
    expect(a).toEqual(b);
    // Also: every recording rule's PromQL must match across calls.
    for (let i = 0; i < a!.rules.length; i++) {
      expect(a!.rules[i].expr).toBe(b!.rules[i].expr);
    }
  });

  it('diverges on a different fingerprint input (group name changes)', () => {
    const a = generateRecordingGroupForFingerprint({
      fingerprint: FP_A,
      sli: availSli,
    });
    const b = generateRecordingGroupForFingerprint({
      fingerprint: FP_B,
      sli: availSli,
    });
    expect(a!.groupName).not.toBe(b!.groupName);
    expect(a!.rules[0].name).not.toBe(b!.rules[0].name);
  });

  it('returns null for OpenSearch-backed SLIs (nothing to dedup)', () => {
    const osSli: SingleSli = {
      type: 'single',
      definition: {
        backend: 'opensearch',
        type: 'ratio',
        calcMethod: 'events',
        index: 'idx',
        goodQuery: {},
      },
      dimensions: [],
    };
    expect(generateRecordingGroupForFingerprint({ fingerprint: FP_A, sli: osSli })).toBeNull();
  });

  it('respects `objectiveLatencyThreshold` for latency-threshold SLIs', () => {
    const latencySli: SingleSli = {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'latency_threshold',
        calcMethod: 'events',
        metric: 'http_request_duration_seconds',
        latencyThresholdUnit: 'seconds',
      },
      dimensions: [{ name: 'service', value: 'api' }],
    };
    const group = generateRecordingGroupForFingerprint({
      fingerprint: FP_A,
      sli: latencySli,
      objectiveLatencyThreshold: 0.5,
    });
    expect(group!.rules[0].expr).toContain('le="0.5"');
  });
});

describe('generateAlertGroupFor', () => {
  it('names the group slo:alerts:<slug>_<suffix>', () => {
    const d = doc();
    const alertGroup = generateAlertGroupFor(d, { 'availability-99-9': FP_A });
    expect(alertGroup.groupName).toMatch(/^slo:alerts:/);
    // Must not match the recording-group prefix.
    expect(alertGroup.groupName.startsWith('slo:rec:')).toBe(false);
  });

  it('emits burn-rate alerts that reference fingerprint-named recording rules with NO slo_id selector', () => {
    const d = doc();
    const alertGroup = generateAlertGroupFor(d, { 'availability-99-9': FP_A });
    const burnRates = alertGroup.rules.filter((r) => r.labels.slo_alarm_type === 'burn_rate');
    expect(burnRates.length).toBeGreaterThan(0);
    for (const rule of burnRates) {
      // References the fingerprint-named recording rule by prefix.
      expect(rule.expr).toContain(`slo:sli_error:ratio_rate_`);
      expect(rule.expr).toContain(`:sli_${FP_A}`);
      // Legacy `{slo_id=...}` selector MUST NOT appear.
      expect(rule.expr).not.toMatch(/\{slo_id=/);
    }
  });

  it('alert-rule labels DO carry full SLO identity', () => {
    const d = doc();
    const alertGroup = generateAlertGroupFor(d, { 'availability-99-9': FP_A });
    for (const rule of alertGroup.rules) {
      // Sentinel, burn-rate, warning — all need identity.
      expect(rule.labels.slo_id).toBe(d.id);
      expect(rule.labels.slo_name).toBe(d.spec.name);
    }
  });

  it('emits budget-warning alerts when configured', () => {
    const d = doc();
    const alertGroup = generateAlertGroupFor(d, { 'availability-99-9': FP_A });
    const warnings = alertGroup.rules.filter(
      (r) => r.labels.slo_alarm_type === 'error_budget_warning'
    );
    expect(warnings.length).toBe(1);
    expect(warnings[0].expr).not.toMatch(/\{slo_id=/);
  });

  it('shadow mode yields an empty alert group (sentinel is the caller responsibility)', () => {
    const d = doc(validSpec({ mode: 'shadow' }));
    const alertGroup = generateAlertGroupFor(d, { 'availability-99-9': FP_A });
    expect(alertGroup.rules).toHaveLength(0);
  });

  it('createAlarm: false on all tiers + no supplemental alarms → empty alert group', () => {
    const d = doc(
      validSpec({
        alerting: {
          strategy: 'mwmbr',
          burnRates: DEFAULT_MWMBR_TIERS.map((t) => ({ ...t, createAlarm: false })),
        },
        alarms: {
          sliHealth: { enabled: false },
          attainmentBreach: { enabled: false },
          budgetWarning: { enabled: false },
          noData: { enabled: false, forDuration: '10m' },
          resolved: { enabled: false },
        },
      })
    );
    const alertGroup = generateAlertGroupFor(d, { 'availability-99-9': FP_A });
    expect(alertGroup.rules).toHaveLength(0);
  });

  it('skips objectives whose fingerprint is not in the map (OpenSearch / composite)', () => {
    const d = doc(
      validSpec({
        objectives: [
          { name: 'availability-99-9', target: 0.999 },
          { name: 'availability-95', target: 0.95 }, // no fingerprint provided
        ],
      })
    );
    const alertGroup = generateAlertGroupFor(d, { 'availability-99-9': FP_A });
    // Only the objective with a fingerprint contributes alerts.
    for (const rule of alertGroup.rules) {
      expect(rule.labels.slo_objective).toBe('availability-99-9');
    }
  });

  it('composite SLI returns an empty group (no per-objective math applies)', () => {
    const d = doc(
      validSpec({
        sli: { type: 'composite', operator: 'all', members: [] },
      })
    );
    const alertGroup = generateAlertGroupFor(d, {});
    expect(alertGroup.rules).toHaveLength(0);
  });
});

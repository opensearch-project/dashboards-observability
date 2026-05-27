/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ALERT_PROVENANCE_ANNOTATION_KEY,
  PROVENANCE_SCHEMA_VERSION,
  SENTINEL_ALERT_NAME_PREFIX,
  annotateAlertGroup,
  buildAlertProvenance,
  buildSentinelAlert,
} from '../slo_rule_provenance';
import { DEFAULT_MWMBR_TIERS } from '../slo_promql_generator';
import type { GeneratedRule, GeneratedRuleGroup, SloSpec } from '../slo_types';

function validSpec(): SloSpec {
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
  };
}

function ruleStub(name: string, type: 'alerting' | 'recording' = 'alerting'): GeneratedRule {
  return {
    type,
    name,
    expr: 'vector(1)',
    labels: {},
    description: name,
  };
}

function groupStub(name: string, rules: GeneratedRule[]): GeneratedRuleGroup {
  return {
    groupName: name,
    interval: 60,
    rules,
    yaml: '',
  };
}

describe('slo_rule_provenance', () => {
  describe('buildAlertProvenance', () => {
    const spec = validSpec();
    const prov = buildAlertProvenance({
      pluginVersion: '3.7.0',
      sloId: 'slo-abc',
      workspaceId: 'ws-1',
      datasourceId: 'prom-ds-001',
      createdAt: '2026-04-28T10:00:00.000Z',
      updatedAt: '2026-04-28T10:00:00.000Z',
      spec,
    });

    it('stamps PROVENANCE_SCHEMA_VERSION', () => {
      expect(prov.schemaVersion).toBe(PROVENANCE_SCHEMA_VERSION);
    });

    it('fills specSha256 with a 64-char hex digest', () => {
      expect(prov.specSha256).toMatch(/^[0-9a-f]{64}$/);
    });

    // Follow-up #4: the builder records whatever the caller passes as
    // `datasourceId` — the write-side is responsible for picking the
    // canonical name form. Callers in slo_service.ts now pass
    // `deploy.datasource.name` (e.g. `"ObservabilityStack_Prometheus"`),
    // not the internal `ds-N` id. Pin the passthrough so a regression that
    // reintroduces id-form writes shows up at this layer.
    it('records the datasourceId the caller passes verbatim (canonical-name contract)', () => {
      const canonical = buildAlertProvenance({
        pluginVersion: '3.7.0',
        sloId: 'slo-abc',
        workspaceId: 'ObservabilityStack_Prometheus',
        datasourceId: 'ObservabilityStack_Prometheus',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
        spec,
      });
      expect(canonical.datasourceId).toBe('ObservabilityStack_Prometheus');
      expect(canonical.datasourceId).not.toMatch(/^ds-\d+$/);
    });
  });

  describe('annotateAlertGroup', () => {
    const prov = buildAlertProvenance({
      pluginVersion: '3.7.0',
      sloId: 'slo-abc',
      workspaceId: 'ws-1',
      datasourceId: 'prom-ds-001',
      createdAt: '2026-04-28T10:00:00.000Z',
      updatedAt: '2026-04-28T10:00:00.000Z',
      spec: validSpec(),
    });

    it('places the annotation on the first rule only', () => {
      const group = groupStub('slo:alerts:api', [ruleStub('burn-rate-1'), ruleStub('burn-rate-2')]);
      const out = annotateAlertGroup(group, prov);
      expect(out.rules[0].annotations?.[ALERT_PROVENANCE_ANNOTATION_KEY]).toBe(
        JSON.stringify(prov)
      );
      expect(out.rules[1].annotations).toBeUndefined();
    });

    it('is pure — input group unchanged', () => {
      const group = groupStub('slo:alerts:api', [ruleStub('burn-rate-1')]);
      const before = JSON.stringify(group);
      annotateAlertGroup(group, prov);
      expect(JSON.stringify(group)).toBe(before);
    });

    it('preserves pre-existing annotations on the first rule', () => {
      const first = { ...ruleStub('burn-rate-1'), annotations: { summary: 'hi' } };
      const group = groupStub('slo:alerts:api', [first]);
      const out = annotateAlertGroup(group, prov);
      expect(out.rules[0].annotations?.summary).toBe('hi');
      expect(out.rules[0].annotations?.[ALERT_PROVENANCE_ANNOTATION_KEY]).toBe(
        JSON.stringify(prov)
      );
    });

    it('throws on an empty alert group', () => {
      const group = groupStub('slo:alerts:api', []);
      expect(() => annotateAlertGroup(group, prov)).toThrow(/empty alert group/);
    });
  });

  describe('buildSentinelAlert', () => {
    const prov = buildAlertProvenance({
      pluginVersion: '3.7.0',
      sloId: 'slo-abc',
      workspaceId: 'ws-1',
      datasourceId: 'prom-ds-001',
      createdAt: '2026-04-28T10:00:00.000Z',
      updatedAt: '2026-04-28T10:00:00.000Z',
      spec: validSpec(),
    });

    it('names the rule with the sentinel prefix + sloId', () => {
      const rule = buildSentinelAlert('slo-abc', prov);
      expect(rule.name.startsWith(SENTINEL_ALERT_NAME_PREFIX)).toBe(true);
      expect(rule.name.includes('slo-abc')).toBe(true);
    });

    it('uses an always-false expression (never fires)', () => {
      const rule = buildSentinelAlert('slo-abc', prov);
      expect(rule.expr).toBe('vector(0) > 1');
      expect(rule.for).toBe('5m');
    });

    it('attaches the alert provenance annotation on itself', () => {
      const rule = buildSentinelAlert('slo-abc', prov);
      const value = rule.annotations?.[ALERT_PROVENANCE_ANNOTATION_KEY];
      expect(value).toBe(JSON.stringify(prov));
    });

    it('truncates overly long sloId values to keep the rule name bounded', () => {
      const hugeId = 'x'.repeat(400);
      const rule = buildSentinelAlert(hugeId, prov);
      expect(rule.name.length).toBeLessThanOrEqual(200);
    });
  });
});

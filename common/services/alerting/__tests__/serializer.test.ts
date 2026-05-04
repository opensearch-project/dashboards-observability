/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UnifiedRule, UnifiedRuleSummary } from '../../../types/alerting';
import {
  deserializeMonitor,
  MonitorConfig,
  serializeMonitor,
  serializeMonitors,
} from '../serializer';

const baseSummary = (): UnifiedRuleSummary => ({
  id: 'rule-1',
  datasourceId: 'ds-1',
  datasourceType: 'prometheus',
  name: 'HighCpuUsage',
  enabled: true,
  severity: 'critical',
  query: 'rate(node_cpu_seconds_total[5m])',
  condition: '> 80',
  labels: { team: 'infra', severity: 'critical' },
  annotations: { summary: 'CPU above 80%' },
  monitorType: 'metric',
  status: 'active',
  healthStatus: 'healthy',
  createdBy: 'alice',
  createdAt: '2026-04-01T00:00:00Z',
  lastModified: '2026-04-02T00:00:00Z',
  notificationDestinations: ['slack-ops'],
  evaluationInterval: '1m',
  pendingPeriod: '5m',
  threshold: { operator: '>', value: 80, unit: '%' },
});

const fullRule = (): UnifiedRule => ({
  ...baseSummary(),
  description: 'Alerts when CPU usage exceeds 80%',
  aiSummary: 'High CPU on production nodes',
  firingPeriod: '10m',
  alertHistory: [],
  conditionPreviewData: [],
  notificationRouting: [
    { channel: 'Slack', destination: '#ops-alerts', severity: ['critical'], throttle: '10m' },
  ],
  suppressionRules: [],
  // Minimal raw payload — serializer never reads it.
  raw: {} as UnifiedRule['raw'],
});

describe('serializer', () => {
  describe('serializeMonitor', () => {
    it('maps a summary rule to a MonitorConfig with defaults', () => {
      const config = serializeMonitor(baseSummary());
      expect(config.version).toBe('1.0');
      expect(config.name).toBe('HighCpuUsage');
      expect(config.threshold).toEqual({ operator: '>', value: 80, unit: '%', forDuration: '5m' });
      expect(config.evaluation).toEqual({
        interval: '1m',
        pendingPeriod: '5m',
        firingPeriod: undefined,
      });
      expect(config.labels).toEqual({ team: 'infra', severity: 'critical' });
      expect(config.routing).toBeUndefined();
    });

    it('includes firingPeriod and routing when a full UnifiedRule is provided', () => {
      const config = serializeMonitor(fullRule());
      expect(config.evaluation.firingPeriod).toBe('10m');
      expect(config.routing).toEqual([
        { channel: 'Slack', destination: '#ops-alerts', severity: ['critical'], throttle: '10m' },
      ]);
    });

    it('applies defaults when threshold/evaluation fields are missing', () => {
      const summary = baseSummary();
      summary.threshold = undefined;
      summary.evaluationInterval = '';
      summary.pendingPeriod = '';
      const config = serializeMonitor(summary);
      expect(config.threshold).toEqual({
        operator: '>',
        value: 0,
        unit: undefined,
        forDuration: '5m',
      });
      expect(config.evaluation.interval).toBe('1m');
      expect(config.evaluation.pendingPeriod).toBe('5m');
    });
  });

  describe('serializeMonitors', () => {
    it('serializes each rule in order', () => {
      const a = baseSummary();
      const b = { ...baseSummary(), id: 'rule-2', name: 'LowDisk' };
      const result = serializeMonitors([a, b]);
      expect(result).toHaveLength(2);
      expect(result.map((c) => c.name)).toEqual(['HighCpuUsage', 'LowDisk']);
    });
  });

  describe('deserializeMonitor', () => {
    const validInput = (): Record<string, unknown> => ({
      version: '1.0',
      name: 'HighCpuUsage',
      query: 'rate(node_cpu_seconds_total[5m])',
      threshold: { operator: '>', value: 80, unit: '%', forDuration: '5m' },
      evaluation: { interval: '1m', pendingPeriod: '5m', firingPeriod: '10m' },
      labels: { team: 'infra' },
      annotations: { summary: 'CPU high' },
      severity: 'critical',
      routing: [{ channel: 'Slack', destination: '#ops' }],
    });

    it('parses a valid payload and returns zero errors', () => {
      const { config, errors } = deserializeMonitor(validInput());
      expect(errors).toEqual([]);
      expect(config).not.toBeNull();
      expect(config?.name).toBe('HighCpuUsage');
      expect(config?.threshold.forDuration).toBe('5m');
      expect(config?.evaluation.firingPeriod).toBe('10m');
      expect(config?.severity).toBe('critical');
    });

    it('rejects non-object input', () => {
      expect(deserializeMonitor(null)).toEqual({
        config: null,
        errors: ['Input must be a JSON object'],
      });
      expect(deserializeMonitor('not an object')).toEqual({
        config: null,
        errors: ['Input must be a JSON object'],
      });
    });

    it('aggregates errors for missing required fields', () => {
      const { config, errors } = deserializeMonitor({});
      expect(config).toBeNull();
      expect(errors).toEqual(
        expect.arrayContaining([
          'name: required string field',
          'query: required string field',
          'threshold: required object with operator, value, forDuration',
          'evaluation: required object with interval, pendingPeriod',
        ])
      );
    });

    it('reports invalid threshold operator/value and missing forDuration', () => {
      const input = validInput();
      input.threshold = { operator: 42, value: 'nope', forDuration: '' };
      const { config, errors } = deserializeMonitor(input);
      expect(config).toBeNull();
      expect(errors).toEqual(
        expect.arrayContaining([
          'threshold.operator: required string',
          'threshold.value: required finite number',
          'threshold.forDuration: required duration string',
        ])
      );
    });

    it('flags invalid duration strings via parseDuration', () => {
      const input = validInput();
      input.evaluation = { interval: 'banana', pendingPeriod: '5m' };
      const { config, errors } = deserializeMonitor(input);
      expect(config).toBeNull();
      expect(errors.some((e) => e.startsWith('evaluation.interval:'))).toBe(true);
    });

    it('defaults severity to "medium" and truncates >100 labels', () => {
      const input = validInput();
      delete (input as { severity?: unknown }).severity;
      const bigLabels: Record<string, string> = {};
      for (let i = 0; i < 150; i++) bigLabels[`k${i}`] = `v${i}`;
      input.labels = bigLabels;
      const { config, errors } = deserializeMonitor(input);
      expect(errors).toEqual([]);
      expect(config?.severity).toBe('medium');
      expect(Object.keys(config?.labels ?? {})).toHaveLength(100);
    });

    it('drops non-string label values and truncates overly long ones', () => {
      const input = validInput();
      input.labels = { good: 'ok', bad: 42, huge: 'x'.repeat(15_000) };
      const { config } = deserializeMonitor(input);
      expect(config?.labels.good).toBe('ok');
      expect(config?.labels.bad).toBeUndefined();
      expect(config?.labels.huge?.length).toBe(10_000);
    });

    it('rejects payloads larger than 1MB', () => {
      const input = validInput();
      input.annotations = { blob: 'x'.repeat(1_100_000) };
      const { config, errors } = deserializeMonitor(input);
      expect(config).toBeNull();
      expect(errors).toEqual(['Input too large (max 1MB)']);
    });

    it('caps routing array length at 20 entries and drops non-array routing', () => {
      const input = validInput();
      input.routing = new Array(30).fill({ channel: 'Slack', destination: '#ops' });
      expect(deserializeMonitor(input).config?.routing).toHaveLength(20);

      const input2 = validInput();
      input2.routing = 'not an array';
      expect(deserializeMonitor(input2).config?.routing).toBeUndefined();
    });
  });

  describe('round trip', () => {
    it('serialize → deserialize preserves structural fields of a full rule', () => {
      const serialized = serializeMonitor(fullRule());
      const { config, errors } = deserializeMonitor(
        (serialized as unknown) as Record<string, unknown>
      );
      expect(errors).toEqual([]);
      const expected: MonitorConfig = {
        ...serialized,
        // serialize emits `unit: undefined` explicitly; deserialize passes it through unchanged
      };
      expect(config).toEqual(expected);
    });
  });
});

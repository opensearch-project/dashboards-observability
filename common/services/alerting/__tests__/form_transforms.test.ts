/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  buildConditionScript,
  LogsMonitorForm,
  mapScheduleUnit,
  mapSeverityLevel,
  MetricsMonitorForm,
  parseQueryPayload,
  transformLogsFormToPayload,
  transformMetricsFormToPayload,
} from '../form_transforms';

// Narrow shapes describing the payloads transformLogsFormToPayload and
// transformMetricsFormToPayload produce. The functions declare a loose
// Record<string, unknown> return, so we narrow via `as unknown as` here
// purely for assertion ergonomics.
interface LogsPayloadAction {
  name: string;
  destination_id: string;
  message_template: { source: string };
  subject_template: { source: string };
  throttle_enabled: boolean;
  throttle?: { value: number; unit: string };
}
interface LogsPayloadTrigger {
  name: string;
  severity: string;
  condition: { script: { source: string; lang: string } };
  actions: LogsPayloadAction[];
}
interface LogsPayload {
  type: string;
  name: string;
  enabled: boolean;
  schedule: { period: { interval: number; unit: string } };
  inputs: Array<{ search: { indices: string[]; query: { size: number; query: unknown } } }>;
  triggers: LogsPayloadTrigger[];
}
interface MetricsPayload {
  name: string;
  rules: Array<{
    alert: string;
    expr: string;
    for: string;
    labels: Record<string, string>;
    annotations: Record<string, string>;
  }>;
}

describe('form_transforms', () => {
  describe('mapScheduleUnit', () => {
    it('maps singular and plural casings to the OS schedule enum', () => {
      expect(mapScheduleUnit('minute')).toBe('MINUTES');
      expect(mapScheduleUnit('Minute(s)')).toBe('MINUTES');
      expect(mapScheduleUnit('HOUR')).toBe('HOURS');
      expect(mapScheduleUnit('day(s)')).toBe('DAYS');
    });

    it('falls back to MINUTES for unknown units', () => {
      expect(mapScheduleUnit('fortnight')).toBe('MINUTES');
      expect(mapScheduleUnit('')).toBe('MINUTES');
    });
  });

  describe('mapSeverityLevel', () => {
    it('maps every known severity keyword', () => {
      expect(mapSeverityLevel('critical')).toBe('1');
      expect(mapSeverityLevel('high')).toBe('2');
      expect(mapSeverityLevel('medium')).toBe('3');
      expect(mapSeverityLevel('low')).toBe('4');
      expect(mapSeverityLevel('info')).toBe('5');
    });

    it('defaults unknown severities to medium ("3")', () => {
      expect(mapSeverityLevel('catastrophic')).toBe('3');
      expect(mapSeverityLevel('')).toBe('3');
    });
  });

  describe('buildConditionScript', () => {
    it('builds a painless comparison for each operator', () => {
      expect(
        buildConditionScript({ conditionOperator: 'is_greater_than', conditionValue: 100 })
      ).toBe('ctx.results[0].hits.total.value > 100');
      expect(buildConditionScript({ conditionOperator: 'is_less_equal', conditionValue: 5 })).toBe(
        'ctx.results[0].hits.total.value <= 5'
      );
      expect(buildConditionScript({ conditionOperator: 'is_not_equal', conditionValue: 0 })).toBe(
        'ctx.results[0].hits.total.value != 0'
      );
    });

    it('defaults to ">" when operator is unknown', () => {
      expect(buildConditionScript({ conditionOperator: 'wat', conditionValue: 42 })).toBe(
        'ctx.results[0].hits.total.value > 42'
      );
    });
  });

  describe('parseQueryPayload', () => {
    it('parses a JSON DSL object verbatim', () => {
      expect(parseQueryPayload('{"match_all":{}}')).toEqual({ match_all: {} });
    });

    it('wraps non-JSON input in a query_string clause', () => {
      expect(parseQueryPayload('status:500')).toEqual({
        query_string: { query: 'status:500' },
      });
      expect(parseQueryPayload('')).toEqual({ query_string: { query: '' } });
    });
  });

  describe('transformLogsFormToPayload', () => {
    const baseForm = (): LogsMonitorForm => ({
      monitorName: 'High Error Rate',
      runEveryValue: 5,
      runEveryUnit: 'minute(s)',
      selectedDatasource: 'logs-*',
      query: '{"match_all":{}}',
      triggers: [
        {
          name: 'Errors > 100',
          severityLevel: 'critical',
          conditionOperator: 'is_greater_than',
          conditionValue: 100,
          suppressEnabled: true,
          suppressExpiry: 10,
          suppressExpiryUnit: 'minute(s)',
          actions: [
            {
              name: 'Notify Slack',
              notificationChannel: 'dest-slack-1',
              message: 'High error rate',
              subject: 'Alert',
            },
          ],
        },
      ],
    });

    it('produces the full OS monitor payload for a complete logs form', () => {
      expect(transformLogsFormToPayload(baseForm())).toEqual({
        type: 'monitor',
        name: 'High Error Rate',
        enabled: true,
        schedule: { period: { interval: 5, unit: 'MINUTES' } },
        inputs: [
          {
            search: {
              indices: ['logs-*'],
              query: { size: 0, query: { match_all: {} } },
            },
          },
        ],
        triggers: [
          {
            name: 'Errors > 100',
            severity: '1',
            condition: {
              script: {
                source: 'ctx.results[0].hits.total.value > 100',
                lang: 'painless',
              },
            },
            actions: [
              {
                name: 'Notify Slack',
                destination_id: 'dest-slack-1',
                message_template: { source: 'High error rate' },
                subject_template: { source: 'Alert' },
                throttle_enabled: true,
                throttle: { value: 10, unit: 'MINUTES' },
              },
            ],
          },
        ],
      });
    });

    it('omits throttle and empties missing action fields when suppression is off', () => {
      const form = baseForm();
      form.triggers[0].suppressEnabled = false;
      form.triggers[0].actions[0].message = undefined;
      form.triggers[0].actions[0].subject = undefined;

      const payload = (transformLogsFormToPayload(form) as unknown) as LogsPayload;
      const action = payload.triggers[0].actions[0];

      expect(action.throttle_enabled).toBe(false);
      expect(action.throttle).toBeUndefined();
      expect(action.message_template).toEqual({ source: '' });
      expect(action.subject_template).toEqual({ source: '' });
    });

    it('handles an empty triggers array', () => {
      const form = baseForm();
      form.triggers = [];
      const payload = (transformLogsFormToPayload(form) as unknown) as LogsPayload;
      expect(payload.triggers).toEqual([]);
      expect(payload.enabled).toBe(true);
    });

    it('wraps a freeform query string via parseQueryPayload', () => {
      const form = baseForm();
      form.query = 'status:500';
      const payload = (transformLogsFormToPayload(form) as unknown) as LogsPayload;
      expect(payload.inputs[0].search.query.query).toEqual({
        query_string: { query: 'status:500' },
      });
    });
  });

  describe('transformMetricsFormToPayload', () => {
    const baseForm = (): MetricsMonitorForm => ({
      monitorName: 'HighCpuUsage',
      query: 'rate(node_cpu_seconds_total[5m])',
      operator: '>',
      thresholdValue: 80,
      forDuration: '5m',
      labels: [
        { key: 'severity', value: 'warning' },
        { key: 'team', value: 'infra' },
      ],
      annotations: [{ key: 'summary', value: 'CPU above threshold' }],
    });

    it('produces a rule-group payload with labels and annotations', () => {
      expect(transformMetricsFormToPayload(baseForm())).toEqual({
        name: 'HighCpuUsage',
        rules: [
          {
            alert: 'HighCpuUsage',
            expr: 'rate(node_cpu_seconds_total[5m]) > 80',
            for: '5m',
            labels: { severity: 'warning', team: 'infra' },
            annotations: { summary: 'CPU above threshold' },
          },
        ],
      });
    });

    it('filters out label/annotation rows with empty key or value', () => {
      const form = baseForm();
      form.labels = [
        { key: 'severity', value: 'warning' },
        { key: '', value: 'orphan' },
        { key: 'team', value: '' },
      ];
      form.annotations = [
        { key: 'summary', value: 'ok' },
        { key: 'runbook', value: '' },
      ];
      const payload = (transformMetricsFormToPayload(form) as unknown) as MetricsPayload;
      expect(payload.rules[0].labels).toEqual({ severity: 'warning' });
      expect(payload.rules[0].annotations).toEqual({ summary: 'ok' });
    });

    it('yields empty label/annotation objects when form has none', () => {
      const form = baseForm();
      form.labels = [];
      form.annotations = [];
      const payload = (transformMetricsFormToPayload(form) as unknown) as MetricsPayload;
      expect(payload.rules[0].labels).toEqual({});
      expect(payload.rules[0].annotations).toEqual({});
    });
  });
});

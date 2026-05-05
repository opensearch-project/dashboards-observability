/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Form → API payload transforms for alerting monitor creation.
 *
 * Pure functions with no React, coreRefs, or Node dependencies —
 * safe to import from both client and server, and to unit-test in
 * isolation.
 */

export interface LogsMonitorAction {
  name: string;
  notificationChannel: string;
  message?: string;
  subject?: string;
}

export interface LogsMonitorTrigger {
  name: string;
  severityLevel: string;
  conditionOperator: string;
  conditionValue: number;
  suppressEnabled: boolean;
  suppressExpiry: number;
  suppressExpiryUnit: string;
  actions: LogsMonitorAction[];
}

export interface LogsMonitorForm {
  monitorName: string;
  runEveryValue: number;
  runEveryUnit: string;
  selectedDatasource: string;
  query: string;
  triggers: LogsMonitorTrigger[];
}

export interface MetricsMonitorLabel {
  key: string;
  value: string;
}

export interface MetricsMonitorForm {
  monitorName: string;
  query: string;
  operator: string;
  thresholdValue: number;
  forDuration: string;
  labels: MetricsMonitorLabel[];
  annotations: MetricsMonitorLabel[];
}

const UNIT_MAP: Record<string, string> = {
  minute: 'MINUTES',
  hour: 'HOURS',
  day: 'DAYS',
};

const SEVERITY_MAP: Record<string, '1' | '2' | '3' | '4' | '5'> = {
  critical: '1',
  high: '2',
  medium: '3',
  low: '4',
  info: '5',
};

const CONDITION_OPERATOR_MAP: Record<string, string> = {
  is_greater_than: '>',
  is_less_than: '<',
  is_equal_to: '==',
  is_greater_equal: '>=',
  is_less_equal: '<=',
  is_not_equal: '!=',
};

export function mapScheduleUnit(unit: string): string {
  const lower = unit.toLowerCase().replace(/\(s\)$/, '');
  return UNIT_MAP[lower] ?? 'MINUTES';
}

export function mapSeverityLevel(severity: string): '1' | '2' | '3' | '4' | '5' {
  return SEVERITY_MAP[severity] ?? '3';
}

export function buildConditionScript(trigger: {
  conditionOperator: string;
  conditionValue: number;
}): string {
  const op = CONDITION_OPERATOR_MAP[trigger.conditionOperator] ?? '>';
  return `ctx.results[0].hits.total.value ${op} ${trigger.conditionValue}`;
}

/**
 * Parse a query string as JSON, falling back to a query_string wrapper
 * so callers can pass either a raw DSL object or a freeform query.
 */
export function parseQueryPayload(query: string): Record<string, unknown> {
  try {
    return JSON.parse(query);
  } catch {
    return { query_string: { query } };
  }
}

/** Build an OpenSearch Alerting monitor create payload from a logs form. */
export function transformLogsFormToPayload(form: LogsMonitorForm): Record<string, unknown> {
  return {
    type: 'monitor',
    name: form.monitorName,
    enabled: true,
    schedule: {
      period: { interval: form.runEveryValue, unit: mapScheduleUnit(form.runEveryUnit) },
    },
    inputs: [
      {
        search: {
          indices: [form.selectedDatasource],
          query: { size: 0, query: parseQueryPayload(form.query) },
        },
      },
    ],
    triggers: form.triggers.map((t) => ({
      name: t.name,
      severity: mapSeverityLevel(t.severityLevel),
      condition: {
        script: { source: buildConditionScript(t), lang: 'painless' },
      },
      actions: t.actions.map((a) => ({
        name: a.name,
        destination_id: a.notificationChannel,
        message_template: { source: a.message || '' },
        subject_template: { source: a.subject || '' },
        throttle_enabled: t.suppressEnabled,
        throttle: t.suppressEnabled
          ? { value: t.suppressExpiry, unit: mapScheduleUnit(t.suppressExpiryUnit) }
          : undefined,
      })),
    })),
  };
}

/** Build a Prometheus rule-group create payload from a metrics form. */
export function transformMetricsFormToPayload(form: MetricsMonitorForm): Record<string, unknown> {
  return {
    name: form.monitorName,
    rules: [
      {
        alert: form.monitorName,
        expr: `${form.query} ${form.operator} ${form.thresholdValue}`,
        for: form.forDuration,
        labels: Object.fromEntries(
          form.labels.filter((l) => l.key && l.value).map((l) => [l.key, l.value])
        ),
        annotations: Object.fromEntries(
          form.annotations.filter((a) => a.key && a.value).map((a) => [a.key, a.value])
        ),
      },
    ],
  };
}

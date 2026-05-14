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

// ============================================================================
// PPL monitor transforms
// ============================================================================

// Mirror of the PPL form-state types in
// `public/components/alerting/create_monitor/create_monitor_types.ts`.
// Duplicated because `common/` cannot import from `public/`.
export interface PplActionForm {
  id?: string;
  name: string;
  destinationId: string;
  subject: string;
  message: string;
}

export interface PplTriggerForm {
  id?: string;
  name: string;
  severity: '1' | '2' | '3' | '4' | '5';
  type: 'number_of_results' | 'custom';
  numResultsCondition: '>' | '>=' | '<' | '<=' | '==' | '!=';
  numResultsValue: number;
  customCondition: string;
  actions: PplActionForm[];
}

export interface PplMonitorForm {
  name: string;
  enabled: boolean;
  query: string;
  schedule: { interval: number; unit: 'MINUTES' | 'HOURS' | 'DAYS' };
  pplTriggers: PplTriggerForm[];
}

const VALID_NUM_RESULTS_OPERATORS = new Set(['>', '>=', '<', '<=', '==', '!=']);

function buildPplActionPayload(action: PplActionForm): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: action.name,
    destination_id: action.destinationId,
    message_template: { source: action.message || '' },
  };
  if (action.subject && action.subject.trim() !== '') {
    out.subject_template = { source: action.subject };
  }
  return out;
}

// Build a PPL trigger body matching `PPLTrigger.toXContent` from the
// alerting plugin's common-utils library. `type` selects between
// `number_of_results` (uses `num_results_*`) and `custom` (uses
// `custom_condition`, must start with `where ...`); the unused branch is
// omitted because the backend rejects bodies that mix both.
function buildPplTriggerPayload(trigger: PplTriggerForm): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: trigger.name,
    severity: trigger.severity,
    actions: trigger.actions.map(buildPplActionPayload),
    type: trigger.type,
  };
  if (trigger.id) body.id = trigger.id;
  if (trigger.type === 'number_of_results') {
    const op = VALID_NUM_RESULTS_OPERATORS.has(trigger.numResultsCondition)
      ? trigger.numResultsCondition
      : '>';
    body.num_results_condition = op;
    body.num_results_value = Number.isFinite(trigger.numResultsValue)
      ? Math.floor(trigger.numResultsValue)
      : 1;
  } else {
    body.custom_condition = trigger.customCondition;
  }
  return { ppl_trigger: body };
}

/** Build a `POST /_plugins/_alerting/monitors` payload for a PPL monitor. */
export function transformPplFormToPayload(form: PplMonitorForm): Record<string, unknown> {
  return {
    type: 'monitor',
    monitor_type: 'ppl_monitor',
    name: form.name,
    enabled: form.enabled,
    schedule: {
      period: { interval: form.schedule.interval, unit: form.schedule.unit },
    },
    inputs: [
      {
        ppl_input: {
          query: form.query,
          query_language: 'ppl',
        },
      },
    ],
    triggers: form.pplTriggers.map(buildPplTriggerPayload),
  };
}

/** Inverse of {@link transformPplFormToPayload} — used to seed the edit flyout. */
export interface OsPplFormSeed {
  name: string;
  enabled: boolean;
  query: string;
  schedule: { interval: number; unit: 'MINUTES' | 'HOURS' | 'DAYS' };
  pplTriggers: PplTriggerForm[];
}

interface UnifiedRuleRawPplLike {
  monitor_type?: string;
  inputs?: Array<{ ppl_input?: { query?: string } }>;
  triggers?: Array<{
    ppl_trigger?: {
      id?: string;
      name?: string;
      severity?: string;
      actions?: Array<{
        id?: string;
        name?: string;
        destination_id?: string;
        message_template?: { source?: string };
        subject_template?: { source?: string };
      }>;
      type?: string;
      num_results_condition?: string;
      num_results_value?: number;
      custom_condition?: string;
    };
  }>;
  schedule?: {
    period?: { interval?: number; unit?: 'MINUTES' | 'HOURS' | 'DAYS' };
  };
}

export function unifiedRuleToOsForm(rule: {
  name: string;
  enabled: boolean;
  raw: unknown;
}): OsPplFormSeed {
  const raw = (rule.raw as UnifiedRuleRawPplLike) || {};
  const pplInput = raw.inputs?.[0]?.ppl_input;
  const period = raw.schedule?.period;
  const triggers: PplTriggerForm[] = (raw.triggers || [])
    .map((t) => t.ppl_trigger)
    .filter((b): b is NonNullable<typeof b> => !!b)
    .map((b) => {
      const conditionType: PplTriggerForm['type'] =
        b.type === 'custom' ? 'custom' : 'number_of_results';
      const op = VALID_NUM_RESULTS_OPERATORS.has(b.num_results_condition || '')
        ? (b.num_results_condition as PplTriggerForm['numResultsCondition'])
        : '>';
      return {
        id: b.id,
        name: b.name || '',
        severity: ((['1', '2', '3', '4', '5'] as const).includes(
          (b.severity || '3') as PplTriggerForm['severity']
        )
          ? b.severity
          : '3') as PplTriggerForm['severity'],
        type: conditionType,
        numResultsCondition: op,
        numResultsValue: Number.isFinite(b.num_results_value) ? Number(b.num_results_value) : 1,
        customCondition: b.custom_condition || 'where ',
        actions: (b.actions || []).map((a) => ({
          id: a.id,
          name: a.name || '',
          destinationId: a.destination_id || '',
          subject: a.subject_template?.source || '',
          message: a.message_template?.source || '',
        })),
      };
    });

  return {
    name: rule.name,
    enabled: rule.enabled,
    query: pplInput?.query || '',
    schedule: {
      interval: period?.interval ?? 1,
      unit: period?.unit ?? 'MINUTES',
    },
    pplTriggers: triggers.length > 0 ? triggers : [],
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

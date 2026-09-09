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

/**
 * Marker prefix every locally-generated trigger id starts with. We need a
 * marker (rather than the older `length < 20` heuristic) because:
 *   - The alerting plugin assigns trigger ids that are typically 20–22
 *     characters (NanoID/UUID-shaped). The old heuristic dropped them on
 *     edit, breaking alert-history continuity by re-creating the trigger.
 *   - A future backend id starting with the local prefix would silently be
 *     re-created. Using a marker the backend cannot emit fixes both ends.
 *
 * Keep this in sync with the id generators in
 * `public/components/alerting/create_monitor/create_monitor_types.ts` and
 * `public/components/alerting/create_monitor/sections/ppl_triggers.tsx`.
 */
export const CLIENT_TRIGGER_ID_PREFIX = 'ppl-trigger-';

export function isClientGeneratedTriggerId(id: string | undefined): boolean {
  return !!id && id.startsWith(CLIENT_TRIGGER_ID_PREFIX);
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
  // Only forward ids the backend assigned (recognized by the absence of our
  // marker prefix). Client-generated ids would either fail the alerting
  // plugin's id-length validation or — worse — silently collide with an
  // unrelated backend trigger.
  if (trigger.id && !isClientGeneratedTriggerId(trigger.id)) {
    body.id = trigger.id;
  }
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

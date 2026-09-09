/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PplMonitorForm,
  PplTriggerForm,
  transformPplFormToPayload,
  unifiedRuleToOsForm,
} from '../form_transforms';

// ============================================================================
// PPL monitor transform tests
// ============================================================================

interface PplActionWire {
  name: string;
  destination_id: string;
  message_template: { source: string };
  subject_template?: { source: string };
}
interface PplTriggerBodyWire {
  id?: string;
  name: string;
  severity: string;
  actions: PplActionWire[];
  type: 'number_of_results' | 'custom';
  num_results_condition?: string;
  num_results_value?: number;
  custom_condition?: string;
}
interface PplPayload {
  type: string;
  monitor_type: string;
  name: string;
  enabled: boolean;
  schedule: { period: { interval: number; unit: string } };
  inputs: Array<{ ppl_input: { query: string; query_language: string } }>;
  triggers: Array<{ ppl_trigger: PplTriggerBodyWire }>;
}

const numResultsTrigger: PplTriggerForm = {
  id: 't-1',
  name: 'too-many-errors',
  severity: '2',
  type: 'number_of_results',
  numResultsCondition: '>',
  numResultsValue: 5,
  customCondition: 'where ',
  actions: [],
};

const customTrigger: PplTriggerForm = {
  id: 't-2',
  name: 'avg-too-high',
  severity: '1',
  type: 'custom',
  numResultsCondition: '>',
  numResultsValue: 1,
  customCondition: 'where avg_latency > 300',
  actions: [
    {
      id: 'a-1',
      name: 'page_oncall',
      destinationId: 'dest-pagerduty',
      subject: 'High latency',
      message: 'avg latency exceeded threshold',
    },
  ],
};

const baseForm = (): PplMonitorForm => ({
  name: 'ppl-monitor',
  enabled: true,
  query: 'source = logs-* | stats avg(latency) as avg_latency',
  schedule: { interval: 5, unit: 'MINUTES' },
  pplTriggers: [numResultsTrigger],
});

describe('transformPplFormToPayload', () => {
  it('emits the canonical PPL monitor envelope', () => {
    const payload = transformPplFormToPayload(baseForm()) as unknown as PplPayload;
    expect(payload.type).toBe('monitor');
    expect(payload.monitor_type).toBe('ppl_monitor');
    expect(payload.name).toBe('ppl-monitor');
    expect(payload.enabled).toBe(true);
    expect(payload.schedule.period).toEqual({ interval: 5, unit: 'MINUTES' });
    expect(payload.inputs).toEqual([
      {
        ppl_input: {
          query: 'source = logs-* | stats avg(latency) as avg_latency',
          query_language: 'ppl',
        },
      },
    ]);
  });

  it('encodes a number-of-results trigger with operator + integer threshold', () => {
    const payload = transformPplFormToPayload(baseForm()) as unknown as PplPayload;
    const body = payload.triggers[0].ppl_trigger;
    expect(body.id).toBe('t-1');
    expect(body.type).toBe('number_of_results');
    expect(body.num_results_condition).toBe('>');
    expect(body.num_results_value).toBe(5);
    expect(body.custom_condition).toBeUndefined();
  });

  it('encodes a custom-condition trigger and omits num-results fields', () => {
    const form = baseForm();
    form.pplTriggers = [customTrigger];
    const payload = transformPplFormToPayload(form) as unknown as PplPayload;
    const body = payload.triggers[0].ppl_trigger;
    expect(body.type).toBe('custom');
    expect(body.custom_condition).toBe('where avg_latency > 300');
    expect(body.num_results_condition).toBeUndefined();
    expect(body.num_results_value).toBeUndefined();
  });

  it('serializes multiple triggers in form order', () => {
    const form = baseForm();
    form.pplTriggers = [numResultsTrigger, customTrigger];
    const payload = transformPplFormToPayload(form) as unknown as PplPayload;
    expect(payload.triggers).toHaveLength(2);
    expect(payload.triggers[0].ppl_trigger.id).toBe('t-1');
    expect(payload.triggers[1].ppl_trigger.id).toBe('t-2');
  });

  it('drops client-generated trigger ids (ppl-trigger-* prefix) so the backend assigns a fresh id', () => {
    const form = baseForm();
    form.pplTriggers = [
      // Looks exactly like createDefaultPplTrigger() output.
      { ...numResultsTrigger, id: `ppl-trigger-${Date.now()}` },
    ];
    const payload = transformPplFormToPayload(form) as unknown as PplPayload;
    expect(payload.triggers[0].ppl_trigger.id).toBeUndefined();
  });

  it('keeps backend-issued trigger ids (short, no client prefix) for round-trip on edit', () => {
    const form = baseForm();
    form.pplTriggers = [{ ...numResultsTrigger, id: 'aBc123XyZ' }];
    const payload = transformPplFormToPayload(form) as unknown as PplPayload;
    expect(payload.triggers[0].ppl_trigger.id).toBe('aBc123XyZ');
  });

  it('keeps backend-issued NanoID/UUID-shaped trigger ids (>= 20 characters) — regression for F9', () => {
    // Backend Alerting trigger IDs are typically 20–22 character NanoIDs. The
    // earlier `length < 20` heuristic stripped them, breaking alert-history
    // continuity by re-creating the trigger.
    const form = baseForm();
    form.pplTriggers = [{ ...numResultsTrigger, id: 'aB1cD2eF3gH4iJ5kL6mN' }]; // 20 chars
    const payload = transformPplFormToPayload(form) as unknown as PplPayload;
    expect(payload.triggers[0].ppl_trigger.id).toBe('aB1cD2eF3gH4iJ5kL6mN');

    // 22-char shape too
    form.pplTriggers = [{ ...numResultsTrigger, id: 'aB1cD2eF3gH4iJ5kL6mNoP' }]; // 22
    const p2 = transformPplFormToPayload(form) as unknown as PplPayload;
    expect(p2.triggers[0].ppl_trigger.id).toBe('aB1cD2eF3gH4iJ5kL6mNoP');
  });

  it('encodes actions with subject template only when subject is non-empty', () => {
    const form = baseForm();
    form.pplTriggers = [
      { ...numResultsTrigger, actions: [{ ...customTrigger.actions[0], subject: '' }] },
    ];
    const payload = transformPplFormToPayload(form) as unknown as PplPayload;
    const action = payload.triggers[0].ppl_trigger.actions[0];
    expect(action.message_template).toEqual({ source: 'avg latency exceeded threshold' });
    expect(action.subject_template).toBeUndefined();
  });

  it('emits empty actions array when the trigger has none', () => {
    const payload = transformPplFormToPayload(baseForm()) as unknown as PplPayload;
    expect(payload.triggers[0].ppl_trigger.actions).toEqual([]);
  });

  it('falls back to a safe operator when the form value is malformed', () => {
    const form = baseForm();
    form.pplTriggers = [
      {
        ...numResultsTrigger,
        numResultsCondition: '=>' as unknown as PplTriggerForm['numResultsCondition'],
      },
    ];
    const payload = transformPplFormToPayload(form) as unknown as PplPayload;
    expect(payload.triggers[0].ppl_trigger.num_results_condition).toBe('>');
  });
});

describe('unifiedRuleToOsForm', () => {
  it('round-trips a PPL monitor — query, schedule, and triggers preserved', () => {
    const wire = transformPplFormToPayload({
      name: 'rt',
      enabled: true,
      query: 'source = logs-*',
      schedule: { interval: 10, unit: 'MINUTES' },
      pplTriggers: [numResultsTrigger, customTrigger],
    });

    const seed = unifiedRuleToOsForm({ name: 'rt', enabled: true, raw: wire });
    expect(seed.name).toBe('rt');
    expect(seed.enabled).toBe(true);
    expect(seed.query).toBe('source = logs-*');
    expect(seed.schedule).toEqual({ interval: 10, unit: 'MINUTES' });
    expect(seed.pplTriggers).toHaveLength(2);
    expect(seed.pplTriggers[0]).toMatchObject({
      name: 'too-many-errors',
      type: 'number_of_results',
      numResultsCondition: '>',
      numResultsValue: 5,
    });
    expect(seed.pplTriggers[1]).toMatchObject({
      name: 'avg-too-high',
      type: 'custom',
      customCondition: 'where avg_latency > 300',
    });
  });

  it('falls back to defaults when raw is missing fields', () => {
    const seed = unifiedRuleToOsForm({ name: 'x', enabled: false, raw: {} });
    expect(seed.query).toBe('');
    expect(seed.schedule).toEqual({ interval: 1, unit: 'MINUTES' });
    expect(seed.pplTriggers).toEqual([]);
  });
});

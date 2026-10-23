/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Look-back window + notification throttling: payload emission, edit-round-trip,
 * and validation. Complements form_transforms.test.ts / validators.test.ts.
 */
import { PplMonitorForm, transformPplFormToPayload, unifiedRuleToOsForm } from '../form_transforms';
import { validatePplForm } from '../validators';

const baseTrigger = {
  name: 'trigger-1',
  severity: '3' as const,
  type: 'number_of_results' as const,
  numResultsCondition: '>=' as const,
  numResultsValue: 1,
  customCondition: '',
  actions: [],
};

const baseForm = (overrides: Partial<PplMonitorForm> = {}): PplMonitorForm => ({
  name: 'rule',
  enabled: true,
  query: 'source = logs-* | stats count() as c',
  schedule: { interval: 1, unit: 'MINUTES' },
  pplTriggers: [baseTrigger],
  ...overrides,
});

describe('transformPplFormToPayload — look-back window', () => {
  // ppl_monitor persists no metadata slot, so the window lives ONLY as the
  // injected query filter — assert on the query, and that no metadata is added.
  it('injects the sliding filter into the query when enabled', () => {
    const payload = transformPplFormToPayload(
      baseForm({
        useLookBackWindow: true,
        lookBackAmount: 2,
        lookBackUnit: 'hours',
        lookbackTimestampField: '@timestamp',
      })
    );
    const query = (payload.inputs as any)[0].ppl_input.query as string;
    expect(query).toBe(
      'source = logs-* | where @timestamp > DATE_SUB(NOW(), INTERVAL 2 HOUR) | stats count() as c'
    );
    expect(payload.ui_metadata).toBeUndefined();
  });

  it('leaves the query untouched when there is no timestamp field', () => {
    const payload = transformPplFormToPayload(
      baseForm({ useLookBackWindow: true, lookBackAmount: 2, lookBackUnit: 'hours' })
    );
    expect((payload.inputs as any)[0].ppl_input.query).toBe('source = logs-* | stats count() as c');
  });

  it('keeps a user-written time filter verbatim when look-back is off', () => {
    const q = 'source = logs-* | where @timestamp > DATE_SUB(NOW(), INTERVAL 5 HOUR) | head 3';
    const payload = transformPplFormToPayload(
      baseForm({ query: q, useLookBackWindow: false, lookbackTimestampField: '@timestamp' })
    );
    expect((payload.inputs as any)[0].ppl_input.query).toBe(q);
  });
});

describe('transformPplFormToPayload — throttling', () => {
  const withAction = (action: Record<string, unknown>) =>
    baseForm({
      pplTriggers: [
        {
          ...baseTrigger,
          actions: [
            {
              name: 'a1',
              destinationId: 'chan-1',
              subject: 'subj',
              message: 'msg',
              ...action,
            } as any,
          ],
        },
      ],
    });

  const actionOf = (payload: Record<string, unknown>) =>
    (payload.triggers as any)[0].ppl_trigger.actions[0];

  it('emits throttle_enabled + throttle when enabled', () => {
    const payload = transformPplFormToPayload(
      withAction({ throttleEnabled: true, throttleValue: 15 })
    );
    expect(actionOf(payload).throttle_enabled).toBe(true);
    expect(actionOf(payload).throttle).toEqual({ value: 15, unit: 'MINUTES' });
  });

  it('emits throttle_enabled:false and no throttle when disabled', () => {
    const payload = transformPplFormToPayload(
      withAction({ throttleEnabled: false, throttleValue: 15 })
    );
    expect(actionOf(payload).throttle_enabled).toBe(false);
    expect(actionOf(payload).throttle).toBeUndefined();
  });

  it('falls back to a 10-minute default for an invalid enabled value', () => {
    const payload = transformPplFormToPayload(
      withAction({ throttleEnabled: true, throttleValue: 0 })
    );
    expect(actionOf(payload).throttle).toEqual({ value: 10, unit: 'MINUTES' });
  });
});

describe('unifiedRuleToOsForm — round-trip', () => {
  // Round-trip is driven purely by parsing the injected filter out of the query
  // (ppl_monitor persists no metadata), so these use only the query string.
  it('restores look-back fields by parsing the injected filter and strips it from the query', () => {
    const raw = {
      monitor_type: 'ppl_monitor',
      inputs: [
        {
          ppl_input: {
            query:
              'source = logs-* | where @timestamp > DATE_SUB(NOW(), INTERVAL 3 HOUR) | stats count()',
          },
        },
      ],
      schedule: { period: { interval: 5, unit: 'MINUTES' } },
      triggers: [],
    };
    const seed = unifiedRuleToOsForm({ name: 'r', enabled: true, raw });
    expect(seed.useLookBackWindow).toBe(true);
    expect(seed.lookBackAmount).toBe(3);
    expect(seed.lookBackUnit).toBe('hours');
    expect(seed.lookbackTimestampField).toBe('@timestamp');
    expect(seed.query).toBe('source = logs-* | stats count()');
  });

  it('round-trips a rule with no look-back filter as disabled', () => {
    const seed = unifiedRuleToOsForm({
      name: 'r',
      enabled: true,
      raw: {
        inputs: [{ ppl_input: { query: 'source = a' } }],
        triggers: [],
      },
    });
    expect(seed.useLookBackWindow).toBe(false);
    expect(seed.query).toBe('source = a');
  });

  it('restores action throttle settings', () => {
    const seed = unifiedRuleToOsForm({
      name: 'r',
      enabled: true,
      raw: {
        inputs: [{ ppl_input: { query: 'source = a' } }],
        triggers: [
          {
            ppl_trigger: {
              name: 't',
              severity: '3',
              type: 'number_of_results',
              num_results_condition: '>=',
              num_results_value: 1,
              actions: [
                {
                  name: 'a',
                  destination_id: 'c',
                  message_template: { source: 'm' },
                  throttle_enabled: true,
                  throttle: { value: 20, unit: 'MINUTES' },
                },
              ],
            },
          },
        ],
      },
    });
    const action = seed.pplTriggers[0].actions[0];
    expect(action.throttleEnabled).toBe(true);
    expect(action.throttleValue).toBe(20);
  });

  it('defaults throttle off for an action with no throttle stored', () => {
    const seed = unifiedRuleToOsForm({
      name: 'r',
      enabled: true,
      raw: {
        inputs: [{ ppl_input: { query: 'source = a' } }],
        triggers: [
          {
            ppl_trigger: {
              name: 't',
              type: 'number_of_results',
              num_results_condition: '>=',
              num_results_value: 1,
              actions: [{ name: 'a', destination_id: 'c', message_template: { source: 'm' } }],
            },
          },
        ],
      },
    });
    const action = seed.pplTriggers[0].actions[0];
    expect(action.throttleEnabled).toBe(false);
    expect(action.throttleValue).toBe(10);
  });
});

// Edit (unifiedRuleToOsForm) then save (transformPplFormToPayload) with no user
// changes must reproduce the stored query byte-for-byte, whatever the user wrote.
describe('edit → unchanged save is lossless', () => {
  const ruleWith = (query: string) => ({
    name: 'r',
    enabled: true,
    raw: { inputs: [{ ppl_input: { query } }], triggers: [] },
  });
  const resave = (query: string) => {
    const seed = unifiedRuleToOsForm(ruleWith(query));
    const payload = transformPplFormToPayload({ ...seed, pplTriggers: [] });
    return { seed, saved: (payload.inputs as any)[0].ppl_input.query as string };
  };

  it.each([
    ['plain query', 'source = logs | stats count()'],
    [
      'compound hand-written time filter',
      "source = logs | where @timestamp > DATE_SUB(NOW(), INTERVAL 1 HOUR) and level = 'ERROR' | stats count()",
    ],
    [
      'hand-written filter after eval',
      'source = logs | eval ts = @timestamp | where ts > DATE_SUB(NOW(), INTERVAL 1 HOUR) | stats count()',
    ],
    [
      'hand-written filter after stats',
      'source = logs | stats count() by host | where @timestamp > DATE_SUB(NOW(), INTERVAL 5 MINUTE)',
    ],
    [
      '14-day filter later in the pipeline',
      'source = logs | where a = 1 | where t > DATE_SUB(NOW(), INTERVAL 14 DAY)',
    ],
    [
      'absolute range',
      "source = logs | where @timestamp > '2026-01-01' and @timestamp < '2026-01-02'",
    ],
  ])('%s: look-back off, query kept verbatim', (_, q) => {
    const { seed, saved } = resave(q);
    expect(seed.useLookBackWindow).toBe(false);
    expect(seed.query).toBe(q);
    expect(saved).toBe(q);
  });

  it('plugin clause: parsed into the window and re-saved identically', () => {
    const q =
      'source = logs | where @timestamp > DATE_SUB(NOW(), INTERVAL 45 MINUTE) | where x = 1 | stats count()';
    const { seed, saved } = resave(q);
    expect(seed).toMatchObject({
      useLookBackWindow: true,
      lookBackAmount: 45,
      lookBackUnit: 'minutes',
      lookbackTimestampField: '@timestamp',
      query: 'source = logs | where x = 1 | stats count()',
    });
    expect(saved).toBe(q);
  });

  it('a hand-written 14-day filter no longer blocks saving an unchanged edit', () => {
    const q = 'source = logs | where a = 1 | where t > DATE_SUB(NOW(), INTERVAL 14 DAY)';
    const seed = unifiedRuleToOsForm(ruleWith(q));
    const res = validatePplForm({ ...seed, pplTriggers: [validTrigger] });
    expect(res.valid).toBe(true);
  });
});

const validTrigger = {
  name: 't',
  type: 'number_of_results' as const,
  numResultsCondition: '>=',
  numResultsValue: 1,
  customCondition: '',
  actions: [],
};

describe('validatePplForm — look-back + throttle', () => {
  const validBase = {
    name: 'rule',
    query: 'source = logs-*',
    pplTriggers: [
      {
        name: 't',
        type: 'number_of_results' as const,
        numResultsCondition: '>=',
        numResultsValue: 1,
        customCondition: '',
        actions: [],
      },
    ],
  };

  it('accepts a window within bounds', () => {
    const res = validatePplForm({
      ...validBase,
      useLookBackWindow: true,
      lookBackAmount: 1,
      lookBackUnit: 'hours',
      lookbackTimestampField: '@timestamp',
    });
    expect(res.valid).toBe(true);
  });

  it('rejects a window over 7 days', () => {
    const res = validatePplForm({
      ...validBase,
      useLookBackWindow: true,
      lookBackAmount: 8,
      lookBackUnit: 'days',
      lookbackTimestampField: '@timestamp',
    });
    expect(res.valid).toBe(false);
    expect(res.errors.lookBackWindow).toMatch(/at most 7 days/);
  });

  it('rejects a zero window', () => {
    const res = validatePplForm({
      ...validBase,
      useLookBackWindow: true,
      lookBackAmount: 0,
      lookBackUnit: 'minutes',
      lookbackTimestampField: '@timestamp',
    });
    expect(res.valid).toBe(false);
    expect(res.errors.lookBackWindow).toMatch(/at least 1 minute/);
  });

  it('ignores look-back validation when there is no timestamp field', () => {
    const res = validatePplForm({
      ...validBase,
      useLookBackWindow: true,
      lookBackAmount: 99,
      lookBackUnit: 'days',
      lookbackTimestampField: '',
    });
    expect(res.valid).toBe(true);
  });

  it('rejects a sub-minute / non-integer throttle when enabled', () => {
    const res = validatePplForm({
      ...validBase,
      pplTriggers: [
        {
          ...validBase.pplTriggers[0],
          actions: [
            {
              destinationId: 'c',
              subject: '',
              message: 'm',
              throttleEnabled: true,
              throttleValue: 0,
            },
          ],
        },
      ],
    });
    expect(res.valid).toBe(false);
    expect(res.errors['pplTriggers[0].actions[0].throttleValue']).toMatch(/≥ 1/);
  });

  // Query length is NOT capped client-side — the alerting backend enforces
  // `ppl_monitor_max_query_length` (a cluster may raise it) and is authoritative.
  // Blocking here on a hard-coded default would lock out users who increased it.
  it('does NOT reject a long query on its own (backend is authoritative)', () => {
    const res = validatePplForm({
      ...validBase,
      query: 'source = idx | where ' + 'b'.repeat(5000),
    });
    expect(res.valid).toBe(true);
    expect(res.errors.query).toBeUndefined();
  });

  it('does NOT reject even when the look-back injection makes the query longer', () => {
    const near = 'source = idx | where ' + 'a'.repeat(1990 - 'source = idx | where '.length);
    const res = validatePplForm({
      ...validBase,
      query: near,
      useLookBackWindow: true,
      lookBackAmount: 1,
      lookBackUnit: 'hours',
      lookbackTimestampField: '@timestamp',
    });
    expect(res.valid).toBe(true);
    expect(res.errors.query).toBeUndefined();
  });

  it('accepts an enabled whole-minute throttle', () => {
    const res = validatePplForm({
      ...validBase,
      pplTriggers: [
        {
          ...validBase.pplTriggers[0],
          actions: [
            {
              destinationId: 'c',
              subject: '',
              message: 'm',
              throttleEnabled: true,
              throttleValue: 5,
            },
          ],
        },
      ],
    });
    expect(res.valid).toBe(true);
  });

  it('ignores throttle value when throttling is disabled', () => {
    const res = validatePplForm({
      ...validBase,
      pplTriggers: [
        {
          ...validBase.pplTriggers[0],
          actions: [
            {
              destinationId: 'c',
              subject: '',
              message: 'm',
              throttleEnabled: false,
              throttleValue: 0,
            },
          ],
        },
      ],
    });
    expect(res.valid).toBe(true);
  });
});

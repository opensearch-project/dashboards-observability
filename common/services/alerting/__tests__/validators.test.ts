/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  parseDuration,
  formatDuration,
  PPL_NOTIFICATION_MESSAGE_MAX,
  PPL_NOTIFICATION_SUBJECT_MAX,
  PPL_NUM_RESULTS_MAX,
  PPL_QUERY_MAX_LENGTH,
  PplFormShape,
  validateMonitorForm,
  validatePplForm,
  MonitorFormState,
} from '../validators';

const validForm: MonitorFormState = {
  name: 'test-monitor',
  query: 'up == 1',
  threshold: { operator: '>', value: 100, unit: 'ms', forDuration: '5m' },
  evaluationInterval: '1m',
  pendingPeriod: '5m',
  firingPeriod: '10m',
  labels: [],
  annotations: [],
  severity: 'critical',
  enabled: true,
};

describe('parseDuration', () => {
  it('parses valid durations', () => {
    expect(parseDuration('30s')).toEqual({ valid: true, seconds: 30 });
    expect(parseDuration('2m')).toEqual({ valid: true, seconds: 120 });
    expect(parseDuration('1h')).toEqual({ valid: true, seconds: 3600 });
    expect(parseDuration('1d')).toEqual({ valid: true, seconds: 86400 });
  });

  it('rejects invalid input', () => {
    expect(parseDuration('')).toEqual({ valid: false, seconds: 0, error: 'Duration is required' });
    expect(parseDuration('abc')).toMatchObject({ valid: false });
    expect(parseDuration('0s')).toMatchObject({ valid: false, error: 'Duration must be positive' });
  });
});

describe('formatDuration', () => {
  it('formats seconds to human-readable', () => {
    expect(formatDuration(86400)).toBe('1d');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(120)).toBe('2m');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(0)).toBe('0s');
  });
});

describe('validateMonitorForm', () => {
  it('returns valid for a correct form', () => {
    expect(validateMonitorForm(validForm)).toEqual({ valid: true, errors: {} });
  });

  it('requires name and query', () => {
    const result = validateMonitorForm({ ...validForm, name: '', query: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
    expect(result.errors.query).toBeDefined();
  });

  it('rejects name over 256 chars', () => {
    const result = validateMonitorForm({ ...validForm, name: 'a'.repeat(257) });
    expect(result.errors.name).toMatch(/256/);
  });

  it('rejects control characters in name', () => {
    const result = validateMonitorForm({ ...validForm, name: 'bad\x00name' });
    expect(result.errors.name).toMatch(/control/);
  });

  it('validates label keys', () => {
    const result = validateMonitorForm({
      ...validForm,
      labels: [{ key: '123bad', value: 'v' }],
    });
    expect(result.errors['labels[0].key']).toBeDefined();
  });

  it('detects duplicate label keys', () => {
    const result = validateMonitorForm({
      ...validForm,
      labels: [
        { key: 'env', value: 'a' },
        { key: 'env', value: 'b' },
      ],
    });
    expect(result.errors['labels[1].key']).toMatch(/Duplicate/);
  });
});

// ============================================================================
// PPL form validation
// ============================================================================

const validPplForm = (): PplFormShape => ({
  name: 'test-monitor',
  query: 'source = logs-* | stats count() as cnt',
  pplTriggers: [
    {
      name: 'trigger-1',
      type: 'number_of_results',
      numResultsCondition: '>',
      numResultsValue: 5,
      customCondition: 'where ',
      actions: [],
    },
  ],
});

describe('validatePplForm', () => {
  it('accepts a minimal valid form', () => {
    const result = validatePplForm(validPplForm());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('rejects empty name', () => {
    const f = validPplForm();
    f.name = '';
    expect(validatePplForm(f).errors.name).toMatch(/required/i);
  });

  it('rejects empty query', () => {
    const f = validPplForm();
    f.query = '   ';
    expect(validatePplForm(f).errors.query).toMatch(/required/i);
  });

  it('rejects query above the cap', () => {
    const f = validPplForm();
    f.query = 'a'.repeat(PPL_QUERY_MAX_LENGTH + 1);
    expect(validatePplForm(f).errors.query).toMatch(/2000/);
  });

  it('rejects empty triggers list', () => {
    const f = validPplForm();
    f.pplTriggers = [];
    expect(validatePplForm(f).errors.pplTriggers).toMatch(/at least one trigger/i);
  });

  it('rejects an out-of-range num-results threshold', () => {
    const f = validPplForm();
    f.pplTriggers[0].numResultsValue = PPL_NUM_RESULTS_MAX + 1;
    expect(validatePplForm(f).errors['pplTriggers[0].numResultsValue']).toMatch(/integer/i);
  });

  it('rejects a non-integer num-results threshold', () => {
    const f = validPplForm();
    f.pplTriggers[0].numResultsValue = 1.5;
    expect(validatePplForm(f).errors['pplTriggers[0].numResultsValue']).toMatch(/integer/i);
  });

  it('rejects a custom condition without "where"', () => {
    const f = validPplForm();
    f.pplTriggers[0] = { ...f.pplTriggers[0], type: 'custom', customCondition: 'eval x = 1' };
    expect(validatePplForm(f).errors['pplTriggers[0].customCondition']).toMatch(/where/i);
  });

  it('accepts a custom condition starting with "where"', () => {
    const f = validPplForm();
    f.pplTriggers[0] = {
      ...f.pplTriggers[0],
      type: 'custom',
      customCondition: 'where avg > 10',
    };
    expect(validatePplForm(f).valid).toBe(true);
  });

  it('rejects an action without a destination', () => {
    const f = validPplForm();
    f.pplTriggers[0].actions = [{ destinationId: '', subject: '', message: 'msg' }];
    expect(validatePplForm(f).errors['pplTriggers[0].actions[0].destinationId']).toMatch(
      /required/i
    );
  });

  it('rejects subject above the cap', () => {
    const f = validPplForm();
    f.pplTriggers[0].actions = [
      {
        destinationId: 'd',
        subject: 'x'.repeat(PPL_NOTIFICATION_SUBJECT_MAX + 1),
        message: 'm',
      },
    ];
    expect(validatePplForm(f).errors['pplTriggers[0].actions[0].subject']).toMatch(/1000/);
  });

  it('rejects empty action message', () => {
    const f = validPplForm();
    f.pplTriggers[0].actions = [{ destinationId: 'd', subject: '', message: '' }];
    expect(validatePplForm(f).errors['pplTriggers[0].actions[0].message']).toMatch(/required/i);
  });

  it('rejects message above the cap', () => {
    const f = validPplForm();
    f.pplTriggers[0].actions = [
      {
        destinationId: 'd',
        subject: '',
        message: 'x'.repeat(PPL_NOTIFICATION_MESSAGE_MAX + 1),
      },
    ];
    expect(validatePplForm(f).errors['pplTriggers[0].actions[0].message']).toMatch(/5000/);
  });
});

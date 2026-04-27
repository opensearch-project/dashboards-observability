/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  parseDuration,
  formatDuration,
  validateMonitorForm,
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

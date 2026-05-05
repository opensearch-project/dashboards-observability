/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { validatePromQL, prettifyPromQL } from '../promql_validator';

describe('validatePromQL', () => {
  it('returns empty errors/warnings for valid query', () => {
    const result = validatePromQL('rate(http_requests_total{job="api"}[5m])');
    expect(result.errors).toHaveLength(0);
  });

  it('returns empty for blank input', () => {
    expect(validatePromQL('')).toEqual({ errors: [], warnings: [] });
    expect(validatePromQL('  ')).toEqual({ errors: [], warnings: [] });
  });

  it('detects unmatched brackets', () => {
    const result = validatePromQL('rate(metric[5m)');
    expect(result.errors.some((e) => e.type === 'bracket')).toBe(true);
  });

  it('detects missing range vector for rate()', () => {
    const result = validatePromQL('rate(http_requests_total)');
    expect(result.errors.some((e) => e.type === 'range-vector')).toBe(true);
  });

  it('warns on empty label matcher', () => {
    const result = validatePromQL('up{ }');
    expect(result.warnings.some((e) => e.type === 'label-matcher')).toBe(true);
  });

  it('warns on rate without label filters', () => {
    const result = validatePromQL('rate(m[5m])');
    expect(result.warnings.some((e) => e.type === 'cardinality')).toBe(true);
  });
});

describe('prettifyPromQL', () => {
  it('returns empty string for blank input', () => {
    expect(prettifyPromQL('')).toBe('');
  });

  it('normalizes spaces around operators', () => {
    expect(prettifyPromQL('a+b')).toBe('a + b');
  });
});

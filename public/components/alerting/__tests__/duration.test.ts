/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { formatSeconds, normalizeDuration } from '../utils/duration';

describe('formatSeconds', () => {
  it('formats zero and negatives as 0s (fire immediately)', () => {
    expect(formatSeconds(0)).toBe('0s');
    expect(formatSeconds(-5)).toBe('0s');
  });

  it('formats whole minutes and hours compactly', () => {
    expect(formatSeconds(300)).toBe('5m');
    expect(formatSeconds(3600)).toBe('1h');
    expect(formatSeconds(45)).toBe('45s');
  });
});

describe('normalizeDuration', () => {
  it('passes through m/h/d values', () => {
    expect(normalizeDuration('10m')).toBe('10m');
    expect(normalizeDuration('2h')).toBe('2h');
  });

  it('converts seconds strings', () => {
    expect(normalizeDuration('300s')).toBe('5m');
    expect(normalizeDuration('0s')).toBe('0s');
  });

  it('treats bare numeric strings as seconds (YAML `for: 0` stringified)', () => {
    expect(normalizeDuration('0')).toBe('0s');
    expect(normalizeDuration('120')).toBe('2m');
  });

  it('falls back for empty input and passes through unparseable values', () => {
    expect(normalizeDuration('')).toBe('5m');
    expect(normalizeDuration('', '—')).toBe('—');
    expect(normalizeDuration('weird')).toBe('weird');
  });
});

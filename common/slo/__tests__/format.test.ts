/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';
import { EMPTY_VALUE_FALLBACK, SLO_PRECISION, formatPct } from '../format';

describe('formatPct', () => {
  const originalLocale = i18n.getLocale();

  afterEach(() => {
    i18n.setLocale(originalLocale);
  });

  describe('en locale (default)', () => {
    beforeEach(() => {
      i18n.setLocale('en');
    });

    it('pins the classic 99.95% output (regression for CLAR10 compat)', () => {
      // Existing call sites rely on this exact string; must not drift.
      expect(formatPct(0.9995, { decimals: 2 })).toBe('99.95%');
    });

    it('keeps the default decimals = 1 output stable', () => {
      expect(formatPct(0.9)).toBe('90.0%');
      expect(formatPct(0.12345)).toBe('12.3%');
    });

    it('preserves requested precision (fixed fraction digits)', () => {
      expect(formatPct(0.5, { decimals: 0 })).toBe('50%');
      expect(formatPct(1, { decimals: 2 })).toBe('100.00%');
      expect(formatPct(0.999999, { decimals: 3 })).toBe('100.000%');
    });

    it('does not double-multiply by 100 (Intl percent style multiplies once)', () => {
      expect(formatPct(0.01, { decimals: 0 })).toBe('1%');
      expect(formatPct(1.5, { decimals: 0 })).toBe('150%');
    });

    it('applies locale grouping for large percentages', () => {
      expect(formatPct(12.3456, { decimals: 2 })).toBe('1,234.56%');
    });
  });

  describe('non-finite fallback', () => {
    it('returns the localized default fallback for NaN/Infinity', () => {
      expect(formatPct(NaN)).toBe(EMPTY_VALUE_FALLBACK);
      expect(formatPct(Infinity)).toBe(EMPTY_VALUE_FALLBACK);
      expect(formatPct(-Infinity)).toBe(EMPTY_VALUE_FALLBACK);
    });

    it('defaults the fallback glyph to an em dash', () => {
      expect(EMPTY_VALUE_FALLBACK).toBe('—');
      expect(formatPct(NaN)).toBe('—');
    });

    it('honors a caller-supplied fallback', () => {
      expect(formatPct(NaN, { fallback: 'n/a' })).toBe('n/a');
    });
  });

  describe('locale correctness', () => {
    it('formats the percent per the active locale', () => {
      i18n.setLocale('en');
      const enOutput = formatPct(0.9995, { decimals: 2 });

      i18n.setLocale('de');
      const deOutput = formatPct(0.9995, { decimals: 2 });

      // German uses a comma decimal separator; the exact spacing glyph before
      // `%` varies by ICU version, so assert the locale-defining separator and
      // that the two locales diverge rather than pinning the whole string.
      expect(enOutput).toBe('99.95%');
      expect(deOutput).toContain('99,95');
      expect(deOutput).not.toBe(enOutput);
    });
  });
});

describe('SLO_PRECISION', () => {
  it('defines a precision for every SLO render surface', () => {
    expect(SLO_PRECISION).toEqual({
      attainment: 2,
      target: 2,
      budget: 2,
      eventsRatio: 1,
      burnRate: 1,
    });
  });

  it('keeps attainment and target at matching precision', () => {
    expect(SLO_PRECISION.target).toBe(SLO_PRECISION.attainment);
  });

  it('drives formatPct output for the budget surface', () => {
    i18n.setLocale('en');
    expect(formatPct(0.5, { decimals: SLO_PRECISION.budget })).toBe('50.00%');
  });
});

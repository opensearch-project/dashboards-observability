/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SLO_HEALTH_COLOR, SLO_HEALTH_ORDER, getSloHealthColor } from '../state';
import type { SloHealthState } from '../slo_types';

describe('slo state helpers', () => {
  describe('getSloHealthColor', () => {
    it('returns danger for rules_missing', () => {
      expect(getSloHealthColor('rules_missing')).toBe('danger');
    });

    it('returns the right color for every known state', () => {
      const expected: Record<SloHealthState, string> = {
        breached: 'danger',
        warning: 'warning',
        ok: 'success',
        no_data: 'subdued',
        stale: 'subdued',
        disabled: 'default',
        rules_missing: 'danger',
      };

      (Object.keys(expected) as SloHealthState[]).forEach((state) => {
        expect(getSloHealthColor(state)).toBe(expected[state]);
      });
    });

    it('falls back to subdued for undefined', () => {
      expect(getSloHealthColor(undefined)).toBe('subdued');
    });

    it('falls back to subdued for null', () => {
      expect(getSloHealthColor(null)).toBe('subdued');
    });

    it('falls back to subdued for an unknown string', () => {
      expect(getSloHealthColor('bogus')).toBe('subdued');
    });
  });

  describe('SLO_HEALTH_ORDER', () => {
    it('contains every key of SLO_HEALTH_COLOR exactly once', () => {
      const colorKeys = Object.keys(SLO_HEALTH_COLOR).sort();
      const orderKeys = [...SLO_HEALTH_ORDER].sort();
      expect(orderKeys).toEqual(colorKeys);

      // Guard against duplicates.
      const seen = new Set<string>();
      SLO_HEALTH_ORDER.forEach((state) => {
        expect(seen.has(state)).toBe(false);
        seen.add(state);
      });
      expect(seen.size).toBe(SLO_HEALTH_ORDER.length);
    });

    it('places rules_missing between breached and warning', () => {
      const breachedIdx = SLO_HEALTH_ORDER.indexOf('breached');
      const rulesMissingIdx = SLO_HEALTH_ORDER.indexOf('rules_missing');
      const warningIdx = SLO_HEALTH_ORDER.indexOf('warning');

      expect(breachedIdx).toBeGreaterThanOrEqual(0);
      expect(rulesMissingIdx).toBe(breachedIdx + 1);
      expect(warningIdx).toBe(rulesMissingIdx + 1);
    });
  });
});

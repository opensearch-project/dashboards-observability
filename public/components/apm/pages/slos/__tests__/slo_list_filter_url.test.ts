/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  deserializeFiltersFromSearch,
  filtersEqual,
  serializeFiltersToSearch,
} from '../slo_list_filter_url';

describe('slo_list_filter_url', () => {
  describe('deserializeFiltersFromSearch', () => {
    it('parses multi-value state and tier from comma-joined query', () => {
      expect(deserializeFiltersFromSearch('?state=breached,warning&tier=tier-1,tier-2')).toEqual({
        state: ['breached', 'warning'],
        tier: ['tier-1', 'tier-2'],
      });
    });

    it('drops unknown state values silently', () => {
      expect(deserializeFiltersFromSearch('?state=breached,garbage')).toEqual({
        state: ['breached'],
      });
    });

    it('parses enabled tri-state', () => {
      expect(deserializeFiltersFromSearch('?enabled=true')).toEqual({ enabled: true });
      expect(deserializeFiltersFromSearch('?enabled=false')).toEqual({ enabled: false });
      expect(deserializeFiltersFromSearch('?enabled=garbage')).toEqual({});
    });

    it('tolerates leading ? or no ?', () => {
      expect(deserializeFiltersFromSearch('state=ok')).toEqual({ state: ['ok'] });
      expect(deserializeFiltersFromSearch('?state=ok')).toEqual({ state: ['ok'] });
      expect(deserializeFiltersFromSearch('')).toEqual({});
    });

    it('parses canonicalKind and drops unknown kinds', () => {
      expect(
        deserializeFiltersFromSearch('?canonicalKind=apm-availability,http-latency,bogus-kind')
      ).toEqual({
        canonicalKind: ['apm-availability', 'http-latency'],
      });
    });
  });

  describe('serializeFiltersToSearch', () => {
    it('omits empty arrays and undefined', () => {
      expect(serializeFiltersToSearch({ state: [], search: '' })).toBe('');
      expect(serializeFiltersToSearch({})).toBe('');
    });

    it('comma-joins array values', () => {
      expect(
        serializeFiltersToSearch({
          state: ['breached', 'warning'],
          tier: ['tier-1'],
          enabled: true,
          search: 'api',
        })
      ).toBe('state=breached%2Cwarning&tier=tier-1&enabled=true&search=api');
    });

    it('round-trips through deserialize', () => {
      const original = {
        state: ['breached' as const],
        sliBackend: ['prometheus' as const],
        service: ['payments-api'],
        team: ['sre'],
        enabled: false,
        mode: ['active' as const],
        search: 'checkout',
      };
      const raw = serializeFiltersToSearch(original);
      expect(deserializeFiltersFromSearch(`?${raw}`)).toEqual(original);
    });

    it('round-trips canonicalKind', () => {
      const original = {
        canonicalKind: ['apm-availability' as const, 'db-latency' as const],
      };
      const raw = serializeFiltersToSearch(original);
      expect(deserializeFiltersFromSearch(`?${raw}`)).toEqual(original);
    });
  });

  describe('filtersEqual', () => {
    it('treats identical filter objects as equal', () => {
      expect(filtersEqual({ state: ['ok'] }, { state: ['ok'] })).toBe(true);
    });

    it('treats different ordering on arrays as NOT equal (stable serialization)', () => {
      // This is the intentional contract: two URLs with swapped comma order
      // are distinct, which prevents the URL-sync effect from flickering.
      expect(filtersEqual({ state: ['ok', 'breached'] }, { state: ['breached', 'ok'] })).toBe(
        false
      );
    });

    it('treats {} as equal to { state: [] }', () => {
      expect(filtersEqual({}, { state: [] })).toBe(true);
    });
  });
});

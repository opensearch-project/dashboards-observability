/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { parseSuggestScopeFromSearch } from '../slo_suggest_scope';

describe('parseSuggestScopeFromSearch', () => {
  it('returns default source and no services for an empty search', () => {
    expect(parseSuggestScopeFromSearch('')).toEqual({
      source: 'apm',
      services: undefined,
      timeRange: undefined,
    });
    expect(parseSuggestScopeFromSearch('?')).toEqual({
      source: 'apm',
      services: undefined,
      timeRange: undefined,
    });
  });

  it('accepts the `apm` source', () => {
    expect(parseSuggestScopeFromSearch('?source=apm')).toEqual({
      source: 'apm',
      services: undefined,
      timeRange: undefined,
    });
  });

  it('falls back to `apm` for unknown source values', () => {
    expect(parseSuggestScopeFromSearch('?source=bogus').source).toBe('apm');
  });

  it('parses a csv services list', () => {
    expect(parseSuggestScopeFromSearch('?services=foo,bar,baz')).toEqual({
      source: 'apm',
      services: ['foo', 'bar', 'baz'],
      timeRange: undefined,
    });
  });

  it('trims whitespace and drops empty entries', () => {
    expect(parseSuggestScopeFromSearch('?services=foo,%20bar%20,,baz')).toEqual({
      source: 'apm',
      services: ['foo', 'bar', 'baz'],
      timeRange: undefined,
    });
  });

  it('treats an empty services list as unscoped', () => {
    expect(parseSuggestScopeFromSearch('?services=')).toEqual({
      source: 'apm',
      services: undefined,
      timeRange: undefined,
    });
    expect(parseSuggestScopeFromSearch('?services=,,,')).toEqual({
      source: 'apm',
      services: undefined,
      timeRange: undefined,
    });
  });

  it('round-trips both params together', () => {
    expect(parseSuggestScopeFromSearch('?source=apm&services=checkout,cart')).toEqual({
      source: 'apm',
      services: ['checkout', 'cart'],
      timeRange: undefined,
    });
  });

  it('decodes percent-encoded service names', () => {
    expect(parseSuggestScopeFromSearch('?services=my%20svc,other%2Fpath')).toEqual({
      source: 'apm',
      services: ['my svc', 'other/path'],
      timeRange: undefined,
    });
  });

  describe('timeRange', () => {
    it('parses relative from/to into a timeRange', () => {
      expect(parseSuggestScopeFromSearch('?from=now-1h&to=now').timeRange).toEqual({
        from: 'now-1h',
        to: 'now',
      });
    });

    it('parses absolute ISO from/to into a timeRange', () => {
      expect(
        parseSuggestScopeFromSearch('?from=2024-01-01T00:00:00Z&to=2024-01-02T00:00:00Z').timeRange
      ).toEqual({
        from: '2024-01-01T00:00:00Z',
        to: '2024-01-02T00:00:00Z',
      });
    });

    it('parses slash-rounded datemath from EuiSuperDatePicker quick ranges', () => {
      // `now/d`, `now/w`, `now-1d/d` etc. contain a slash — the char class must
      // allow it or the carried-over range is silently dropped.
      expect(parseSuggestScopeFromSearch('?from=now%2Fd&to=now%2Fd').timeRange).toEqual({
        from: 'now/d',
        to: 'now/d',
      });
      expect(parseSuggestScopeFromSearch('?from=now-1d%2Fd&to=now').timeRange).toEqual({
        from: 'now-1d/d',
        to: 'now',
      });
    });

    it('returns undefined when only one bound is present', () => {
      expect(parseSuggestScopeFromSearch('?from=now-1h').timeRange).toBeUndefined();
      expect(parseSuggestScopeFromSearch('?to=now').timeRange).toBeUndefined();
    });

    it('returns undefined when a bound contains disallowed characters', () => {
      expect(parseSuggestScopeFromSearch('?from=now-1h&to=<script>').timeRange).toBeUndefined();
    });

    it('returns undefined when a bound exceeds the length limit', () => {
      const longValue = 'n'.repeat(300);
      expect(parseSuggestScopeFromSearch(`?from=now-1h&to=${longValue}`).timeRange).toBeUndefined();
    });

    it('parses services and timeRange together', () => {
      expect(parseSuggestScopeFromSearch('?services=checkout&from=now-24h&to=now')).toEqual({
        source: 'apm',
        services: ['checkout'],
        timeRange: { from: 'now-24h', to: 'now' },
      });
    });
  });
});

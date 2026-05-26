/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { parseSuggestScopeFromSearch } from '../slo_suggest_scope';

describe('parseSuggestScopeFromSearch', () => {
  it('returns default source and no services for an empty search', () => {
    expect(parseSuggestScopeFromSearch('')).toEqual({ source: 'apm', services: undefined });
    expect(parseSuggestScopeFromSearch('?')).toEqual({ source: 'apm', services: undefined });
  });

  it('accepts the `apm` source', () => {
    expect(parseSuggestScopeFromSearch('?source=apm')).toEqual({
      source: 'apm',
      services: undefined,
    });
  });

  it('falls back to `apm` for unknown source values', () => {
    expect(parseSuggestScopeFromSearch('?source=bogus').source).toBe('apm');
  });

  it('parses a csv services list', () => {
    expect(parseSuggestScopeFromSearch('?services=foo,bar,baz')).toEqual({
      source: 'apm',
      services: ['foo', 'bar', 'baz'],
    });
  });

  it('trims whitespace and drops empty entries', () => {
    expect(parseSuggestScopeFromSearch('?services=foo,%20bar%20,,baz')).toEqual({
      source: 'apm',
      services: ['foo', 'bar', 'baz'],
    });
  });

  it('treats an empty services list as unscoped', () => {
    expect(parseSuggestScopeFromSearch('?services=')).toEqual({
      source: 'apm',
      services: undefined,
    });
    expect(parseSuggestScopeFromSearch('?services=,,,')).toEqual({
      source: 'apm',
      services: undefined,
    });
  });

  it('round-trips both params together', () => {
    expect(parseSuggestScopeFromSearch('?source=apm&services=checkout,cart')).toEqual({
      source: 'apm',
      services: ['checkout', 'cart'],
    });
  });

  it('decodes percent-encoded service names', () => {
    expect(parseSuggestScopeFromSearch('?services=my%20svc,other%2Fpath')).toEqual({
      source: 'apm',
      services: ['my svc', 'other/path'],
    });
  });
});

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  currentWorkspaceId,
  datasourceScopeCacheKey,
  readDatasourceScope,
  scopeFromFilter,
  writeDatasourceScope,
} from '../slo_datasource_scope_cache';

describe('slo_datasource_scope_cache', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    window.history.pushState({}, '', '/');
  });

  describe('currentWorkspaceId', () => {
    it('parses the workspace id from a /w/<id>/ path', () => {
      window.history.pushState({}, '', '/w/QDtBaa/app/observability-apm-slo');
      expect(currentWorkspaceId()).toBe('QDtBaa');
    });

    it('falls back to "default" when there is no workspace prefix', () => {
      window.history.pushState({}, '', '/app/observability-apm-slo');
      expect(currentWorkspaceId()).toBe('default');
    });
  });

  it('scopes the cache key by workspace', () => {
    expect(datasourceScopeCacheKey('ws-1')).not.toBe(datasourceScopeCacheKey('ws-2'));
  });

  describe('scopeFromFilter', () => {
    it('maps undefined → all, arrays → scope (including empty)', () => {
      expect(scopeFromFilter(undefined)).toEqual({ kind: 'all' });
      expect(scopeFromFilter(['a', 'b'])).toEqual({ kind: 'scope', ids: ['a', 'b'] });
      expect(scopeFromFilter([])).toEqual({ kind: 'scope', ids: [] });
    });
  });

  describe('read/write round-trip', () => {
    const key = datasourceScopeCacheKey('ws-1');

    it('returns null when nothing is stored (run auto-select)', () => {
      expect(readDatasourceScope(key)).toBeNull();
    });

    it('round-trips a selection', () => {
      writeDatasourceScope(key, { kind: 'scope', ids: ['ds-a', 'ds-b'] });
      expect(readDatasourceScope(key)).toEqual({ kind: 'scope', ids: ['ds-a', 'ds-b'] });
    });

    it('distinguishes "all" from an explicit empty scope (show nothing)', () => {
      writeDatasourceScope(key, { kind: 'all' });
      expect(readDatasourceScope(key)).toEqual({ kind: 'all' });

      writeDatasourceScope(key, { kind: 'scope', ids: [] });
      expect(readDatasourceScope(key)).toEqual({ kind: 'scope', ids: [] });
    });

    it('ignores non-string ids and malformed JSON', () => {
      window.sessionStorage.setItem(
        key,
        JSON.stringify({ kind: 'scope', ids: ['ds-a', 3, null, 'ds-b'] })
      );
      expect(readDatasourceScope(key)).toEqual({ kind: 'scope', ids: ['ds-a', 'ds-b'] });

      window.sessionStorage.setItem(key, 'not-json');
      expect(readDatasourceScope(key)).toBeNull();
    });
  });
});

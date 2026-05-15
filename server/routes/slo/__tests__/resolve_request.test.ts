/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the per-request resolvers PR 2 introduces:
 *   - `resolveActingUser` — picks the audit `createdBy` / `updatedBy` from the
 *     security plugin's auth credentials, falling back to proxy headers, then
 *     to `'unknown'`.
 *   - `resolveWorkspaceId` — pulls the workspace id off OSD's request scope
 *     via `getWorkspaceState`, falls back to `'default'` when workspaces are
 *     disabled, and rejects malformed ids by throwing `SloValidationError`
 *     so the route layer can return 400 instead of leaking the value into
 *     `sloRulerNamespaceFor`.
 */

import { httpServerMock } from '../../../../../../src/core/server/mocks';
import { updateWorkspaceState } from '../../../../../../src/core/server/utils';
import { SloValidationError } from '../../../../common/slo/slo_service';
import { resolveActingUser, resolveWorkspaceId } from '../index';

describe('resolveActingUser', () => {
  it('prefers req.auth.credentials.username when populated by the security plugin', () => {
    const req = {
      auth: { isAuthenticated: true, credentials: { username: 'alice' } },
      headers: { 'x-proxy-user': 'should-not-be-picked' },
    };
    expect(resolveActingUser(req)).toBe('alice');
  });

  it('falls back to x-proxy-user when auth credentials are absent', () => {
    const req = {
      auth: { isAuthenticated: false },
      headers: { 'x-proxy-user': 'bob' },
    };
    expect(resolveActingUser(req)).toBe('bob');
  });

  it('falls back to x-forwarded-user when both auth and x-proxy-user are absent', () => {
    const req = { headers: { 'x-forwarded-user': 'carol' } };
    expect(resolveActingUser(req)).toBe('carol');
  });

  it('returns "unknown" when no signal is available', () => {
    expect(resolveActingUser({})).toBe('unknown');
    expect(resolveActingUser({ headers: {} })).toBe('unknown');
    expect(resolveActingUser({ auth: { isAuthenticated: false } })).toBe('unknown');
  });

  it('ignores empty / whitespace usernames so a malformed credential does not get persisted', () => {
    expect(
      resolveActingUser({
        auth: { isAuthenticated: true, credentials: { username: '   ' } },
        headers: { 'x-proxy-user': 'fallback' },
      })
    ).toBe('fallback');
    expect(
      resolveActingUser({
        auth: { isAuthenticated: true, credentials: { username: '' } },
        headers: {},
      })
    ).toBe('unknown');
  });

  it('treats non-string usernames as missing (defends against type drift in security creds)', () => {
    expect(
      resolveActingUser({
        // simulate a security plugin variant that returns a structured credential
        auth: { isAuthenticated: true, credentials: { username: { id: 42 } as unknown } },
        headers: {},
      })
    ).toBe('unknown');
  });

  it('handles array-valued headers (multi-valued forwarded-user) by picking the first non-empty entry', () => {
    expect(
      resolveActingUser({
        headers: { 'x-forwarded-user': ['', '   ', 'dave', 'edna'] as string[] },
      })
    ).toBe('dave');
  });

  it('trims surrounding whitespace from the resolved name', () => {
    expect(
      resolveActingUser({
        auth: { isAuthenticated: true, credentials: { username: '  frank ' } },
      })
    ).toBe('frank');
  });
});

describe('resolveWorkspaceId', () => {
  it('returns the workspace id off the request scope when populated', () => {
    const req = httpServerMock.createOpenSearchDashboardsRequest();
    updateWorkspaceState(req, { requestWorkspaceId: 'team-a' });
    expect(resolveWorkspaceId(req)).toBe('team-a');
  });

  it('falls back to "default" when the workspace state is unset (workspaces disabled)', () => {
    const req = httpServerMock.createOpenSearchDashboardsRequest();
    expect(resolveWorkspaceId(req)).toBe('default');
  });

  it('throws SloValidationError on a malformed workspace id (path traversal)', () => {
    const req = httpServerMock.createOpenSearchDashboardsRequest();
    updateWorkspaceState(req, { requestWorkspaceId: '../etc/passwd' });
    expect(() => resolveWorkspaceId(req)).toThrow(SloValidationError);
  });

  it('throws SloValidationError on a workspace id with URL-special characters', () => {
    const req = httpServerMock.createOpenSearchDashboardsRequest();
    updateWorkspaceState(req, { requestWorkspaceId: 'team a/b' });
    expect(() => resolveWorkspaceId(req)).toThrow(SloValidationError);
  });

  it('throws SloValidationError when the workspace id is too long for the regex cap', () => {
    const req = httpServerMock.createOpenSearchDashboardsRequest();
    updateWorkspaceState(req, { requestWorkspaceId: 'a'.repeat(64) });
    expect(() => resolveWorkspaceId(req)).toThrow(SloValidationError);
  });

  it('the SloValidationError carries a workspaceId field key so the wizard can attribute the 400', () => {
    const req = httpServerMock.createOpenSearchDashboardsRequest();
    updateWorkspaceState(req, { requestWorkspaceId: '../traversal' });
    let captured: unknown;
    try {
      resolveWorkspaceId(req);
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeInstanceOf(SloValidationError);
    expect((captured as SloValidationError).errors).toHaveProperty('workspaceId');
  });

  it('accepts the documented charset (alphanumerics, underscore, hyphen)', () => {
    const req = httpServerMock.createOpenSearchDashboardsRequest();
    updateWorkspaceState(req, { requestWorkspaceId: 'Workspace_123-prod' });
    expect(resolveWorkspaceId(req)).toBe('Workspace_123-prod');
  });
});

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

  it('rejects usernames longer than the audit-field cap and falls through', () => {
    // 256-char username triggers the >255 reject; the proxy header takes
    // over so audit attribution still has a real signal.
    const tooLong = 'a'.repeat(256);
    expect(
      resolveActingUser({
        auth: { isAuthenticated: true, credentials: { username: tooLong } },
        headers: { 'x-proxy-user': 'fallback-from-overflow' },
      })
    ).toBe('fallback-from-overflow');
  });

  it('accepts a 255-char username at the cap', () => {
    const atCap = 'a'.repeat(255);
    expect(
      resolveActingUser({
        auth: { isAuthenticated: true, credentials: { username: atCap } },
      })
    ).toBe(atCap);
  });

  it('rejects usernames containing C0 control chars (log-injection / response-splitting vectors)', () => {
    // CRLF + null byte + DEL — each rejected; falls through to 'unknown'
    // when there is no other signal.
    expect(
      resolveActingUser({
        auth: { isAuthenticated: true, credentials: { username: 'alice\r\nSet-Cookie: x=y' } },
        headers: {},
      })
    ).toBe('unknown');
    expect(
      resolveActingUser({
        auth: { isAuthenticated: true, credentials: { username: 'bob\x00admin' } },
      })
    ).toBe('unknown');
    expect(
      resolveActingUser({
        headers: { 'x-proxy-user': 'mallory\x7f' },
      })
    ).toBe('unknown');
  });

  it('falls through to a clean header when the credential carries control chars', () => {
    expect(
      resolveActingUser({
        auth: { isAuthenticated: true, credentials: { username: 'alice\nINJECT' } },
        headers: { 'x-proxy-user': 'clean-fallback' },
      })
    ).toBe('clean-fallback');
  });

  it('accepts realistic non-ASCII username shapes (LDAP DN, email, Unicode) — only control chars are banned', () => {
    expect(
      resolveActingUser({
        auth: {
          isAuthenticated: true,
          credentials: { username: 'CN=Alice,OU=Users,DC=example,DC=com' },
        },
      })
    ).toBe('CN=Alice,OU=Users,DC=example,DC=com');
    expect(
      resolveActingUser({
        auth: { isAuthenticated: true, credentials: { username: 'alice@example.com' } },
      })
    ).toBe('alice@example.com');
    expect(
      resolveActingUser({
        auth: { isAuthenticated: true, credentials: { username: 'アリス' } },
      })
    ).toBe('アリス');
  });

  it('emits a debug log when falling through to "unknown" so operators can confirm the chain was walked', () => {
    const debug = jest.fn();
    expect(resolveActingUser({}, { debug })).toBe('unknown');
    expect(debug).toHaveBeenCalledTimes(1);
    expect(debug.mock.calls[0][0]).toMatch(/no signal in auth credentials or proxy headers/);
  });

  it('does NOT log when a candidate is found (debug noise stays bounded)', () => {
    const debug = jest.fn();
    expect(
      resolveActingUser(
        { auth: { isAuthenticated: true, credentials: { username: 'alice' } } },
        { debug }
      )
    ).toBe('alice');
    expect(debug).not.toHaveBeenCalled();
  });

  it('rejects usernames containing Unicode line/paragraph separators (U+2028, U+2029)', () => {
    // U+2028 (LINE SEPARATOR) and U+2029 (PARAGRAPH SEPARATOR) are
    // line-terminators in JS source and a few logging pipelines —
    // outside the C0/C1 ranges so they need an explicit ban.
    expect(
      resolveActingUser({
        auth: { isAuthenticated: true, credentials: { username: 'alice\u2028INJECT' } },
      })
    ).toBe('unknown');
    expect(
      resolveActingUser({
        auth: { isAuthenticated: true, credentials: { username: 'bob\u2029PARA' } },
      })
    ).toBe('unknown');
  });

  it('rejects usernames containing C1 control chars (NEL, escape sequences)', () => {
    // 0x85 is NEL — a line-break treated by some pipelines as equivalent
    // to LF. 0x9b is CSI. Both belong to the C1 control block (0x80-0x9f).
    expect(
      resolveActingUser({
        auth: { isAuthenticated: true, credentials: { username: 'alice\x85INJECT' } },
      })
    ).toBe('unknown');
    expect(
      resolveActingUser({
        auth: { isAuthenticated: true, credentials: { username: 'bob\x9bsomething' } },
      })
    ).toBe('unknown');
  });

  it('emits a debug log per sanitize-rejection so forensics can correlate the bad header', () => {
    const debug = jest.fn();
    // Inject CRLF in the credential, then a too-long proxy header, then
    // a clean forwarded-user. Expect: two debug lines (one per rejected
    // step), no fallthrough log (the third step succeeds).
    expect(
      resolveActingUser(
        {
          auth: { isAuthenticated: true, credentials: { username: 'alice\r\nINJECT' } },
          headers: {
            'x-proxy-user': 'a'.repeat(256),
            'x-forwarded-user': 'good-user',
          },
        },
        { debug }
      )
    ).toBe('good-user');
    expect(debug).toHaveBeenCalledTimes(2);
    expect(debug.mock.calls[0][0]).toMatch(
      /auth\.credentials\.username rejected \(control-chars\)/
    );
    expect(debug.mock.calls[1][0]).toMatch(/x-proxy-user rejected \(too-long\)/);
  });

  it('does NOT log when a candidate is just empty/whitespace (would be log spam)', () => {
    const debug = jest.fn();
    expect(
      resolveActingUser(
        {
          auth: { isAuthenticated: true, credentials: { username: '' } },
          headers: { 'x-proxy-user': '   ', 'x-forwarded-user': 'final' },
        },
        { debug }
      )
    ).toBe('final');
    // No reject lines for the empty/whitespace candidates; no fallthrough
    // line (succeeded on the third step).
    expect(debug).not.toHaveBeenCalled();
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

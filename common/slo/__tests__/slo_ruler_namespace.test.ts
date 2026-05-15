/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `sloRulerNamespaceFor` is the single site that composes the per-workspace
 * ruler namespace — the AMP invariant ("every rule group for workspace W
 * writes to `slo-generated-<W>`") holds iff every caller goes through this
 * helper with a validated workspace id.
 *
 * As of PR 2, the route layer pulls real workspace ids from request scope
 * via `getWorkspaceState(req).requestWorkspaceId`, falling back to
 * `'default'` when OSD workspaces are disabled. The shape check here makes
 * sure a caller that forgets to normalize trips a server-side error rather
 * than silently landing a namespace with `..` or `%`-encoded bytes in a
 * ruler URL.
 */

import { sloRulerNamespaceFor } from '../slo_service';

describe('sloRulerNamespaceFor', () => {
  it('appends the workspace id to the constant prefix', () => {
    expect(sloRulerNamespaceFor('default')).toBe('slo-generated-default');
    expect(sloRulerNamespaceFor('ws-alpha')).toBe('slo-generated-ws-alpha');
    expect(sloRulerNamespaceFor('Global1')).toBe('slo-generated-Global1');
  });

  it('accepts OSD-style saved-object ids', () => {
    expect(() => sloRulerNamespaceFor('ws_01-abc')).not.toThrow();
    expect(() => sloRulerNamespaceFor('workspace-0123')).not.toThrow();
    // Exactly 63 chars (leading char + 62 more — the pattern's upper bound).
    const longButValid = `a${'b'.repeat(62)}`;
    expect(() => sloRulerNamespaceFor(longButValid)).not.toThrow();
  });

  it('rejects path-traversal segments', () => {
    expect(() => sloRulerNamespaceFor('..')).toThrow();
    expect(() => sloRulerNamespaceFor('/etc/passwd')).toThrow();
  });

  it('rejects URL-special characters', () => {
    expect(() => sloRulerNamespaceFor('ws%20alpha')).toThrow();
    expect(() => sloRulerNamespaceFor('ws?admin')).toThrow();
    expect(() => sloRulerNamespaceFor('ws&alpha')).toThrow();
  });

  it('rejects spaces and unicode whitespace', () => {
    expect(() => sloRulerNamespaceFor('ws alpha')).toThrow();
    expect(() => sloRulerNamespaceFor('ws\talpha')).toThrow();
    expect(() => sloRulerNamespaceFor('ws​alpha')).toThrow();
  });

  it('rejects overlong ids', () => {
    const overlong = 'a'.repeat(64);
    expect(() => sloRulerNamespaceFor(overlong)).toThrow();
  });

  it('rejects leading separators', () => {
    expect(() => sloRulerNamespaceFor('-leading')).toThrow();
    expect(() => sloRulerNamespaceFor('_leading')).toThrow();
  });

  it('rejects empty and falsy inputs', () => {
    expect(() => sloRulerNamespaceFor('')).toThrow();
    expect(() => sloRulerNamespaceFor((undefined as unknown) as string)).toThrow();
    expect(() => sloRulerNamespaceFor((null as unknown) as string)).toThrow();
  });
});

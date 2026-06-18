/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for `alertingRuleIdSchema` — the colon-allowing path-param schema used
 * by the rule-detail route. Kept in a separate file from `schema_helpers.test.ts`
 * so the diff stays purely additive and textual (the sibling file carries a
 * literal NUL byte in a "null byte" rejection fixture on main, which makes any
 * modification to it render as a binary diff).
 */

import { alertingRuleIdSchema } from '../schema_helpers';

describe('alertingRuleIdSchema', () => {
  it('accepts the composite {dsId}-{groupName}-{ruleName} id with colons', () => {
    // Prometheus SLO rule groups/rules use the `slo:rec:` / `slo:alerts:`
    // naming convention, so the composite id legitimately contains colons.
    const id =
      '2a271264-7558-3709-af96-f192b0d88879-slo:alerts:frontend_proxy_service_availability_brea_b6bf9fd3-SLO_BurnRate_PageQuick_frontend_proxy_service_availability_brea_eec6e201';
    expect(alertingRuleIdSchema.validate(id)).toBe(id);
  });

  it('accepts the plain id shapes alertingIdSchema accepts', () => {
    expect(alertingRuleIdSchema.validate('mon-1')).toBe('mon-1');
    expect(alertingRuleIdSchema.validate('abc_DEF-123')).toBe('abc_DEF-123');
  });

  it('accepts degenerate colon placements (leading/trailing/standalone)', () => {
    // The relaxed charset allows `:` anywhere; harmless because the id is only
    // used for in-memory equality matching, never URL interpolation.
    expect(alertingRuleIdSchema.validate(':foo')).toBe(':foo');
    expect(alertingRuleIdSchema.validate('foo:')).toBe('foo:');
    expect(alertingRuleIdSchema.validate(':')).toBe(':');
  });

  it.each([
    ['empty string', ''],
    ['path traversal via slash', 'foo/bar'],
    ['path traversal via dotdot', '..'],
    ['path traversal via dotdot-slash', '../../etc/passwd'],
    ['percent-encoded slash', 'foo%2Fbar'],
    ['contains space', 'foo bar'],
    ['contains dot', 'foo.bar'],
    ['contains newline', 'foo\nbar'],
    ['contains null byte', 'foo\x00bar'],
  ])('still rejects %s (%s)', (_label, bad) => {
    expect(() => alertingRuleIdSchema.validate(bad)).toThrow();
  });

  it('rejects an id longer than 512 characters', () => {
    expect(() => alertingRuleIdSchema.validate('a'.repeat(513))).toThrow();
  });
});

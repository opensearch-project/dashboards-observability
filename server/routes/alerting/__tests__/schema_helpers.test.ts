/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  alertingIdSchema,
  alertingRuleIdSchema,
  prometheusLabelNameSchema,
} from '../schema_helpers';

describe('alertingIdSchema', () => {
  it('accepts common monitor / saved-object id shapes', () => {
    expect(alertingIdSchema.validate('mon-1')).toBe('mon-1');
    expect(alertingIdSchema.validate('abc_DEF-123')).toBe('abc_DEF-123');
    expect(alertingIdSchema.validate('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    );
  });

  it.each([
    ['empty string', ''],
    ['path traversal via slash', 'foo/bar'],
    ['path traversal via dotdot', '..'],
    ['path traversal via dotdot-slash', '../../etc/passwd'],
    ['percent-encoded slash', 'foo%2Fbar'],
    ['contains space', 'foo bar'],
    ['contains colon', 'ns:monitor'],
    ['contains dot', 'foo.bar'],
    ['contains null byte', 'foo\x00bar'],
    ['contains newline', 'foo\nbar'],
  ])('rejects %s (%s)', (_label, bad) => {
    expect(() => alertingIdSchema.validate(bad)).toThrow();
  });

  it('rejects an id longer than 512 characters', () => {
    const longId = 'a'.repeat(513);
    expect(() => alertingIdSchema.validate(longId)).toThrow();
  });

  it('accepts an id exactly at the 512-character boundary', () => {
    const maxId = 'a'.repeat(512);
    expect(alertingIdSchema.validate(maxId)).toBe(maxId);
  });
});

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

describe('prometheusLabelNameSchema', () => {
  it('accepts valid Prometheus label names', () => {
    expect(prometheusLabelNameSchema.validate('job')).toBe('job');
    expect(prometheusLabelNameSchema.validate('__name__')).toBe('__name__');
    expect(prometheusLabelNameSchema.validate('http_requests_total')).toBe('http_requests_total');
  });

  it.each([
    ['starts with digit', '1label'],
    ['contains slash', 'foo/bar'],
    ['empty', ''],
    ['contains dash', 'foo-bar'],
  ])('rejects %s (%s)', (_label, bad) => {
    expect(() => prometheusLabelNameSchema.validate(bad)).toThrow();
  });
});

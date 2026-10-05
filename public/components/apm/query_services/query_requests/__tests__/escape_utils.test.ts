/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { escapePromQLRegex, escapePromQLLabel, escapePPLString } from '../escape_utils';

describe('escape_utils', () => {
  describe('escapePromQLRegex', () => {
    it('leaves plain identifiers untouched', () => {
      expect(escapePromQLRegex('api-gateway')).toBe('api-gateway');
    });

    it('escapes regex metacharacters for the regex, then for the string literal', () => {
      // `\.` alone inside a PromQL string is a lexer error ("unknown escape sequence"), so the
      // regex escape's backslash is itself escaped: the literal holds `svc\\.a`, the regex `svc\.a`.
      expect(escapePromQLRegex('svc.a')).toBe('svc\\\\.a');
      expect(escapePromQLRegex('api.openai.com:443')).toBe('api\\\\.openai\\\\.com:443');
      expect(escapePromQLRegex('a|b')).toBe('a\\\\|b');
      expect(escapePromQLRegex('a+b*c?')).toBe('a\\\\+b\\\\*c\\\\?');
      expect(escapePromQLRegex('grp(a)[b]{c}')).toBe('grp\\\\(a\\\\)\\\\[b\\\\]\\\\{c\\\\}');
      expect(escapePromQLRegex('^a$')).toBe('\\\\^a\\\\$');
    });

    it('escapes quotes and backslashes', () => {
      expect(escapePromQLRegex('a"b')).toBe('a\\"b');
      // A literal backslash: `\\` in the regex, each half escaped again in the string literal.
      expect(escapePromQLRegex('a\\b')).toBe('a\\\\\\\\b');
    });

    it('neutralizes an injection attempt in a regex matcher', () => {
      // A crafted name must not be able to break out of the service=~"..." matcher.
      const escaped = escapePromQLRegex('x"} or up{');
      expect(escaped).toBe('x\\"\\\\} or up\\\\{');
      // Every quote is preceded by a backslash, so the string literal never closes early.
      expect(escaped).not.toMatch(/(^|[^\\])"/);
    });
  });

  describe('escapePromQLLabel', () => {
    it('escapes only quotes and backslashes, not regex metacharacters', () => {
      expect(escapePromQLLabel('svc.a')).toBe('svc.a');
      expect(escapePromQLLabel('a|b')).toBe('a|b');
      expect(escapePromQLLabel('a"b')).toBe('a\\"b');
      expect(escapePromQLLabel('a\\b')).toBe('a\\\\b');
    });
  });

  describe('escapePPLString', () => {
    it('escapes single quotes and backslashes for single-quoted literals', () => {
      expect(escapePPLString("a'b")).toBe("a\\'b");
      expect(escapePPLString('a\\b')).toBe('a\\\\b');
    });

    it('leaves double quotes untouched', () => {
      expect(escapePPLString('a"b')).toBe('a"b');
    });
  });
});

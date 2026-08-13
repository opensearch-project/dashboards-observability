/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Default redaction used before any upstream-derived text reaches the browser.
 *
 * Goal: scrub content that could leak deployment topology or identifiers —
 * URLs, hostnames, IPs, ARNs, long opaque IDs, and account-number-like token
 * runs — while preserving the human-actionable substance of a message
 * (e.g. "invalid PromQL: parse error"). This is best-effort defense-in-depth,
 * not a security boundary: verbatim upstream text is only ever exposed through
 * an explicit opt-in (a registered enricher or the server's default-off
 * `exposeSensitiveErrorDetail` flag). Everything shown by default goes through
 * here first.
 *
 * The rules are provider-neutral: they match generic network/identifier
 * shapes, never any specific vendor, product, host, or account.
 */

interface RedactionRule {
  pattern: RegExp;
  replacement: string;
}

// Order matters: URL/ARN rules run before bare host/IP rules so the
// surrounding structure is consumed as one unit.
const RULES: RedactionRule[] = [
  // Full URLs (http/https and generic scheme://).
  {
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)]+/gi,
    replacement: '<redacted-url>',
  },
  // ARN-style resource identifiers (generic "arn:...:..." shape).
  { pattern: /\barn:[^\s"'<>)]+/gi, replacement: '<redacted-arn>' },
  // UUIDs.
  {
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    replacement: '<redacted-id>',
  },
  // IPv4 with optional :port.
  {
    pattern: /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g,
    replacement: '<redacted-ip>',
  },
  // IPv6 (rough — 3+ hextet groups).
  {
    pattern: /\b(?:[0-9a-f]{1,4}:){3,}[0-9a-f]{1,4}\b/gi,
    replacement: '<redacted-ip>',
  },
  // FQDN-like hosts ending in a generic infra/TLD suffix, optional :port.
  {
    pattern:
      /\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|internal|local|svc|cluster|cloud|corp)\b(?::\d+)?/gi,
    replacement: '<redacted-host>',
  },
  // Single-label host WITH an explicit port (e.g. Kubernetes pod DNS
  // "alertmanager-0:9093"). The host must itself look network-ish — contain a
  // hyphen or digit — so ordinary prose like "at line:42" or "column:15" is
  // left intact. A single-label host that is a plain word (no hyphen/digit) and
  // has no dotted TLD still passes through — see the README ("best-effort").
  {
    pattern: /\b(?=[a-z0-9-]*[-0-9])[a-z][a-z0-9-]{1,}:\d{2,5}\b/gi,
    replacement: '<redacted-host>',
  },
  // Long hex blobs (hashes / tokens).
  { pattern: /\b[0-9a-f]{16,}\b/gi, replacement: '<redacted-id>' },
  // Account-number-like runs of digits.
  { pattern: /\b\d{10,}\b/g, replacement: '<redacted-id>' },
];

// Long mixed-alphanumeric tokens (bearer tokens, base64-ish secrets): require
// both a letter and a digit and a minimum length, so ordinary long words are
// left intact.
const TOKEN_PATTERN =
  /\b(?=[A-Za-z0-9+/_-]*[A-Za-z])(?=[A-Za-z0-9+/_-]*\d)[A-Za-z0-9+/_-]{24,}={0,2}\b/g;

/**
 * Scrub `text` of network/identifier content for safe display. Idempotent:
 * running it twice yields the same result. Returns '' for empty/undefined
 * input so callers can treat "nothing safe to show" uniformly.
 */
export function redactForDisplay(text: string | undefined | null): string {
  if (!text) return '';
  let out = String(text);
  for (const { pattern, replacement } of RULES) {
    out = out.replace(pattern, replacement);
  }
  out = out.replace(TOKEN_PATTERN, '<redacted-token>');
  return out.trim();
}

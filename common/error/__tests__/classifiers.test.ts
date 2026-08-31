/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Coverage tests for the default classifiers, one per observed failure shape.
 * Fixtures mirror the shapes captured on a live devstack, with all
 * provider-specific strings replaced by redacted placeholders.
 */

import { __resetDefaultsFlagForTests, registerDefaultClassifiers } from '../index';
import { __resetRegistryForTests, classifyError } from '../registry';
import { classifyRoutingStatus, classifyRuleHealthState } from '../classifiers/state';

beforeEach(() => {
  __resetRegistryForTests();
  __resetDefaultsFlagForTests();
  registerDefaultClassifiers();
});

describe('default classifiers — coverage table', () => {
  it('#1 ruler unreachable → UPSTREAM_UNAVAILABLE / RULE_BACKEND_UNAVAILABLE (retryable)', () => {
    const out = classifyError({
      operation: 'rule.create.metric',
      upstreamCode: 'RULER_UNREACHABLE',
      httpStatus: 503,
      message: 'Ruler RULER_UNREACHABLE (HTTP 503): <upstream body>',
    });
    expect(out.category).toBe('UPSTREAM_UNAVAILABLE');
    expect(out.code).toBe('RULE_BACKEND_UNAVAILABLE');
    expect(out.retryable).toBe(true);
    expect(out.title).toBe('Rule service unavailable');
  });

  it('#2 wrapped 503 hiding a 409 "already exists" → CONFLICT / RULE_GROUP_CONFLICT', () => {
    const out = classifyError({
      operation: 'slo.repair',
      upstreamCode: 'RULER_UNREACHABLE',
      httpStatus: 503,
      rawBody:
        'POST Rule Groups Namespace: error: 409 - { "message": "A namespace with name <namespace> already exists in this workspace." }',
    });
    // Must NOT trust the outer 503 — inner cause is a conflict.
    expect(out.category).toBe('CONFLICT');
    expect(out.code).toBe('RULE_GROUP_CONFLICT');
    expect(out.httpStatus).toBe(409);
    expect(out.retryable).toBe(false);
  });

  it('#3 abort/timeout → TIMEOUT / REQUEST_TIMEOUT (retryable)', () => {
    const out = classifyError({
      operation: 'alert.acknowledge',
      errorName: 'AbortError',
      message: 'Acknowledge request timed out after 30000ms',
    });
    expect(out.category).toBe('TIMEOUT');
    expect(out.code).toBe('REQUEST_TIMEOUT');
    expect(out.retryable).toBe(true);
  });

  it('#4 routing status "unknown" → PARTIAL_STATE / ROUTING_STATE_UNKNOWN', () => {
    const out = classifyRoutingStatus('unknown');
    expect(out).not.toBeNull();
    expect(out!.category).toBe('PARTIAL_STATE');
    expect(out!.code).toBe('ROUTING_STATE_UNKNOWN');
    // 'ready' is healthy — nothing to surface.
    expect(classifyRoutingStatus('ready')).toBeNull();
    // 'settling' is a valid transient state — also non-error.
    expect(classifyRoutingStatus('settling')).toBeNull();
  });

  it('#5 rule_health states map to shared language', () => {
    expect(classifyRuleHealthState('rules_missing')!.code).toBe('RULES_MISSING');
    expect(classifyRuleHealthState('rules_partial')!.code).toBe('RULES_PARTIAL');
    expect(classifyRuleHealthState('ruler_unreachable')!.code).toBe('RULE_HEALTH_UNAVAILABLE');
    expect(classifyRuleHealthState('rules_partial')!.category).toBe('PARTIAL_STATE');
    expect(classifyRuleHealthState('ruler_unreachable')!.retryable).toBe(true);
    // 'ok' surfaces nothing.
    expect(classifyRuleHealthState('ok')).toBeNull();
  });

  it('#6 invalid rule config → VALIDATION / RULE_CONFIG_INVALID with redacted safe detail', () => {
    const out = classifyError({
      operation: 'rule.create.metric',
      upstreamCode: 'RULER_VALIDATION_FAILED',
      httpStatus: 400,
      rawBody: 'invalid PromQL: parse error; source https://host.internal:9090/rules',
    });
    expect(out.category).toBe('VALIDATION');
    expect(out.code).toBe('RULE_CONFIG_INVALID');
    expect(out.retryable).toBe(false);
    const safe = out.details?.find((d) => d.sensitivity === 'safe');
    expect(safe?.value).toContain('invalid PromQL: parse error');
    expect(safe?.value).not.toContain('host.internal');
    expect(safe?.value).toContain('<redacted-url>');
  });

  it('#7 401 → AUTH_REQUIRED, 403 → PERMISSION_DENIED (both PERMISSION_DENIED, non-retryable)', () => {
    const unauthorized = classifyError({
      operation: 'rule.create.metric',
      upstreamCode: 'RULER_AUTH_FAILED',
      httpStatus: 401,
    });
    expect(unauthorized.category).toBe('PERMISSION_DENIED');
    expect(unauthorized.code).toBe('AUTH_REQUIRED');
    expect(unauthorized.retryable).toBe(false);

    const forbidden = classifyError({
      operation: 'rule.create.metric',
      upstreamCode: 'RULER_AUTH_FAILED',
      httpStatus: 403,
      rawBody:
        'no permissions for [cluster:admin/opensearch/directquery/write] and User [name=test] at https://host.internal:9090',
    });
    expect(forbidden.code).toBe('PERMISSION_DENIED');

    // 401 re-auth carries no raw upstream detail.
    expect(unauthorized.details).toBeUndefined();

    // 403 surfaces the missing permission (redacted) so the user can
    // self-diagnose, while topology (host/URL) is still scrubbed.
    const safe = forbidden.details?.find((d) => d.sensitivity === 'safe');
    expect(safe?.value).toContain(
      'no permissions for [cluster:admin/opensearch/directquery/write]'
    );
    expect(safe?.value).not.toContain('host.internal');
    expect(safe?.value).toContain('<redacted-url>');
  });

  it('UNKNOWN: unmatched error still surfaces a redacted message + keeps raw sensitive', () => {
    const out = classifyError({
      operation: 'slo.create',
      message: 'unexpected token in response from https://host.cloud/api at id 123456789012',
    });
    expect(out.category).toBe('UNKNOWN');
    expect(out.code).toBe('UNKNOWN_ERROR');
    const safe = out.details?.find((d) => d.sensitivity === 'safe');
    expect(safe?.value).toBe(
      'unexpected token in response from <redacted-url> at id <redacted-id>'
    );
    const sensitive = out.details?.find((d) => d.sensitivity === 'sensitive');
    expect(sensitive?.value).toContain('host.cloud');
  });
});

describe('classifier robustness', () => {
  it('timeoutClassifier does not hijack a 4xx that merely mentions "timeout"', () => {
    // A 400 whose upstream message happens to include the word "timeout" (e.g.
    // an OpenSearch parse error on a `timeout` field) must fall through to the
    // http-status classifier (VALIDATION) instead of being flagged retryable.
    const out = classifyError({
      operation: 'op',
      httpStatus: 400,
      message: 'parse_exception: unknown timeout field "search_timeout_ms"',
    });
    expect(out.category).toBe('VALIDATION');
    expect(out.retryable).toBe(false);
  });

  it('timeoutClassifier still catches 5xx timeouts and message-only cases', () => {
    // 504 status is a definitive timeout.
    expect(
      classifyError({ operation: 'op', httpStatus: 504, message: 'gateway timeout' }).category
    ).toBe('TIMEOUT');
    // Message-only (no status) still counts as a timeout (e.g. a client abort).
    expect(
      classifyError({ operation: 'op', errorName: 'AbortError', message: 'request timed out' })
        .category
    ).toBe('TIMEOUT');
  });

  it('upstreamWrapped treats a 4xx "already exists" as validation, not a conflict', () => {
    // A client error that merely uses "already exists" as a noun is a genuine
    // validation failure — leave it to the http-status classifier.
    const ambiguous = classifyError({
      operation: 'op',
      httpStatus: 400,
      rawBody: "'name' field already exists in the schema",
    });
    expect(ambiguous.category).toBe('VALIDATION');
  });

  it('upstreamWrapped catches a conflict masked by a 5xx even without a literal "409"', () => {
    // The upstream 409 is often not echoed as a number in the body. A 5xx
    // envelope carrying "already exists" is a masked conflict.
    const masked = classifyError({
      operation: 'slo.repair',
      httpStatus: 500,
      rawBody: 'namespace already exists in this workspace',
    });
    expect(masked.category).toBe('CONFLICT');
    expect(masked.code).toBe('RULE_GROUP_CONFLICT');
    expect(masked.httpStatus).toBe(409);
    expect(masked.retryable).toBe(false);
  });

  it('upstreamWrapped honors an explicit inner 409 marker regardless of outer status', () => {
    const wrapped = classifyError({
      operation: 'op',
      httpStatus: 503,
      rawBody: 'error: 409 - resource already exists',
    });
    expect(wrapped.category).toBe('CONFLICT');
    expect(wrapped.httpStatus).toBe(409);
  });
});

describe('generic http-status classifier', () => {
  it('maps standard statuses to the taxonomy', () => {
    expect(classifyError({ operation: 'op', httpStatus: 404 }).code).toBe('RESOURCE_NOT_FOUND');
    expect(classifyError({ operation: 'op', httpStatus: 409 }).code).toBe('RESOURCE_CONFLICT');
    expect(classifyError({ operation: 'op', httpStatus: 429 }).category).toBe('RATE_LIMITED');
    expect(classifyError({ operation: 'op', httpStatus: 412 }).category).toBe(
      'PRECONDITION_FAILED'
    );
    expect(classifyError({ operation: 'op', httpStatus: 502 }).category).toBe(
      'UPSTREAM_UNAVAILABLE'
    );
  });
});

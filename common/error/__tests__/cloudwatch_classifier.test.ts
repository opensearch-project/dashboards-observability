/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Coverage tests for the CloudWatch classifier, one per AWS failure shape:
 * credential-chain miss, invalid/expired tokens, IAM denial, throttling,
 * and unreachable regional endpoints (the "bad region" signal). Also pins
 * the scoping rules: transport shapes are only claimed for
 * `sourceType: 'cloudwatch'`, and non-AWS failures are left to other
 * classifiers.
 */

import { __resetDefaultsFlagForTests, registerDefaultClassifiers } from '../index';
import { __resetRegistryForTests, classifyError, toClientPayload } from '../registry';
import { CloudWatchErrorCode } from '../classifiers/cloudwatch';

beforeEach(() => {
  __resetRegistryForTests();
  __resetDefaultsFlagForTests();
  registerDefaultClassifiers();
});

describe('cloudWatchClassifier — coverage table', () => {
  it('credential chain miss (CredentialsProviderError) → PERMISSION_DENIED / CREDENTIALS_MISSING', () => {
    const out = classifyError({
      operation: 'unified.rules.fetch',
      sourceType: 'cloudwatch',
      errorName: 'CredentialsProviderError',
      message: 'Could not load credentials from any providers',
    });
    expect(out.category).toBe('PERMISSION_DENIED');
    expect(out.code).toBe(CloudWatchErrorCode.CREDENTIALS_MISSING);
    expect(out.retryable).toBe(false);
    expect(out.title).toBe('CloudWatch credentials missing');
    expect(out.remediation).toContain('AWS_ACCESS_KEY_ID');
  });

  it('typed CloudWatchCredentialsError wrapper also lands on CREDENTIALS_MISSING', () => {
    const out = classifyError({
      operation: 'cloudwatch.alarm.detail',
      sourceType: 'cloudwatch',
      errorName: 'CloudWatchCredentialsError',
      message: 'CloudWatch credentials not found.',
    });
    expect(out.code).toBe(CloudWatchErrorCode.CREDENTIALS_MISSING);
  });

  it('UnrecognizedClientException → PERMISSION_DENIED / AUTH_INVALID', () => {
    const out = classifyError({
      operation: 'unified.alerts.fetch',
      sourceType: 'cloudwatch',
      errorName: 'UnrecognizedClientException',
      message: 'The security token included in the request is invalid.',
    });
    expect(out.category).toBe('PERMISSION_DENIED');
    expect(out.code).toBe(CloudWatchErrorCode.AUTH_INVALID);
    expect(out.retryable).toBe(false);
  });

  it('ExpiredTokenException → PERMISSION_DENIED / AUTH_EXPIRED', () => {
    const out = classifyError({
      operation: 'unified.alerts.fetch',
      sourceType: 'cloudwatch',
      errorName: 'ExpiredTokenException',
      message: 'The security token included in the request is expired',
    });
    expect(out.category).toBe('PERMISSION_DENIED');
    expect(out.code).toBe(CloudWatchErrorCode.AUTH_EXPIRED);
    expect(out.title).toBe('AWS session expired');
  });

  it('AccessDeniedException → PERMISSION_DENIED / ACCESS_DENIED with IAM remediation', () => {
    const out = classifyError({
      operation: 'cloudwatch.alarm.history',
      sourceType: 'cloudwatch',
      errorName: 'AccessDeniedException',
      message:
        'User: arn:aws:iam::123456789012:user/x is not authorized to perform: cloudwatch:DescribeAlarmHistory',
    });
    expect(out.category).toBe('PERMISSION_DENIED');
    expect(out.code).toBe(CloudWatchErrorCode.ACCESS_DENIED);
    expect(out.remediation).toContain('cloudwatch:DescribeAlarms');
  });

  it('ThrottlingException → RATE_LIMITED / THROTTLED (retryable)', () => {
    const out = classifyError({
      operation: 'unified.rules.fetch',
      sourceType: 'cloudwatch',
      errorName: 'ThrottlingException',
      message: 'Rate exceeded',
    });
    expect(out.category).toBe('RATE_LIMITED');
    expect(out.code).toBe(CloudWatchErrorCode.THROTTLED);
    expect(out.retryable).toBe(true);
    expect(out.httpStatus).toBe(429);
  });

  it('DNS failure on a CloudWatch fetch → UPSTREAM_UNAVAILABLE / ENDPOINT_UNREACHABLE (retryable)', () => {
    const out = classifyError({
      operation: 'unified.rules.fetch',
      sourceType: 'cloudwatch',
      message: 'getaddrinfo ENOTFOUND monitoring.us-eest-1.amazonaws.com',
    });
    expect(out.category).toBe('UPSTREAM_UNAVAILABLE');
    expect(out.code).toBe(CloudWatchErrorCode.ENDPOINT_UNREACHABLE);
    expect(out.retryable).toBe(true);
  });

  it('does NOT claim transport failures from other providers', () => {
    const out = classifyError({
      operation: 'unified.rules.fetch',
      sourceType: 'prometheus',
      message: 'getaddrinfo ENOTFOUND prometheus.internal',
    });
    expect(out.code).not.toBe(CloudWatchErrorCode.ENDPOINT_UNREACHABLE);
  });

  it('AWS error names win even without a sourceType hint', () => {
    // Boundary code paths that predate the sourceType thread-through still
    // classify correctly when the SDK error name is unambiguous.
    const out = classifyError({
      operation: 'unified.alerts.fetch',
      errorName: 'UnrecognizedClientException',
      message: 'The security token included in the request is invalid.',
    });
    expect(out.code).toBe(CloudWatchErrorCode.AUTH_INVALID);
  });

  it('client payload keeps the safe redacted excerpt and strips the sensitive raw message', () => {
    const classified = classifyError({
      operation: 'unified.rules.fetch',
      sourceType: 'cloudwatch',
      errorName: 'AccessDeniedException',
      message: 'User: arn:aws:iam::123456789012:user/x is not authorized',
    });
    const payload = toClientPayload(classified, { exposeSensitive: false });
    expect(payload.details?.some((d) => d.sensitivity === 'sensitive')).toBeFalsy();
  });
});

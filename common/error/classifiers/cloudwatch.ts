/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Classifies AWS CloudWatch datasource failures — credential-chain misses,
 * invalid/expired STS tokens, IAM denials, throttling, and unreachable
 * regional endpoints — so a CloudWatch outage surfaces as a named failure
 * class with remediation instead of a raw SDK message.
 *
 * Matching is deliberately two-pronged:
 *   - AWS SDK error names (`UnrecognizedClientException`, `ExpiredTokenException`,
 *     …) are globally unambiguous, so they match regardless of `sourceType`.
 *   - Transport-level shapes (DNS failure on a mistyped region endpoint,
 *     connection refused) are only claimed when the boundary tagged the
 *     context with `sourceType: 'cloudwatch'` — the same shapes from an
 *     OpenSearch or Prometheus fetch belong to other classifiers.
 *
 * Wording is inlined (not added to the shared catalog) per the extension
 * model: the catalog stays provider-neutral, and provider-specific phrasing
 * rides on the classifier itself.
 */

import type {
  ClassifierResult,
  ErrorClassifier,
  MessageDescriptor,
  RawErrorContext,
} from '../types';
import { rawDetails } from './util';

const ID_PREFIX = 'observability.error.cloudwatch';

/** Stable machine codes for CloudWatch failure classes. */
export const CloudWatchErrorCode = {
  CREDENTIALS_MISSING: 'CLOUDWATCH_CREDENTIALS_MISSING',
  AUTH_INVALID: 'CLOUDWATCH_AUTH_INVALID',
  AUTH_EXPIRED: 'CLOUDWATCH_AUTH_EXPIRED',
  ACCESS_DENIED: 'CLOUDWATCH_ACCESS_DENIED',
  THROTTLED: 'CLOUDWATCH_THROTTLED',
  ENDPOINT_UNREACHABLE: 'CLOUDWATCH_ENDPOINT_UNREACHABLE',
} as const;

function msg(code: string, key: string, defaultMessage: string): MessageDescriptor {
  return { id: `${ID_PREFIX}.${code}.${key}`, defaultMessage };
}

function messages(
  code: string,
  title: string,
  message: string,
  remediation: string
): ClassifierResult['messages'] {
  return {
    title: msg(code, 'title', title),
    message: msg(code, 'message', message),
    remediation: msg(code, 'remediation', remediation),
  };
}

// --- error-name sets (AWS SDK v3 `Error.name` values) ----------------------

/** Credential chain produced nothing (or our typed wrapper for it). */
const CREDENTIALS_MISSING_NAMES = new Set([
  'CredentialsProviderError',
  'CloudWatchCredentialsError',
]);

/** Credentials present but rejected as malformed / unknown / bad signature. */
const AUTH_INVALID_NAMES = new Set([
  'UnrecognizedClientException',
  'InvalidClientTokenId',
  'SignatureDoesNotMatch',
  'IncompleteSignature',
]);

/** Credentials were valid once, but the session/token has expired. */
const AUTH_EXPIRED_NAMES = new Set([
  'ExpiredToken',
  'ExpiredTokenException',
  'RequestExpired',
  'TokenRefreshRequired',
]);

/** Authenticated but not authorized for the API (IAM policy). */
const ACCESS_DENIED_NAMES = new Set([
  'AccessDenied',
  'AccessDeniedException',
  'AuthorizationErrorException',
  'UnauthorizedOperation',
]);

/** API rate limiting. */
const THROTTLED_NAMES = new Set([
  'Throttling',
  'ThrottlingException',
  'TooManyRequestsException',
  'RequestLimitExceeded',
  'LimitExceededException',
]);

/**
 * Transport failures. A mistyped/nonexistent region manifests as a DNS
 * failure on `monitoring.<region>.amazonaws.com`, so ENOTFOUND is the
 * canonical "bad region" signal. Claimed only for `sourceType: 'cloudwatch'`.
 */
const TRANSPORT_ERROR_NAMES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET']);
const TRANSPORT_MESSAGE_RE = /getaddrinfo|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET/;

function isCloudWatchSource(ctx: RawErrorContext): boolean {
  return ctx.sourceType === 'cloudwatch';
}

function isTransportFailure(ctx: RawErrorContext): boolean {
  if (ctx.errorName && TRANSPORT_ERROR_NAMES.has(ctx.errorName)) return true;
  return typeof ctx.message === 'string' && TRANSPORT_MESSAGE_RE.test(ctx.message);
}

function isCredentialsMissing(ctx: RawErrorContext): boolean {
  if (ctx.errorName && CREDENTIALS_MISSING_NAMES.has(ctx.errorName)) return true;
  return (
    isCloudWatchSource(ctx) &&
    typeof ctx.message === 'string' &&
    /could not load credentials/i.test(ctx.message)
  );
}

export const cloudWatchClassifier: ErrorClassifier = {
  name: 'core.cloudwatch',
  priority: 90,
  match: (ctx: RawErrorContext): boolean => {
    if (ctx.errorName) {
      if (
        CREDENTIALS_MISSING_NAMES.has(ctx.errorName) ||
        AUTH_INVALID_NAMES.has(ctx.errorName) ||
        AUTH_EXPIRED_NAMES.has(ctx.errorName) ||
        ACCESS_DENIED_NAMES.has(ctx.errorName) ||
        THROTTLED_NAMES.has(ctx.errorName)
      ) {
        return true;
      }
    }
    if (isCredentialsMissing(ctx)) return true;
    // Transport shapes are ambiguous across providers — only claim them when
    // the boundary tagged this failure as CloudWatch-sourced.
    return isCloudWatchSource(ctx) && isTransportFailure(ctx);
  },
  classify: (ctx: RawErrorContext): ClassifierResult => {
    const details = rawDetails(ctx.message);
    const name = ctx.errorName || '';

    if (isCredentialsMissing(ctx)) {
      return {
        category: 'PERMISSION_DENIED',
        code: CloudWatchErrorCode.CREDENTIALS_MISSING,
        retryable: false,
        httpStatus: 403,
        details,
        messages: messages(
          CloudWatchErrorCode.CREDENTIALS_MISSING,
          'CloudWatch credentials missing',
          'No AWS credentials were found, so CloudWatch could not be queried.',
          'Launch the server with AWS credentials (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN) or attach an IAM role, then retry.'
        ),
      };
    }
    if (AUTH_EXPIRED_NAMES.has(name)) {
      return {
        category: 'PERMISSION_DENIED',
        code: CloudWatchErrorCode.AUTH_EXPIRED,
        retryable: false,
        httpStatus: 403,
        details,
        messages: messages(
          CloudWatchErrorCode.AUTH_EXPIRED,
          'AWS session expired',
          'The AWS credentials have expired, so CloudWatch rejected the request.',
          'Refresh the AWS session (new temporary credentials or role re-assumption), then retry.'
        ),
      };
    }
    if (AUTH_INVALID_NAMES.has(name)) {
      return {
        category: 'PERMISSION_DENIED',
        code: CloudWatchErrorCode.AUTH_INVALID,
        retryable: false,
        httpStatus: 403,
        details,
        messages: messages(
          CloudWatchErrorCode.AUTH_INVALID,
          'AWS credentials rejected',
          'CloudWatch did not recognize the AWS credentials the server presented.',
          'Verify the access key, secret key, and session token are current and belong to the intended account, then retry.'
        ),
      };
    }
    if (ACCESS_DENIED_NAMES.has(name)) {
      return {
        category: 'PERMISSION_DENIED',
        code: CloudWatchErrorCode.ACCESS_DENIED,
        retryable: false,
        httpStatus: 403,
        details,
        messages: messages(
          CloudWatchErrorCode.ACCESS_DENIED,
          'CloudWatch access denied',
          'The AWS credentials are valid but not authorized for the CloudWatch API that was called.',
          'Grant the server role cloudwatch:DescribeAlarms (and related read permissions), then retry.'
        ),
      };
    }
    if (THROTTLED_NAMES.has(name)) {
      return {
        category: 'RATE_LIMITED',
        code: CloudWatchErrorCode.THROTTLED,
        retryable: true,
        httpStatus: 429,
        details,
        messages: messages(
          CloudWatchErrorCode.THROTTLED,
          'CloudWatch is throttling requests',
          'The CloudWatch API rate limit was hit, so the request was rejected.',
          'Wait a moment and retry.'
        ),
      };
    }
    // Remaining match: transport failure on a CloudWatch fetch.
    return {
      category: 'UPSTREAM_UNAVAILABLE',
      code: CloudWatchErrorCode.ENDPOINT_UNREACHABLE,
      retryable: true,
      httpStatus: 502,
      details,
      messages: messages(
        CloudWatchErrorCode.ENDPOINT_UNREACHABLE,
        'CloudWatch endpoint unreachable',
        'The CloudWatch regional endpoint could not be reached. The configured region may be invalid, or there may be a network problem.',
        'Check the configured AWS region and the server network path to AWS, then retry.'
      ),
    };
  },
};

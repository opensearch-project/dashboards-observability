/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Stable error codes and their provider-neutral wording.
 *
 * The catalog is the single source of user-facing text for the default
 * classifiers. Wording here is deliberately generic — no vendor, product,
 * host, or endpoint names. A downstream fork adds environment-specific
 * phrasing by registering classifiers that inline their own `messages`, never
 * by editing this file.
 *
 * Each code maps to a `title` (short), `message` (plain-language cause), and
 * optional `remediation` (what to do next), as `MessageDescriptor`s so
 * adapters can localize them. Dynamic specifics (counts, redacted excerpts)
 * ride in `details`, not interpolated here, so every message localizes from
 * its `code` alone.
 */

import type { ErrorCategory, MessageDescriptor } from './types';

/** Stable machine codes. Values are intentionally provider-neutral. */
export const ErrorCode = {
  RULE_BACKEND_UNAVAILABLE: 'RULE_BACKEND_UNAVAILABLE',
  RULE_GROUP_CONFLICT: 'RULE_GROUP_CONFLICT',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  RULE_CONFIG_INVALID: 'RULE_CONFIG_INVALID',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  ROUTING_STATE_UNKNOWN: 'ROUTING_STATE_UNKNOWN',
  RULES_MISSING: 'RULES_MISSING',
  RULES_PARTIAL: 'RULES_PARTIAL',
  RULE_HEALTH_UNAVAILABLE: 'RULE_HEALTH_UNAVAILABLE',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  PRECONDITION_FAILED: 'PRECONDITION_FAILED',
  UPSTREAM_UNAVAILABLE: 'UPSTREAM_UNAVAILABLE',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface CatalogEntry {
  category: ErrorCategory;
  title: MessageDescriptor;
  message: MessageDescriptor;
  remediation?: MessageDescriptor;
}

const ID_PREFIX = 'observability.error';

function entry(
  code: string,
  category: ErrorCategory,
  title: string,
  message: string,
  remediation?: string
): CatalogEntry {
  return {
    category,
    title: { id: `${ID_PREFIX}.${code}.title`, defaultMessage: title },
    message: { id: `${ID_PREFIX}.${code}.message`, defaultMessage: message },
    remediation: remediation
      ? { id: `${ID_PREFIX}.${code}.remediation`, defaultMessage: remediation }
      : undefined,
  };
}

/** Code → wording. Consumed by `classifyError`; keyed by stable code. */
export const MESSAGE_CATALOG: Record<string, CatalogEntry> = {
  [ErrorCode.RULE_BACKEND_UNAVAILABLE]: entry(
    ErrorCode.RULE_BACKEND_UNAVAILABLE,
    'UPSTREAM_UNAVAILABLE',
    'Rule service unavailable',
    'The rule backend could not be reached, so the request did not complete.',
    'Retry shortly; if it persists, check that the rule backend is healthy.'
  ),
  [ErrorCode.RULE_GROUP_CONFLICT]: entry(
    ErrorCode.RULE_GROUP_CONFLICT,
    'CONFLICT',
    'Rule group already exists',
    'A rule group with this name already exists.',
    'Open the existing rule group, or choose a different name and retry.'
  ),
  [ErrorCode.RESOURCE_CONFLICT]: entry(
    ErrorCode.RESOURCE_CONFLICT,
    'CONFLICT',
    'Conflict',
    'The request conflicts with the current state of the resource.',
    'Reload the latest state and retry.'
  ),
  [ErrorCode.RULE_CONFIG_INVALID]: entry(
    ErrorCode.RULE_CONFIG_INVALID,
    'VALIDATION',
    'Alert rule is invalid',
    'The alert rule was rejected because its configuration is invalid.',
    'Correct the highlighted fields (for example, the query expression) and resubmit.'
  ),
  [ErrorCode.REQUEST_TIMEOUT]: entry(
    ErrorCode.REQUEST_TIMEOUT,
    'TIMEOUT',
    'Request timed out',
    'The request did not complete in the allowed time.',
    'Retry; the operation may already have taken effect.'
  ),
  [ErrorCode.ROUTING_STATE_UNKNOWN]: entry(
    ErrorCode.ROUTING_STATE_UNKNOWN,
    'PARTIAL_STATE',
    'Routing status unavailable',
    'The routing backend responded but did not report a usable status.',
    'Verify that routing is configured and reachable, then refresh.'
  ),
  [ErrorCode.RULES_MISSING]: entry(
    ErrorCode.RULES_MISSING,
    'PARTIAL_STATE',
    'Rule groups missing',
    'One or more expected rule groups are missing from the rule backend.',
    'Use Restore to recreate the missing rule groups.'
  ),
  [ErrorCode.RULES_PARTIAL]: entry(
    ErrorCode.RULES_PARTIAL,
    'PARTIAL_STATE',
    'Rule groups incomplete',
    'Some of the expected rule groups are present and some are missing.',
    'Use Restore to recreate the missing rule groups.'
  ),
  [ErrorCode.RULE_HEALTH_UNAVAILABLE]: entry(
    ErrorCode.RULE_HEALTH_UNAVAILABLE,
    'UPSTREAM_UNAVAILABLE',
    'Rule health unavailable',
    'Rule health could not be determined because the rule backend was unreachable.',
    'Retry once the rule backend is reachable.'
  ),
  [ErrorCode.AUTH_REQUIRED]: entry(
    ErrorCode.AUTH_REQUIRED,
    'PERMISSION_DENIED',
    'Authentication required',
    'The request was not authenticated with the backend.',
    'Sign in again or refresh your session, then retry.'
  ),
  [ErrorCode.PERMISSION_DENIED]: entry(
    ErrorCode.PERMISSION_DENIED,
    'PERMISSION_DENIED',
    'Permission denied',
    "You don't have permission to perform this action on the backend.",
    'Ask an administrator to grant the required access, then retry.'
  ),
  [ErrorCode.RESOURCE_NOT_FOUND]: entry(
    ErrorCode.RESOURCE_NOT_FOUND,
    'NOT_FOUND',
    'Not found',
    'The requested resource could not be found.',
    'Refresh and confirm the resource still exists.'
  ),
  [ErrorCode.RATE_LIMITED]: entry(
    ErrorCode.RATE_LIMITED,
    'RATE_LIMITED',
    'Too many requests',
    'The backend is rate-limiting requests.',
    'Wait a moment and retry.'
  ),
  [ErrorCode.PRECONDITION_FAILED]: entry(
    ErrorCode.PRECONDITION_FAILED,
    'PRECONDITION_FAILED',
    'Precondition failed',
    'The resource changed since it was last loaded.',
    'Reload the latest version and reapply your change.'
  ),
  [ErrorCode.UPSTREAM_UNAVAILABLE]: entry(
    ErrorCode.UPSTREAM_UNAVAILABLE,
    'UPSTREAM_UNAVAILABLE',
    'Service unavailable',
    'A backend service could not be reached, so the request did not complete.',
    'Retry shortly; if it persists, check the backend service health.'
  ),
  [ErrorCode.VALIDATION_FAILED]: entry(
    ErrorCode.VALIDATION_FAILED,
    'VALIDATION',
    'Invalid request',
    'The request was rejected because it is invalid.',
    'Correct the highlighted fields and resubmit.'
  ),
  [ErrorCode.UNKNOWN_ERROR]: entry(
    ErrorCode.UNKNOWN_ERROR,
    'UNKNOWN',
    'Something went wrong',
    'An unexpected error occurred while completing the request.',
    'Retry; if it persists, share the correlation id with an administrator.'
  ),
};

/** Fallback wording per category when a code isn't in the catalog. */
export function fallbackEntry(category: ErrorCategory): CatalogEntry {
  const byCategory = Object.values(MESSAGE_CATALOG).find((e) => e.category === category);
  return byCategory ?? MESSAGE_CATALOG[ErrorCode.UNKNOWN_ERROR];
}

/** Stable detail keys used by default classifiers. */
export const DetailKey = {
  RAW: 'rawDetail',
  REDACTED: 'redactedDetail',
  RULE_GROUP_COUNTS: 'ruleGroupCounts',
  UPSTREAM_STATUS: 'upstreamStatus',
} as const;

/** Localizable labels for the default detail keys. */
export const DETAIL_LABELS: Record<string, MessageDescriptor> = {
  [DetailKey.RAW]: {
    id: `${ID_PREFIX}.detail.raw`,
    defaultMessage: 'Raw error details',
  },
  [DetailKey.REDACTED]: {
    id: `${ID_PREFIX}.detail.redacted`,
    defaultMessage: 'Details',
  },
  [DetailKey.RULE_GROUP_COUNTS]: {
    id: `${ID_PREFIX}.detail.ruleGroupCounts`,
    defaultMessage: 'Rule groups',
  },
  [DetailKey.UPSTREAM_STATUS]: {
    id: `${ID_PREFIX}.detail.upstreamStatus`,
    defaultMessage: 'Reported status',
  },
};

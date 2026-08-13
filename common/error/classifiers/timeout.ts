/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Classifies client- or server-side timeouts. Matches an aborted request
 * (`AbortController` → `AbortError`), an HTTP 408, or a "timed out" message,
 * so both the acknowledge abort path and upstream request-timeouts land in the
 * TIMEOUT category consistently.
 */

import { ErrorCode } from '../messages';
import type { ErrorClassifier, RawErrorContext } from '../types';

function looksLikeTimeout(ctx: RawErrorContext): boolean {
  // Explicit signals: an aborted / timed-out request, or a timeout status.
  if (ctx.errorName === 'AbortError' || ctx.errorName === 'TimeoutError') return true;
  if (ctx.httpStatus === 408 || ctx.httpStatus === 504) return true;
  // Message-based match is only trusted when it can't be a more specific 4xx:
  // a client-error response (e.g. an upstream parse error naming a "timeout"
  // field) that merely contains the word is a validation failure, not a
  // timeout, and retrying it would fail identically. Defer those to
  // httpStatusClassifier by requiring no client-error status here.
  const messageMatch = typeof ctx.message === 'string' && /timed out|timeout/i.test(ctx.message);
  if (!messageMatch) return false;
  return ctx.httpStatus === undefined || ctx.httpStatus >= 500;
}

export const timeoutClassifier: ErrorClassifier = {
  name: 'core.timeout',
  priority: 60,
  match: looksLikeTimeout,
  classify: (ctx) => ({
    category: 'TIMEOUT',
    code: ErrorCode.REQUEST_TIMEOUT,
    retryable: true,
    httpStatus: ctx.httpStatus,
  }),
};

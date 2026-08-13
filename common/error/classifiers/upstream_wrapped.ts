/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Highest-priority classifier: inspect the *inner* upstream cause rather than
 * trusting the outer status. Upstream layers routinely wrap a specific failure
 * (e.g. a 409 "already exists" conflict) inside a generic 5xx envelope. When
 * the raw body / message reveals a more specific cause, we classify on that.
 *
 * Kept deliberately conservative — it only overrides when the inner signal is
 * unambiguous, so it never mis-promotes a generic 5xx into a conflict.
 */

import { ErrorCode } from '../messages';
import type { ErrorClassifier, RawErrorContext } from '../types';
import { rawDetails, stringifyRaw } from './util';

function haystack(ctx: RawErrorContext): string {
  return `${stringifyRaw(ctx.rawBody)}\n${ctx.message ?? ''}`;
}

/** A conflict wrapped inside another (usually 5xx) status envelope. */
function hasInnerConflict(ctx: RawErrorContext): boolean {
  const text = haystack(ctx);
  // Explicit inner 409 markers in the body are conclusive on their own (a
  // wrapped conflict whose envelope echoes the real status).
  if (/\bHTTP 409\b/i.test(text) || /\b409\b\s*-/.test(text)) return true;
  // "already exists" on its own is ambiguous — a validation message can use it
  // as a noun ("'name' field already exists in the schema"). Treat it as a
  // conflict only when the outer status is a 409 (the real conflict — claim it
  // here for the rule-group-specific wording) or a 5xx/unknown envelope masking
  // one. A plain 4xx that merely mentions "already exists" is a genuine
  // validation error and is left to the http-status classifier; a bare 409 with
  // no such body also falls through to the generic RESOURCE_CONFLICT there.
  if (!/already exists/i.test(text)) return false;
  return ctx.httpStatus === undefined || ctx.httpStatus === 409 || ctx.httpStatus >= 500;
}

export const upstreamWrappedClassifier: ErrorClassifier = {
  name: 'core.upstreamWrapped',
  priority: 100,
  match: (ctx) => hasInnerConflict(ctx),
  classify: (ctx) => ({
    category: 'CONFLICT',
    code: ErrorCode.RULE_GROUP_CONFLICT,
    retryable: false,
    // Normalize to the true inner status — the outer 5xx was misleading.
    httpStatus: 409,
    details: rawDetails(ctx.rawBody),
  }),
};

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Classifies provider-neutral ruler dual-write failures, keyed off the stable
 * `upstreamCode` (RULER_*) captured at the transport boundary rather than off
 * message text. This is what turns the create-rule / SLO-write generic 500
 * into a specific, actionable category.
 */

import { ErrorCode } from '../messages';
import type { ClassifierResult, ErrorClassifier } from '../types';
import { rawDetails } from './util';

export const rulerClassifier: ErrorClassifier = {
  name: 'core.ruler',
  priority: 80,
  match: (ctx) => typeof ctx.upstreamCode === 'string' && ctx.upstreamCode.startsWith('RULER_'),
  classify: (ctx): ClassifierResult => {
    switch (ctx.upstreamCode) {
      case 'RULER_VALIDATION_FAILED':
        // The upstream diagnostic is genuinely actionable — attach it (redacted
        // safe excerpt + sensitive raw) so the form can self-serve.
        return {
          category: 'VALIDATION',
          code: ErrorCode.RULE_CONFIG_INVALID,
          retryable: false,
          httpStatus: ctx.httpStatus,
          details: rawDetails(ctx.rawBody),
        };
      case 'RULER_AUTH_FAILED':
        // No raw details for auth failures — upstream auth errors can echo
        // tokens/headers. Split 401 (re-auth) from 403 (lacks permission).
        return ctx.httpStatus === 401
          ? {
              category: 'PERMISSION_DENIED',
              code: ErrorCode.AUTH_REQUIRED,
              retryable: false,
              httpStatus: ctx.httpStatus,
            }
          : {
              category: 'PERMISSION_DENIED',
              code: ErrorCode.PERMISSION_DENIED,
              retryable: false,
              httpStatus: ctx.httpStatus,
            };
      case 'RULER_UNREACHABLE':
      default:
        return {
          category: 'UPSTREAM_UNAVAILABLE',
          code: ErrorCode.RULE_BACKEND_UNAVAILABLE,
          retryable: true,
          httpStatus: ctx.httpStatus,
        };
    }
  },
};

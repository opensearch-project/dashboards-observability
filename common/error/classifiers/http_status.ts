/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generic HTTP-status classifier — the broad fallback for any error that
 * carries a status but wasn't matched by a more specific classifier. Maps the
 * standard status families onto the taxonomy.
 */

import { ErrorCode } from '../messages';
import type { ClassifierResult, ErrorClassifier } from '../types';
import { rawDetails } from './util';

export const httpStatusClassifier: ErrorClassifier = {
  name: 'core.httpStatus',
  priority: 40,
  match: (ctx) => typeof ctx.httpStatus === 'number' && ctx.httpStatus >= 400,
  classify: (ctx): ClassifierResult => {
    const status = ctx.httpStatus as number;
    switch (status) {
      case 401:
        return {
          category: 'PERMISSION_DENIED',
          code: ErrorCode.AUTH_REQUIRED,
          retryable: false,
          httpStatus: status,
        };
      case 403:
        return {
          category: 'PERMISSION_DENIED',
          code: ErrorCode.PERMISSION_DENIED,
          retryable: false,
          httpStatus: status,
        };
      case 404:
        return {
          category: 'NOT_FOUND',
          code: ErrorCode.RESOURCE_NOT_FOUND,
          retryable: false,
          httpStatus: status,
        };
      case 408:
        return {
          category: 'TIMEOUT',
          code: ErrorCode.REQUEST_TIMEOUT,
          retryable: true,
          httpStatus: status,
        };
      case 409:
        return {
          category: 'CONFLICT',
          code: ErrorCode.RESOURCE_CONFLICT,
          retryable: false,
          httpStatus: status,
        };
      case 412:
        return {
          category: 'PRECONDITION_FAILED',
          code: ErrorCode.PRECONDITION_FAILED,
          retryable: false,
          httpStatus: status,
        };
      case 429:
        return {
          category: 'RATE_LIMITED',
          code: ErrorCode.RATE_LIMITED,
          retryable: true,
          httpStatus: status,
        };
      default:
        if (status >= 500) {
          return {
            category: 'UPSTREAM_UNAVAILABLE',
            code: ErrorCode.UPSTREAM_UNAVAILABLE,
            retryable: true,
            httpStatus: status,
          };
        }
        // Any other 4xx — treat as a validation-style rejection and surface the
        // (redacted) upstream detail so the user can correct the request.
        return {
          category: 'VALIDATION',
          code: ErrorCode.VALIDATION_FAILED,
          retryable: false,
          httpStatus: status,
          details: rawDetails(ctx.rawBody),
        };
    }
  },
};

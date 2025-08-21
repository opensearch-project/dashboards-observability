/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { coreRefs } from '../../../../public/framework/core_refs';

export const handleError = (error: any) => {
  let parsedError: any = {};
  let errorMessage = '';

  const safeJsonParse = (input: string) => {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  };

  if (typeof error?.response === 'string') {
    parsedError = safeJsonParse(error.response) || {};
  } else if (typeof error?.body === 'string') {
    parsedError = safeJsonParse(error.body) || {};
  } else {
    parsedError = error?.body || error;
    if (typeof parsedError.message === 'string') {
      const nested = safeJsonParse(parsedError.message);
      if (nested?.error) {
        parsedError = nested;
      }
    }
  }

  let statusCode = 500;

  if (error?.statusCode && typeof error.statusCode === 'number') {
    statusCode = error.statusCode;
  } else if (error?.status && typeof error.status === 'number') {
    statusCode = error.status;
  } else if (parsedError?.statusCode && typeof parsedError.statusCode === 'number') {
    statusCode = parsedError.statusCode;
  } else if (parsedError?.status && typeof parsedError.status === 'number') {
    statusCode = parsedError.status;
  } else if (error?.body?.status && typeof error.body.status === 'number') {
    statusCode = error.body.status;
  }

  const errorType = parsedError?.error?.caused_by?.type || parsedError?.error?.type || '';
  const errorReason =
    error?.message ||
    parsedError?.error?.caused_by?.reason ||
    parsedError?.error?.reason ||
    error?.reason ||
    parsedError?.message ||
    'Unknown error occurred';

  // Set specific error messages based on type/status
  if (errorType === 'too_many_buckets_exception') {
    errorMessage =
      'Too many buckets in aggregation. Try using a shorter time range or increase the "search.max_buckets" cluster setting.';
  } else if (statusCode === 429) {
    errorMessage = 'Too many requests. The system is currently overloaded, please try again later.';
  } else if (statusCode === 503) {
    errorMessage =
      'Service temporarily unavailable. The system might be under maintenance or overloaded.';
  } else if (statusCode === 504) {
    errorMessage = 'Request timed out. The operation took too long to complete.';
  } else {
    errorMessage = errorReason;
  }

  coreRefs.core?.notifications.toasts.addDanger({
    title: `Error ${statusCode}`,
    text: errorMessage,
    toastLifeTimeMs: 10000,
  });

  console.error('[Trace Analytics Error]:', { error, parsedError, statusCode, errorMessage });
};

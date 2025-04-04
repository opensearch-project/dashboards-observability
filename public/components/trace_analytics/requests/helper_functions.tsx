/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { coreRefs } from '../../../../public/framework/core_refs';

export const handleError = (error: any) => {
  let parsedError: any = {};

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

  const errorType = parsedError?.error?.caused_by?.type || parsedError?.error?.type || '';
  const errorReason = parsedError?.error?.caused_by?.reason || parsedError?.error?.reason || '';

  if (errorType === 'too_many_buckets_exception') {
    coreRefs.core?.notifications.toasts.addDanger({
      title: 'Too many buckets in aggregation',
      text:
        errorReason ||
        'Try using a shorter time range or increase the "search.max_buckets" cluster setting.',
      toastLifeTimeMs: 10000,
    });
  } else {
    console.error(error);
  }
};

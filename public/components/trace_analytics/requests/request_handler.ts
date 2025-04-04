/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { coreRefs } from '../../../../public/framework/core_refs';
import { CoreStart } from '../../../../../../src/core/public';
import {
  TRACE_ANALYTICS_DATA_PREPPER_INDICES_ROUTE,
  TRACE_ANALYTICS_DSL_ROUTE,
  TRACE_ANALYTICS_JAEGER_INDICES_ROUTE,
} from '../../../../common/constants/trace_analytics';
import { TraceAnalyticsMode } from '../../../../common/types/trace_analytics';
import { getSpanIndices } from '../components/common/helper_functions';

export async function handleDslRequest(
  http: CoreStart['http'],
  DSL: any,
  bodyQuery: any,
  mode: TraceAnalyticsMode,
  dataSourceMDSId?: string,
  setShowTimeoutToast?: () => void
) {
  if (DSL?.query) {
    bodyQuery.query.bool.must.push(...DSL.query.bool.must);
    bodyQuery.query.bool.filter.push(...DSL.query.bool.filter);
    bodyQuery.query.bool.should.push(...DSL.query.bool.should);
    bodyQuery.query.bool.must_not.push(...DSL.query.bool.must_not);
    if (DSL.query.bool.minimum_should_match)
      bodyQuery.query.bool.minimum_should_match = DSL.query.bool.minimum_should_match;
  }
  let body = bodyQuery;
  if (!bodyQuery.index) {
    body = { ...bodyQuery, index: getSpanIndices(mode) };
  }
  const query = {
    dataSourceMDSId,
  };

  const handleError = (error: any) => {
    let parsedError = {};

    try {
      if (typeof error?.response === 'string') {
        parsedError = JSON.parse(error.response);
      } else if (typeof error?.body === 'string') {
        parsedError = JSON.parse(error.body);
      } else {
        parsedError = error?.body || error;

        // Check if message is a JSON string
        if (typeof parsedError.message === 'string') {
          try {
            const innerParsed = JSON.parse(parsedError.message);
            if (innerParsed?.error) {
              parsedError = innerParsed;
            }
          } catch {
            // not JSON, skip
          }
        }
      }
    } catch (e) {
      console.warn('Failed to parse error response as JSON', e);
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

  if (setShowTimeoutToast) {
    const id = setTimeout(() => setShowTimeoutToast(), 25000); // 25 seconds

    try {
      return await http.post(TRACE_ANALYTICS_DSL_ROUTE, {
        body: JSON.stringify(body),
        query,
      });
    } catch (error) {
      handleError(error);
    } finally {
      clearTimeout(id);
    }
  } else {
    try {
      return await http.post(TRACE_ANALYTICS_DSL_ROUTE, {
        body: JSON.stringify(body),
        query,
      });
    } catch (error) {
      handleError(error);
    }
  }
  return undefined;
}

export async function handleJaegerIndicesExistRequest(
  http: CoreStart['http'],
  setJaegerIndicesExist,
  dataSourceMDSId?: string
) {
  const query = {
    dataSourceMDSId,
  };
  http
    .post(TRACE_ANALYTICS_JAEGER_INDICES_ROUTE, {
      query,
    })
    .then((exists) => setJaegerIndicesExist(exists))
    .catch(() => setJaegerIndicesExist(false));
}

export async function handleDataPrepperIndicesExistRequest(
  http: CoreStart['http'],
  setDataPrepperIndicesExist,
  dataSourceMDSId?: string
) {
  const query = {
    dataSourceMDSId,
  };
  http
    .post(TRACE_ANALYTICS_DATA_PREPPER_INDICES_ROUTE, {
      query,
    })
    .then((exists) => setDataPrepperIndicesExist(exists))
    .catch(() => setDataPrepperIndicesExist(false));
}

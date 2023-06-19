/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreStart } from '../../../../../../src/core/public';
import {
  TRACE_ANALYTICS_DSL_ROUTE,
  TRACE_ANALYTICS_DATA_PREPPER_INDICES_ROUTE,
  TRACE_ANALYTICS_JAEGER_INDICES_ROUTE,
  JAEGER_INDEX_NAME,
  DATA_PREPPER_INDEX_NAME,
  TRACE_ANALYTICS_CUSTOM_INDEX_PATTERNS_ROUTE,
} from '../../../../common/constants/trace_analytics';
import { TraceAnalyticsMode } from '../home';

export async function handleDslRequest(
  http: CoreStart['http'],
  DSL: any,
  bodyQuery: any,
  mode: TraceAnalyticsMode,
  customIndexPattern: string,
  timeout?: boolean,
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
    switch (mode) {
      case 'jaeger':
        body = { ...bodyQuery, index: JAEGER_INDEX_NAME };
      case 'data_prepper':
        body = { ...bodyQuery, index: DATA_PREPPER_INDEX_NAME };
      case 'custom':
        body = { ...bodyQuery, index: customIndexPattern };
    }
  }
  if (timeout) {
    const id = setTimeout(() => setShowTimeoutToast!(), 30000);

    try {
      return await http.post(TRACE_ANALYTICS_DSL_ROUTE, {
        body: JSON.stringify(body),
      });
    } catch (error) {
      console.error(error);
    } finally {
      clearTimeout(id);
    }
  }

  try {
    return await http.post(TRACE_ANALYTICS_DSL_ROUTE, {
      body: JSON.stringify(body),
    });
  } catch (error_1) {
    console.error(error_1);
  }
}

export async function handleJaegerIndicesExistRequest(
  http: CoreStart['http'],
  setJaegerIndicesExist
) {
  http
    .post(TRACE_ANALYTICS_JAEGER_INDICES_ROUTE)
    .then((exists) => setJaegerIndicesExist(exists))
    .catch(() => setJaegerIndicesExist(false));
}

export async function handleDataPrepperIndicesExistRequest(
  http: CoreStart['http'],
  setDataPrepperIndicesExist
) {
  http
    .post(TRACE_ANALYTICS_DATA_PREPPER_INDICES_ROUTE)
    .then((exists) => setDataPrepperIndicesExist(exists))
    .catch(() => setDataPrepperIndicesExist(false));
}

export async function handleCustomIndexPatternExistsRequest(
  http: CoreStart['http'],
  setCustomIndexPatternExists,
  customIndexPattern,
) {
  http
    .post(TRACE_ANALYTICS_CUSTOM_INDEX_PATTERNS_ROUTE, {
      body: JSON.stringify({indexPattern: customIndexPattern}),
    })
    .then((exists) => setCustomIndexPatternExists(exists))
    .catch(() => setCustomIndexPatternExists(false));
}

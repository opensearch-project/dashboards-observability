/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreStart } from '../../../../../../src/core/public';
import {
  DATA_PREPPER_INDEX_NAME,
  JAEGER_INDEX_NAME,
  TRACE_ANALYTICS_DATA_PREPPER_INDICES_ROUTE,
  TRACE_ANALYTICS_DSL_ROUTE,
  TRACE_ANALYTICS_JAEGER_INDICES_ROUTE,
} from '../../../../common/constants/trace_analytics';
import { TraceAnalyticsMode } from '../home';

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
    body = { ...bodyQuery, index: mode === 'jaeger' ? JAEGER_INDEX_NAME : DATA_PREPPER_INDEX_NAME };
  }
  const query = {
    dataSourceMDSId: dataSourceMDSId,
  };
  if (setShowTimeoutToast) {
    const id = setTimeout(() => setShowTimeoutToast(), 25000); // 25 seconds

    try {
      return await http.post(TRACE_ANALYTICS_DSL_ROUTE, {
        body: JSON.stringify(body),
        query,
      });
    } catch (error) {
      console.error(error);
    } finally {
      clearTimeout(id);
    }
  } else {
    try {
      return await http.post(TRACE_ANALYTICS_DSL_ROUTE, {
        body: JSON.stringify(body),
        query,
      });
    } catch (error_1) {
      console.error(error_1);
    }
  }
}

export async function handleJaegerIndicesExistRequest(
  http: CoreStart['http'],
  setJaegerIndicesExist,
  dataSourceMDSId?: string
) {
  const query = {
    dataSourceMDSId: dataSourceMDSId,
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
    dataSourceMDSId: dataSourceMDSId,
  };
  http
    .post(TRACE_ANALYTICS_DATA_PREPPER_INDICES_ROUTE, {
      query,
    })
    .then((exists) => setDataPrepperIndicesExist(exists))
    .catch(() => setDataPrepperIndicesExist(false));
}

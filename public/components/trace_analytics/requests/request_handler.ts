/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getTenantIndexName } from '../../../../common/utils/tenant_index_name';
import { CoreStart } from '../../../../../../src/core/public';
import {
  TRACE_ANALYTICS_DSL_ROUTE,
  TRACE_ANALYTICS_DATA_PREPPER_INDICES_ROUTE,
  TRACE_ANALYTICS_JAEGER_INDICES_ROUTE,
  JAEGER_INDEX_NAME,
  DATA_PREPPER_INDEX_NAME,
} from '../../../../common/constants/trace_analytics';
import { TraceAnalyticsMode } from '../home';

export async function handleDslRequest(
  http: CoreStart['http'],
  DSL: any,
  bodyQuery: any,
  mode: TraceAnalyticsMode,
  setShowTimeoutToast?: () => void,
  tenant?: string
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
    body = {
      ...bodyQuery,
      index: getTenantIndexName(
        mode === 'jaeger' ? JAEGER_INDEX_NAME : DATA_PREPPER_INDEX_NAME,
        tenant
      ),
    };
  }
  if (setShowTimeoutToast) {
    const id = setTimeout(() => setShowTimeoutToast(), 25000); // 25 seconds

    try {
      return await http.post(TRACE_ANALYTICS_DSL_ROUTE, {
        body: JSON.stringify(body),
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
      });
    } catch (error_1) {
      console.error(error_1);
    }
  }
}

export async function handleJaegerIndicesExistRequest(
  http: CoreStart['http'],
  setJaegerIndicesExist,
  tenant?: string
) {
  http
    .post(TRACE_ANALYTICS_JAEGER_INDICES_ROUTE, {
      body: JSON.stringify({
        tenant,
      }),
    })
    .then((exists) => setJaegerIndicesExist(exists))
    .catch(() => setJaegerIndicesExist(false));
}

export async function handleDataPrepperIndicesExistRequest(
  http: CoreStart['http'],
  setDataPrepperIndicesExist,
  tenant?: string
) {
  http
    .post(TRACE_ANALYTICS_DATA_PREPPER_INDICES_ROUTE, {
      body: JSON.stringify({
        tenant,
      }),
    })
    .then((exists) => setDataPrepperIndicesExist(exists))
    .catch(() => setDataPrepperIndicesExist(false));
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RequestParams } from '@opensearch-project/opensearch';
import { schema } from '@osd/config-schema';
import { IRouter } from '../../../../src/core/server';
import {
  DATA_PREPPER_INDEX_NAME,
  DATA_PREPPER_SERVICE_INDEX_NAME,
  JAEGER_INDEX_NAME,
  JAEGER_SERVICE_INDEX_NAME,
  TRACE_ANALYTICS_DATA_PREPPER_INDICES_ROUTE,
  TRACE_ANALYTICS_DSL_ROUTE,
  TRACE_ANALYTICS_JAEGER_INDICES_ROUTE,
} from '../../common/constants/trace_analytics';
import { addRequestToMetric } from '../common/metrics/metrics_helper';

export function registerTraceAnalyticsDslRouter(router: IRouter, dataSourceEnabled: boolean) {
  router.post(
    {
      path: TRACE_ANALYTICS_DATA_PREPPER_INDICES_ROUTE,
      validate: {
        body: schema.any(),
        query: schema.object({
          dataSourceMDSId: schema.maybe(schema.string({ defaultValue: '' })),
        }),
      },
    },
    async (context, request, response) => {
      const params: RequestParams.IndicesExists = {
        index: [DATA_PREPPER_INDEX_NAME, DATA_PREPPER_SERVICE_INDEX_NAME],
        allow_no_indices: false,
      };
      const { dataSourceMDSId } = request.query;
      try {
        let resp;
        if (dataSourceEnabled && dataSourceMDSId) {
          const client = context.dataSource.opensearch.legacy.getClient(dataSourceMDSId);
          resp = await client.callAPI('indices.exists', params);
        } else {
          resp = await context.core.opensearch.legacy.client.callAsCurrentUser(
            'indices.exists',
            params
          );
        }
        return response.ok({
          body: resp,
        });
      } catch (error) {
        console.error(error);
        return response.custom({
          statusCode: error.statusCode || 400,
          body: error.message,
        });
      }
    }
  );
  router.post(
    {
      path: TRACE_ANALYTICS_JAEGER_INDICES_ROUTE,
      validate: {
        body: schema.any(),
        query: schema.object({
          dataSourceMDSId: schema.maybe(schema.string({ defaultValue: '' })),
        }),
      },
    },
    async (context, request, response) => {
      const { dataSourceMDSId } = request.query;
      const params: RequestParams.IndicesExists = {
        index: [JAEGER_INDEX_NAME, JAEGER_SERVICE_INDEX_NAME],
        allow_no_indices: false,
      };
      try {
        let resp;
        if (dataSourceEnabled && dataSourceMDSId) {
          const client = context.dataSource.opensearch.legacy.getClient(dataSourceMDSId);
          resp = await client.callAPI('indices.exists', params);
        } else {
          resp = await context.core.opensearch.legacy.client.callAsCurrentUser(
            'indices.exists',
            params
          );
        }
        return response.ok({
          body: resp,
        });
      } catch (error) {
        console.error(error);
        return response.custom({
          statusCode: error.statusCode || 400,
          body: error.message,
        });
      }
    }
  );
  router.post(
    {
      path: TRACE_ANALYTICS_DSL_ROUTE,
      validate: {
        body: schema.object({
          index: schema.maybe(schema.string()),
          from: schema.maybe(schema.number()),
          size: schema.number(),
          query: schema.maybe(
            schema.object({
              bool: schema.object({
                filter: schema.maybe(schema.arrayOf(schema.object({}, { unknowns: 'allow' }))),
                must: schema.maybe(schema.arrayOf(schema.object({}, { unknowns: 'allow' }))),
                should: schema.maybe(schema.arrayOf(schema.object({}, { unknowns: 'allow' }))),
                must_not: schema.maybe(schema.arrayOf(schema.object({}, { unknowns: 'allow' }))),
                minimum_should_match: schema.maybe(schema.number()),
                adjust_pure_negative: schema.maybe(schema.boolean()),
                boost: schema.maybe(schema.any()),
              }),
            })
          ),
          aggs: schema.maybe(schema.any()),
          aggregations: schema.maybe(schema.any()),
          sort: schema.maybe(schema.arrayOf(schema.any())),
          _source: schema.maybe(
            schema.object({
              includes: schema.arrayOf(schema.string()),
            })
          ),
          script_fields: schema.maybe(schema.any()),
          track_total_hits: schema.maybe(schema.boolean()),
        }),
        query: schema.object({
          dataSourceMDSId: schema.maybe(schema.string({ defaultValue: '' })),
        }),
      },
    },
    async (context, request, response) => {
      addRequestToMetric('trace_analytics', 'get', 'count');
      const { index, size, ...rest } = request.body;
      const { dataSourceMDSId } = request.query;
      const params: RequestParams.Search = {
        index: index || DATA_PREPPER_INDEX_NAME,
        size,
        body: rest,
      };
      try {
        let resp;
        if (dataSourceEnabled && dataSourceMDSId) {
          const client = context.dataSource.opensearch.legacy.getClient(dataSourceMDSId);
          resp = await client.callAPI('search', params);
        } else {
          resp = await context.core.opensearch.legacy.client.callAsCurrentUser('search', params);
        }
        return response.ok({
          body: resp,
        });
      } catch (error) {
        addRequestToMetric('trace_analytics', 'get', error);
        if (error.statusCode !== 404) console.error(error);
        return response.custom({
          statusCode: error.statusCode || 400,
          body: error.response,
        });
      }
    }
  );
}

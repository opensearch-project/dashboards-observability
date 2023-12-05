/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ResponseError } from '@opensearch-project/opensearch/lib/errors';
import { schema } from '@osd/config-schema';
import { RequestParams } from '@opensearch-project/opensearch';
import {
  ILegacyScopedClusterClient,
  IOpenSearchDashboardsResponse,
  IRouter,
} from '../../../../../src/core/server';
import { OBSERVABILITY_BASE } from '../../../common/constants/shared';
import { addClickToMetric, getMetrics } from '../../common/metrics/metrics_helper';
import {
  DOCUMENT_NAMES_QUERY,
  FETCH_SAMPLE_DOCUMENT_QUERY,
} from '../../../common/constants/metrics';
import { MetricsAnalyticsAdaptor } from '../../adaptors/metrics/metrics_analytics_adaptor';

export function registerMetricsRoute(router: IRouter) {
  const metricsAnalyticsBackend = new MetricsAnalyticsAdaptor();

  router.get(
    {
      path: `${OBSERVABILITY_BASE}/stats`,
      validate: false,
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      try {
        const metrics = getMetrics();
        console.log(metrics);
        return response.ok({
          body: metrics,
        });
      } catch (error) {
        console.error(error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );

  router.post(
    {
      path: `${OBSERVABILITY_BASE}/stats`,
      validate: {
        body: schema.object({
          element: schema.string(),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      try {
        const { element } = request.body;
        addClickToMetric(element);
        return response.ok();
      } catch (error) {
        console.error(error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );

  router.get(
    {
      path: `${OBSERVABILITY_BASE}/search/indices`,
      validate: {},
    },
    async (context, request, response) => {
      const indexPattern = 'ss4o_metrics-*-*';
      const params = {
        format: 'json',
        index: indexPattern,
      };
      try {
        const resp = await context.core.opensearch.legacy.client.callAsCurrentUser(
          'cat.indices',
          params
        );
        return response.ok({
          body: resp,
        });
      } catch (error) {
        if (error.statusCode !== 404) console.error(error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );

  router.get(
    {
      path: `${OBSERVABILITY_BASE}/metrics/otel/documents`,
      validate: {},
    },
    async (context, request, response) => {
      const indexPattern = 'ss4o_metrics-*-*';
      const params: RequestParams.Search = {
        index: indexPattern,
        body: DOCUMENT_NAMES_QUERY,
      };
      try {
        const resp = await context.core.opensearch.legacy.client.callAsCurrentUser(
          'search',
          params
        );
        return response.ok({
          body: resp,
        });
      } catch (error) {
        if (error.statusCode !== 404) console.error(error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );

  // router.get(
  //   {
  //     path: `${OBSERVABILITY_BASE}/metrics/otel/sampleDocument`,
  //     validate: {},
  //   },
  //   async (context, request, response) => {
  //     const indexPattern = 'ss4o_metrics-*-*';
  //     const { index, size, FETCH_SAMPLE_DOCUMENT_QUERY, ...rest } = request.body;
  //     // const opensearchNotebooksClient: ILegacyScopedClusterClient = context.core.opensearch.legacy.client.callAsCurrentUser(
  //     //   request
  //     // );
  //     // console.log('Constructed query 1:', rest);
  //     console.log('request.body 1:', request.body);
  //     // console.log('index 1:', index);
  //     const params: RequestParams.Search = {
  //       index: indexPattern,
  //       body: rest,
  //       size: 1,
  //     };
  //     console.log('params 1:', params);
  //     console.log('params 1:', params.body);
  //     try {
  //       const resp = await context.core.opensearch.legacy.client.callAsCurrentUser(
  //         'search',
  //         params
  //       );
  //       return response.ok({
  //         body: resp.hits,
  //       });
  //     } catch (error) {
  //       if (error.statusCode !== 404) console.error(error);
  //       return response.custom({
  //         statusCode: error.statusCode || 500,
  //         body: error.message,
  //       });
  //     }
  //   }
  // );

  router.post(
    {
      path: `${OBSERVABILITY_BASE}/metrics/otel/sampleDocument`,
      validate: {
        body: schema.object({
          documentName: schema.string(),
          index: schema.string(),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      const opensearchNotebooksClient: ILegacyScopedClusterClient = context.observability_plugin.observabilityClient.asScoped(
        request
      );
      console.log('comes here');
      try {
        // console.log('index:', request.body.index);
        const resp = await metricsAnalyticsBackend.queryToFetchSampleDocument(
          opensearchNotebooksClient,
          request.body.documentName,
          request.body.index
        );
        console.log('resp: ', resp);
        return response.ok({
          body: resp.hits,
        });
      } catch (error) {
        if (error.statusCode !== 404) console.error(error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );

  router.post(
    {
      path: `${OBSERVABILITY_BASE}/metrics/otel/aggregatedBinCount`,
      validate: {
        body: schema.object({
          min: schema.string(),
          max: schema.string(),
          startTime: schema.string(),
          endTime: schema.string(),
          documentName: schema.string(),
          index: schema.string(),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      // console.log('index beofre:', request.body.index);
      const opensearchNotebooksClient: ILegacyScopedClusterClient = context.observability_plugin.observabilityClient.asScoped(
        request
      );
      console.log('comes here');
      try {
        // console.log('index:', request.body.index);
        const resp = await metricsAnalyticsBackend.queryToFetchBinCount(
          opensearchNotebooksClient,
          request.body.min,
          request.body.max,
          request.body.startTime,
          request.body.endTime,
          request.body.documentName,
          request.body.index
        );
        console.log('resp: ', resp);
        return response.ok({
          body: resp,
        });
      } catch (error) {
        if (error.statusCode !== 404) console.error(error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );
}

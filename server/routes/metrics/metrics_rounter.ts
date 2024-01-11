/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ResponseError } from '@opensearch-project/opensearch/lib/errors';
import { schema } from '@osd/config-schema';
import {
  ILegacyScopedClusterClient,
  IOpenSearchDashboardsResponse,
  IRouter,
} from '../../../../../src/core/server';
import { OBSERVABILITY_BASE } from '../../../common/constants/shared';
import { addClickToMetric, getMetrics } from '../../common/metrics/metrics_helper';
import { MetricsAnalyticsAdaptor } from '../../adaptors/metrics/metrics_analytics_adaptor';
import { DATA_PREPPER_INDEX_NAME } from '../../../common/constants/metrics';

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
      const params = {
        format: 'json',
        index: DATA_PREPPER_INDEX_NAME,
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
      path: `${OBSERVABILITY_BASE}/metrics/otel/{index}/documentNames`,
      validate: {
        params: schema.object({
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

      try {
        const resp = await metricsAnalyticsBackend.queryToFetchDocumentNames(
          opensearchNotebooksClient,
          request.params.index
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
      path: `${OBSERVABILITY_BASE}/metrics/otel/{index}/{histogramSampleDocument}`,
      validate: {
        params: schema.object({
          histogramSampleDocument: schema.string(),
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

      try {
        const resp = await metricsAnalyticsBackend.queryToFetchSampleDocument(
          opensearchNotebooksClient,
          request.params.histogramSampleDocument,
          request.params.index
        );
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
      const opensearchNotebooksClient: ILegacyScopedClusterClient = context.observability_plugin.observabilityClient.asScoped(
        request
      );

      try {
        const resp = await metricsAnalyticsBackend.queryToFetchBinCount(
          opensearchNotebooksClient,
          request.body.min,
          request.body.max,
          request.body.startTime,
          request.body.endTime,
          request.body.documentName,
          request.body.index
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
}

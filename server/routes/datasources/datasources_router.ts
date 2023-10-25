/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from '@osd/config-schema';
import { IRouter } from '../../../../../src/core/server';
import { JOBS_BASE, OBSERVABILITY_BASE } from '../../../common/constants/shared';

export function registerDatasourcesRoute(router: IRouter) {
  router.post(
    {
      path: `${OBSERVABILITY_BASE}${JOBS_BASE}`,
      validate: {
        body: schema.object({
          query: schema.string(),
          lang: schema.string(),
          datasource: schema.string(),
          sessionId: schema.maybe(schema.string()),
        }),
      },
    },
    async (context, request, response): Promise<any> => {
      const params = {
        body: {
          ...request.body,
        },
      };
      try {
        const res = await context.observability_plugin.observabilityClient
          .asScoped(request)
          .callAsCurrentUser('observability.runDirectQuery', params);
        return response.ok({
          body: res,
        });
      } catch (error: any) {
        console.error('Error in running direct query:', error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );

  router.get(
    {
      path: `${OBSERVABILITY_BASE}${JOBS_BASE}/{queryId}`,
      validate: {
        params: schema.object({
          queryId: schema.string(),
        }),
      },
    },
    async (context, request, response): Promise<any> => {
      try {
        const res = await context.observability_plugin.observabilityClient
          .asScoped(request)
          .callAsCurrentUser('observability.getJobStatus', {
            queryId: request.params.queryId,
          });
        return response.ok({
          body: res,
        });
      } catch (error: any) {
        console.error('Error in fetching job status:', error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );

  router.delete(
    {
      path: `${OBSERVABILITY_BASE}${JOBS_BASE}/{queryId}`,
      validate: {
        params: schema.object({
          queryId: schema.string(),
        }),
      },
    },
    async (context, request, response): Promise<any> => {
      try {
        const res = await context.observability_plugin.observabilityClient
          .asScoped(request)
          .callAsCurrentUser('observability.deleteJob', {
            queryId: request.params.queryId,
          });
        return response.ok({
          body: res,
        });
      } catch (error: any) {
        console.error('Error in deleting job:', error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );
}

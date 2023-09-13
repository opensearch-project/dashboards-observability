/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from '@osd/config-schema';
import { IRouter } from '../../../../../src/core/server';
import { DATASOURCES_BASE, JOBS_BASE, OBSERVABILITY_BASE } from '../../../common/constants/shared';

export function registerDatasourcesRoute(router: IRouter) {
  router.get(
    {
      path: `${DATASOURCES_BASE}/{name}`,
      validate: {
        params: schema.object({
          name: schema.string(),
        }),
      },
    },
    async (context, request, response): Promise<any> => {
      try {
        const dataSourcesresponse = await context.observability_plugin.observabilityClient
          .asScoped(request)
          .callAsCurrentUser('ppl.getDatasourceById', {
            datasource: request.params.name,
          });
        return response.ok({
          body: dataSourcesresponse,
        });
      } catch (error: any) {
        console.error('Issue in fetching datasource:', error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );

  router.get(
    {
      path: `${DATASOURCES_BASE}`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      try {
        const dataSourcesresponse = await context.observability_plugin.observabilityClient
          .asScoped(request)
          .callAsCurrentUser('ppl.getDatasources');
        return response.ok({
          body: dataSourcesresponse,
        });
      } catch (error: any) {
        console.error('Issue in fetching datasources:', error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );

  router.post(
    {
      path: `${OBSERVABILITY_BASE}${JOBS_BASE}`,
      validate: {
        query: schema.string,
        datasource: schema.string,
        lang: schema.string,
      },
    },
    async (context, request, response): Promise<any> => {
      try {
        const res = await context.observability_plugin.observabilityClient
          .asScoped(request)
          .callAsCurrentUser('observability.runDirectQuery');
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
      path: `${OBSERVABILITY_BASE}${JOBS_BASE}/{jobId}`,
      validate: {
        params: schema.object({
          jobId: schema.string(),
        }),
      },
    },
    async (context, request, response): Promise<any> => {
      try {
        const res = await context.observability_plugin.observabilityClient
          .asScoped(request)
          .callAsCurrentUser('observability.getJobStatus', {
            jobId: request.params.jobId,
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
}

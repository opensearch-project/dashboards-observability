/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from '@osd/config-schema';
import { IRouter } from '../../../../../src/core/server';
import {
  DATACONNECTIONS_BASE,
  JOBS_BASE,
  OBSERVABILITY_BASE,
} from '../../../common/constants/shared';

export function registerDataConnectionsRoute(router: IRouter) {
  router.get(
    {
      path: `${DATACONNECTIONS_BASE}/{name}`,
      validate: {
        params: schema.object({
          name: schema.string(),
        }),
      },
    },
    async (context, request, response): Promise<any> => {
      try {
        const dataConnectionsresponse = await context.observability_plugin.observabilityClient
          .asScoped(request)
          .callAsCurrentUser('ppl.getDataConnectionById', {
            dataconnection: request.params.name,
          });
        return response.ok({
          body: dataConnectionsresponse,
        });
      } catch (error: any) {
        console.error('Issue in fetching data connection:', error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );

  router.delete(
    {
      path: `${DATACONNECTIONS_BASE}/{name}`,
      validate: {
        params: schema.object({
          name: schema.string(),
        }),
      },
    },
    async (context, request, response): Promise<any> => {
      try {
        const dataConnectionsresponse = await context.observability_plugin.observabilityClient
          .asScoped(request)
          .callAsCurrentUser('ppl.deleteDataConnection', {
            dataconnection: request.params.name,
          });
        return response.ok({
          body: dataConnectionsresponse,
        });
      } catch (error: any) {
        console.error('Issue in deleting data connection:', error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );

  router.put(
    {
      path: `${DATACONNECTIONS_BASE}`,
      validate: {
        body: schema.object({
          name: schema.string(),
          connector: schema.string(),
          allowedRoles: schema.arrayOf(schema.string()),
          properties: schema.any(),
        }),
      },
    },
    async (context, request, response): Promise<any> => {
      try {
        const dataConnectionsresponse = await context.observability_plugin.observabilityClient
          .asScoped(request)
          .callAsCurrentUser('ppl.modifyDataConnection', {
            body: {
              name: request.body.name,
              connector: request.body.connector,
              allowedRoles: request.body.allowedRoles,
              properties: request.body.properties,
            },
          });
        return response.ok({
          body: dataConnectionsresponse,
        });
      } catch (error: any) {
        console.error('Issue in modifying data connection:', error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );

  router.get(
    {
      path: `${DATACONNECTIONS_BASE}`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      try {
        const dataConnectionsresponse = await context.observability_plugin.observabilityClient
          .asScoped(request)
          .callAsCurrentUser('ppl.getDataConnections');
        return response.ok({
          body: dataConnectionsresponse,
        });
      } catch (error: any) {
        console.error('Issue in fetching data connections:', error);
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
        body: schema.object({
          query: schema.string(),
          kind: schema.string(),
        }),
      },
    },
    async (context, request, response): Promise<any> => {
      console.log('request: ', request);
      const params = {
        body: {
          ...request.body,
        },
      };
      console.log('params: ', params);
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
}

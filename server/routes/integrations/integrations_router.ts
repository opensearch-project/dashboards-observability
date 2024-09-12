/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from '@osd/config-schema';
import * as mime from 'mime';
import sanitize from 'sanitize-filename';
import { IRouter } from '../../../../../src/core/server';
import {
  OpenSearchDashboardsResponse,
  OpenSearchDashboardsResponseFactory,
} from '../../../../../src/core/server/http/router';
import { INTEGRATIONS_BASE } from '../../../common/constants/shared';
import { IntegrationsManager } from '../../adaptors/integrations/integrations_manager';

/**
 * Handle an `OpenSearchDashboardsRequest` using the provided `callback` function.
 * This is a convenience method that handles common error handling and response formatting.
 * The callback must accept a `IntegrationsManager` as its first argument.
 *
 * If the callback throws an error,
 * the `OpenSearchDashboardsResponse` will be formatted using the error's `statusCode` and `message` properties.
 * Otherwise, the callback's return value will be formatted in a JSON object under the `data` field.
 *
 * @param {IntegrationsManager} manager The integration manager instance to use for making requests.
 * @param {OpenSearchDashboardsResponseFactory} response The factory to use for creating responses.
 * @callback callback A callback that will invoke a request on a provided adaptor.
 * @returns {Promise<OpenSearchDashboardsResponse>} An `OpenSearchDashboardsResponse` with the return data from the callback.
 */
export const handleWithCallback = async <T>(
  manager: IntegrationsManager,
  response: OpenSearchDashboardsResponseFactory,
  callback: (a: IntegrationsManager) => Promise<T>
): Promise<OpenSearchDashboardsResponse<{ data: T } | string>> => {
  try {
    const data = await callback(manager);
    return response.ok({
      body: {
        data,
      },
    }) as OpenSearchDashboardsResponse<{ data: T }>;
  } catch (err) {
    console.error(`handleWithCallback: callback failed with error "${err.message}"`);
    return response.custom({
      statusCode: err.statusCode || 500,
      body: err.message,
    });
  }
};

export function registerIntegrationsRoute(router: IRouter) {
  router.get(
    {
      path: `${INTEGRATIONS_BASE}/repository`,
      validate: false,
    },
    async (context, request, response): Promise<OpenSearchDashboardsResponse> => {
      const adaptor = new IntegrationsManager(context.core.savedObjects.client);
      return handleWithCallback(adaptor, response, async (a: IntegrationsManager) =>
        a.getIntegrationTemplates()
      );
    }
  );

  router.post(
    {
      path: `${INTEGRATIONS_BASE}/store/{templateName}`,
      validate: {
        params: schema.object({
          templateName: schema.string(),
        }),
        body: schema.object({
          dataSourceMDSId: schema.maybe(schema.string({ defaultValue: '' })),
          dataSourceMDSLabel: schema.maybe(schema.string({ defaultValue: '' })),
          name: schema.string(),
          indexPattern: schema.string(),
          workflows: schema.maybe(schema.arrayOf(schema.string())),
          dataSource: schema.maybe(schema.string()),
          tableName: schema.maybe(schema.string()),
        }),
      },
    },
    async (context, request, response): Promise<OpenSearchDashboardsResponse> => {
      const adaptor = new IntegrationsManager(context.core.savedObjects.client);
      return handleWithCallback(adaptor, response, async (a: IntegrationsManager) => {
        return a.loadIntegrationInstance(
          request.params.templateName,
          request.body.name,
          request.body.indexPattern,
          request.body.dataSourceMDSId,
          request.body.dataSourceMDSLabel,
          request.body.workflows,
          request.body.dataSource,
          request.body.tableName
        );
      });
    }
  );

  router.get(
    {
      path: `${INTEGRATIONS_BASE}/repository/{name}`,
      validate: {
        params: schema.object({
          name: schema.string(),
        }),
      },
    },
    async (context, request, response): Promise<OpenSearchDashboardsResponse> => {
      const adaptor = new IntegrationsManager(context.core.savedObjects.client);
      return handleWithCallback(
        adaptor,
        response,
        async (a: IntegrationsManager) =>
          (
            await a.getIntegrationTemplates({
              name: request.params.name,
            })
          ).hits[0]
      );
    }
  );

  router.get(
    {
      path: `${INTEGRATIONS_BASE}/repository/{id}/static/{path}`,
      validate: {
        params: schema.object({
          id: schema.string(),
          path: schema.string(),
        }),
      },
    },
    async (context, request, response): Promise<OpenSearchDashboardsResponse> => {
      const adaptor = new IntegrationsManager(context.core.savedObjects.client);
      try {
        const requestPath = sanitize(request.params.path);
        const result = await adaptor.getStatic(request.params.id, requestPath);
        return response.ok({
          headers: {
            'Content-Type': mime.getType(request.params.path),
          },
          body: result,
        });
      } catch (err) {
        return response.custom({
          statusCode: err.statusCode ? err.statusCode : 500,
          body: err.message,
        });
      }
    }
  );

  router.get(
    {
      path: `${INTEGRATIONS_BASE}/repository/{id}/schema`,
      validate: {
        params: schema.object({
          id: schema.string(),
        }),
      },
    },
    async (context, request, response): Promise<OpenSearchDashboardsResponse> => {
      const adaptor = new IntegrationsManager(context.core.savedObjects.client);
      return handleWithCallback(adaptor, response, async (a: IntegrationsManager) =>
        a.getSchemas(request.params.id)
      );
    }
  );

  router.get(
    {
      path: `${INTEGRATIONS_BASE}/repository/{id}/assets`,
      validate: {
        params: schema.object({
          id: schema.string(),
        }),
      },
    },
    async (context, request, response): Promise<OpenSearchDashboardsResponse> => {
      const adaptor = new IntegrationsManager(context.core.savedObjects.client);
      return handleWithCallback(adaptor, response, async (a: IntegrationsManager) =>
        a.getAssets(request.params.id)
      );
    }
  );

  router.get(
    {
      path: `${INTEGRATIONS_BASE}/repository/{id}/data`,
      validate: {
        params: schema.object({
          id: schema.string(),
        }),
      },
    },
    async (context, request, response): Promise<OpenSearchDashboardsResponse> => {
      const adaptor = new IntegrationsManager(context.core.savedObjects.client);
      return handleWithCallback(adaptor, response, async (a: IntegrationsManager) =>
        a.getSampleData(request.params.id)
      );
    }
  );

  router.get(
    {
      path: `${INTEGRATIONS_BASE}/store`,
      validate: false,
    },
    async (context, request, response): Promise<OpenSearchDashboardsResponse> => {
      const adaptor = new IntegrationsManager(context.core.savedObjects.client);
      return handleWithCallback(adaptor, response, async (a: IntegrationsManager) =>
        a.getIntegrationInstances({})
      );
    }
  );

  router.delete(
    {
      path: `${INTEGRATIONS_BASE}/store/{id}`,
      validate: {
        params: schema.object({
          id: schema.string(),
        }),
      },
    },
    async (context, request, response): Promise<OpenSearchDashboardsResponse> => {
      const adaptor = new IntegrationsManager(context.core.savedObjects.client);
      return handleWithCallback(adaptor, response, async (a: IntegrationsManager) =>
        a.deleteIntegrationInstance(request.params.id)
      );
    }
  );

  router.get(
    {
      path: `${INTEGRATIONS_BASE}/store/{id}`,
      validate: {
        params: schema.object({
          id: schema.string(),
        }),
      },
    },
    async (context, request, response): Promise<OpenSearchDashboardsResponse> => {
      const adaptor = new IntegrationsManager(context.core.savedObjects.client);
      return handleWithCallback(adaptor, response, async (a: IntegrationsManager) =>
        a.getIntegrationInstance({
          id: request.params.id,
        })
      );
    }
  );
}

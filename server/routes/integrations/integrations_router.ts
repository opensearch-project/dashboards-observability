/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from '@osd/config-schema';
import * as mime from 'mime';
import sanitize from 'sanitize-filename';
import { IRouter, RequestHandlerContext } from '../../../../../src/core/server';
import { INTEGRATIONS_BASE } from '../../../common/constants/shared';
import { IntegrationsAdaptor } from '../../adaptors/integrations/integrations_adaptor';
import {
  OpenSearchDashboardsRequest,
  OpenSearchDashboardsResponseFactory,
} from '../../../../../src/core/server/http/router';

/**
 * Handle an `OpenSearchDashboardsRequest` using the provided `callback` function.
 * This is a convenience method that handles common error handling and response formatting.
 * The callback must accept a `IntegrationsAdaptor` as its first argument.
 *
 * If the callback throws an error,
 * the `OpenSearchDashboardsResponse` will be formatted using the error's `statusCode` and `message` properties.
 * Otherwise, the callback's return value will be formatted in a JSON object under the `data` field.
 *
 * @param {IntegrationsAdaptor} adaptor The adaptor instance to use for making requests.
 * @param {OpenSearchDashboardsResponseFactory} response The factory to use for creating responses.
 * @callback callback A callback that will invoke a request on a provided adaptor.
 * @returns {Promise<OpenSearchDashboardsResponse>} An `OpenSearchDashboardsResponse` with the return data from the callback.
 */
export const handleWithCallback = async (
  adaptor: IntegrationsAdaptor,
  response: OpenSearchDashboardsResponseFactory,
  callback: (a: IntegrationsAdaptor) => any
): Promise<any> => {
  try {
    const data = await callback(adaptor);
    return response.ok({
      body: {
        data,
      },
    });
  } catch (err: any) {
    console.error(`handleWithCallback: callback failed with error "${err.message}"`);
    return response.custom({
      statusCode: err.statusCode || 500,
      body: err.message,
    });
  }
};

const getAdaptor = (
  context: RequestHandlerContext,
  _request: OpenSearchDashboardsRequest
): IntegrationsAdaptor => {
  // Stub
  return {} as IntegrationsAdaptor;
};

export function registerIntegrationsRoute(router: IRouter) {
  router.get(
    {
      path: `${INTEGRATIONS_BASE}/repository`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      const adaptor = getAdaptor(context, request);
      return handleWithCallback(adaptor, response, async (a: IntegrationsAdaptor) =>
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
          name: schema.string(),
          dataSource: schema.string(),
        }),
      },
    },
    async (context, request, response): Promise<any> => {
      const adaptor = getAdaptor(context, request);
      return handleWithCallback(adaptor, response, async (a: IntegrationsAdaptor) => {
        return a.loadIntegrationInstance(
          request.params.templateName,
          request.body.name,
          request.body.dataSource
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
    async (context, request, response): Promise<any> => {
      const adaptor = getAdaptor(context, request);
      return handleWithCallback(
        adaptor,
        response,
        async (a: IntegrationsAdaptor) =>
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
    async (context, request, response): Promise<any> => {
      const adaptor = getAdaptor(context, request);
      try {
        const requestPath = sanitize(request.params.path);
        const result = await adaptor.getStatic(request.params.id, requestPath);
        return response.ok({
          headers: {
            'Content-Type': mime.getType(request.params.path),
          },
          body: result,
        });
      } catch (err: any) {
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
    async (context, request, response): Promise<any> => {
      const adaptor = getAdaptor(context, request);
      return handleWithCallback(adaptor, response, async (a: IntegrationsAdaptor) =>
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
    async (context, request, response): Promise<any> => {
      const adaptor = getAdaptor(context, request);
      return handleWithCallback(adaptor, response, async (a: IntegrationsAdaptor) =>
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
    async (context, request, response): Promise<any> => {
      const adaptor = getAdaptor(context, request);
      return handleWithCallback(adaptor, response, async (a: IntegrationsAdaptor) =>
        a.getSampleData(request.params.id)
      );
    }
  );

  router.get(
    {
      path: `${INTEGRATIONS_BASE}/store`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      const adaptor = getAdaptor(context, request);
      return handleWithCallback(adaptor, response, async (a: IntegrationsAdaptor) =>
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
    async (context, request, response): Promise<any> => {
      const adaptor = getAdaptor(context, request);
      return handleWithCallback(adaptor, response, async (a: IntegrationsAdaptor) =>
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
    async (context, request, response): Promise<any> => {
      const adaptor = getAdaptor(context, request);
      return handleWithCallback(adaptor, response, async (a: IntegrationsAdaptor) =>
        a.getIntegrationInstance({
          id: request.params.id,
        })
      );
    }
  );
}

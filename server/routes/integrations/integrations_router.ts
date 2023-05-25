/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import fetch from 'node-fetch';
import * as fs from 'fs';
import { schema } from '@osd/config-schema';
import { IRouter, RequestHandlerContext } from '../../../../../src/core/server';
import { INTEGRATIONS_BASE, OBSERVABILITY_BASE } from '../../../common/constants/shared';
import { IntegrationsAdaptor } from '../../adaptors/integrations/integrations_adaptor';
import {
  OpenSearchDashboardsRequest,
  OpenSearchDashboardsResponseFactory,
} from '../../../../../src/core/server/http/router';
import { IntegrationsKibanaBackend } from '../../adaptors/integrations/integrations_kibana_backend';

const added = false;

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
    console.log(`handleWithCallback: callback returned ${data.toString().length} bytes`);
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
  return new IntegrationsKibanaBackend(context.core.savedObjects.client);
};

export function registerIntegrationsRoute(router: IRouter) {
  router.get(
    {
      path: `${INTEGRATIONS_BASE}/repository`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      const adaptor = getAdaptor(context, request);
      return handleWithCallback(adaptor, response, async (a: IntegrationsAdaptor) => {
        return await a.getIntegrationTemplates();
      });
    }
  );

  router.post(
    {
      path: `${INTEGRATIONS_BASE}/store`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      const adaptor = getAdaptor(context, request);
      return handleWithCallback(adaptor, response, async (a: IntegrationsAdaptor) => {
        return a.loadIntegrationInstance('nginx');
      });
    }
  );

  router.get(
    {
      path: `${OBSERVABILITY_BASE}/repository/id`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      const adaptor = getAdaptor(context, request);
      return handleWithCallback(adaptor, response, async (_a: IntegrationsAdaptor) => {
        return (await fetch('http://127.0.0.1:4010/repository/id', {})).json();
      });
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
        const logo = await adaptor.getStatic(request.params.id, `/${request.params.path}`);
        return response.ok({
          headers: {
            'Content-Type': logo.mimeType,
          },
          body: Buffer.from(logo.data, 'base64'),
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
      path: `${OBSERVABILITY_BASE}/store`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      const adaptor = getAdaptor(context, request);
      return handleWithCallback(adaptor, response, async (_a: IntegrationsAdaptor) => {
        return (await fetch('http://127.0.0.1:4010/store?limit=24', {})).json();
      });
    }
  );

  router.get(
    {
      path: `${INTEGRATIONS_BASE}/store`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      const adaptor = getAdaptor(context, request);
      return handleWithCallback(adaptor, response, async (a: IntegrationsAdaptor) => {
        return await a.getIntegrationTemplates();
      });
    }
  );

  router.get(
    {
      path: `${INTEGRATIONS_BASE}/store/list_added`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      const adaptor = getAdaptor(context, request);
      return handleWithCallback(adaptor, response, async (a: IntegrationsAdaptor) => {
        return await a.getIntegrationInstances({
          added,
        });
      });
    }
  );
}

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import fetch from 'node-fetch';
import * as fs from 'fs';
import { Readable } from 'stream';
import {
  ILegacyScopedClusterClient,
  IRouter,
  OpenSearchDashboardsRequest,
  RequestHandlerContext,
} from '../../../../../src/core/server';
import { INTEGRATIONS_BASE, OBSERVABILITY_BASE } from '../../../common/constants/shared';
import { PlaceholderAdaptor } from '../../../server/adaptors/placeholder/placeholder_adaptor';
import { OpenSearchDashboardsResponseFactory } from '../../../../../src/core/server/http/router';

export const readNDJson = async (stream: Readable): Promise<any[]> => {
  return new Promise<any>((resolve, reject) => {
    let assets: any[] = [];
    let json: string = '';
    stream.on('data', (chunk: string | Buffer) => {
      json += chunk.toString();
    });
    stream.on('end', () => {
      try {
        assets = JSON.parse(`[${json.replace(/\}\s+\{/g, '},{')}]`);
        resolve(assets);
      } catch (err: any) {
        reject(err);
      }
    });
    stream.on('error', (err: Error) => {
      reject(err);
    });
  });
};

let added = false;

export const wrappedData = async (
  context: RequestHandlerContext,
  request: OpenSearchDashboardsRequest,
  response: OpenSearchDashboardsResponseFactory,
  callback: any
): Promise<any> => {
  // context.observability_plugin.observabilityClient is not in the RequestHandlerContext,
  // but it's the correct client.
  // Not sure why context.core.opensearch.legacy.client doesn't work, but it changes the loaded routes.
  const opensearchClient = context.observability_plugin.observabilityClient.asScoped(request);
  try {
    const data = await callback(opensearchClient);
    console.log(`${request.url.pathname}: callback returned ${data.toString().length} bytes`);
    return response.ok({
      body: {
        data,
      },
    });
  } catch (err: any) {
    console.error(`${request.url.pathname}: callback failed with error "${err.message}"`);
    return response.custom({
      statusCode: err.statusCode || 500,
      body: err.message,
    });
  }
};

export function registerPlaceholderRoute(router: IRouter) {
  const integrationsAdaptor = new PlaceholderAdaptor();

  router.get(
    {
      path: `${INTEGRATIONS_BASE}/repository`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      return wrappedData(context, request, response, integrationsAdaptor.fetchApps);
    }
  );

  router.post(
    {
      path: `${INTEGRATIONS_BASE}/store`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      return wrappedData(context, request, response, async (client: any) => {
        const stream = fs.createReadStream(__dirname + '/__tests__/test.ndjson');
        const assets = await readNDJson(stream);
        added = true;
        return context.core.savedObjects.client.bulkCreate(assets);
      });
    }
  );
  router.get(
    {
      path: `${OBSERVABILITY_BASE}/repository/id`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      return wrappedData(context, request, response, async (_client: any) => {
        return (await fetch('http://127.0.0.1:4010/repository/id', {})).json();
      });
    }
  );

  router.get(
    {
      path: `${OBSERVABILITY_BASE}/store`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      return wrappedData(context, request, response, async (_client: any) => {
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
      return wrappedData(context, request, response, integrationsAdaptor.fetchApps);
    }
  );

  router.get(
    {
      path: `${INTEGRATIONS_BASE}/store/list_added`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      return wrappedData(context, request, response, async (client: any) =>
        integrationsAdaptor.fetchAdded(client, added)
      );
    }
  );
}

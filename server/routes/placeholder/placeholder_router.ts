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
  RequestHandlerContext,
} from '../../../../../src/core/server';
import { INTEGRATIONS_BASE, OBSERVABILITY_BASE } from '../../../common/constants/shared';
import { PlaceholderAdaptor } from '../../../server/adaptors/placeholder/placeholder_adaptor';
import {
  OpenSearchDashboardsRequest,
  OpenSearchDashboardsResponseFactory,
} from '../../../../../src/core/server/http/router';
import { SavedObjectsBulkCreateObject } from '../../../../../src/core/public';
import { PlaceholderJavaBackend } from '../../adaptors/placeholder/placeholder_java_backend';

/**
 * Parse a stream of newline-delimited JSON objects as an array.
 * The entire stream is read; the method will hang if the stream is not closed.
 * The data entries MUST be JSON objects,
 * other valid JSON values will be rejected.
 *
 * Resolves the `Promise` if every newline-separated JSON object is valid.
 * Rejects the `Promise` if the stream errors, or if the JSON is not parseable.
 *
 * @param {Readable} stream A stream of newline-delimited JSON objects.
 * @returns {Promise<object[]>} A `Promise` for an array of parsed JSON objects.
 */
export const readNDJsonObjects = async (stream: Readable): Promise<object[]> => {
  return new Promise<object[]>((resolve, reject) => {
    let assets: object[] = [];
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

/**
 * Handle an `OpenSearchDashboardsRequest` using the provided `callback` function.
 * This is a convenience method that handles common error handling and response formatting.
 * The callback must accept a `PlaceholderAdaptor` as its first argument.
 *
 * If the callback throws an error,
 * the `OpenSearchDashboardsResponse` will be formatted using the error's `statusCode` and `message` properties.
 * Otherwise, the callback's return value will be formatted in a JSON object under the `data` field.
 *
 * @param {PlaceholderAdaptor} adaptor The adaptor instance to use for making requests.
 * @param {OpenSearchDashboardsResponseFactory} response The factory to use for creating responses.
 * @callback callback A callback that will invoke a request on a provided adaptor.
 * @returns {Promise<OpenSearchDashboardsResponse>} An `OpenSearchDashboardsResponse` with the return data from the callback.
 */
export const handleWithCallback = async (
  adaptor: PlaceholderAdaptor,
  response: OpenSearchDashboardsResponseFactory,
  callback: (a: PlaceholderAdaptor) => object
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
  request: OpenSearchDashboardsRequest
): PlaceholderAdaptor => {
  // context.observability_plugin.observabilityClient is not in the RequestHandlerContext type, but it's the correct client.
  // Updating to the seemingly-correct context.core.opensearch.legacy.client is a breaking change.
  // For now, we'll wrap access in manual type checking.
  if (context.observability_plugin === null) {
    throw new Error('context.observability_plugin is null');
  }
  const client = context.observability_plugin.observabilityClient.asScoped(request);
  return new PlaceholderJavaBackend(client);
};

export function registerPlaceholderRoute(router: IRouter) {
  router.get(
    {
      path: `${INTEGRATIONS_BASE}/repository`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      const adaptor = getAdaptor(context, request);
      return handleWithCallback(adaptor, response, async (a: PlaceholderAdaptor) => {
        return await a.getIntegrationTemplates(null);
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
      return handleWithCallback(adaptor, response, async (_a: PlaceholderAdaptor) => {
        const stream = fs.createReadStream(__dirname + '/__tests__/test.ndjson');
        const assets = (await readNDJsonObjects(stream)) as SavedObjectsBulkCreateObject[];
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
      const adaptor = getAdaptor(context, request);
      return handleWithCallback(adaptor, response, async (_a: PlaceholderAdaptor) => {
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
      const adaptor = getAdaptor(context, request);
      return handleWithCallback(adaptor, response, async (_a: PlaceholderAdaptor) => {
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
      return handleWithCallback(adaptor, response, async (a: PlaceholderAdaptor) => {
        return await a.getIntegrationTemplates(null);
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
      return handleWithCallback(adaptor, response, async (a: PlaceholderAdaptor) => {
        return await a.getIntegrationInstances({
          added,
        });
      });
    }
  );
}

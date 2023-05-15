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
import { SavedObjectsBulkCreateObject } from '../../../../../src/core/public';

/**
 * Parse a stream of newline-delimited JSON objects as an array.
 * The entire stream is read; the method will hang if the stream is not closed.
 * The data entries MUST be JSON objects,
 * other valid JSON values will be rejected.
 *
 * Resolves the `Promise` if every newline-separated JSON object is valid.
 * Rejects the `Promise` if the stream errors, or if the JSON is not parseable.
 *
 * @param stream A `Readable` stream of newline-delimited JSON objects.
 * @returns A `Promise` for an array of parsed JSON objects.
 */
export const readNDJsonObjects = async (stream: Readable): Promise<object[]> => {
  return new Promise<any>((resolve, reject) => {
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
 * The callback must accept an `ILegacyScopedClusterClient` as its first argument.
 *
 * If the callback throws an error,
 * the `OpenSearchDashboardsResponse` will be formatted using the error's `statusCode` and `message` properties.
 * Otherwise, the callback's return value will be formatted in a JSON object under the `data` field.
 *
 * @param context The `RequestHandlerContext` for the current request.
 * @param request The request to be handled.
 * @param response An `OpenSearchDashboardsResponseFactory` for creating responses.
 * @param callback A callback that will be invoked on an `ILegacyScopedClusterClient`.
 * @returns An `OpenSearchDashboardsResponse` with the return data from the callback.
 */
export const wrappedData = async (
  context: RequestHandlerContext,
  request: OpenSearchDashboardsRequest,
  response: OpenSearchDashboardsResponseFactory,
  callback: any
): Promise<any> => {
  const opensearchClient = context.core.opensearch.legacy.client;
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

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ResponseError } from '@opensearch-project/opensearch/lib/errors';
import { schema } from '@osd/config-schema';
import fetch from 'node-fetch';
import { ApplicationType } from 'common/types/application_analytics';
import * as fs from 'fs';
import { Readable } from 'stream';
import {
  ILegacyScopedClusterClient,
  IOpenSearchDashboardsResponse,
  IRouter,
  OpenSearchDashboardsRequest,
  RequestHandlerContext,
} from '../../../../../src/core/server';
import { INTEGRATIONS_BASE, OBSERVABILITY_BASE } from '../../../common/constants/shared';
import { addClickToMetric, getMetrics } from '../../common/metrics/metrics_helper';
import { PlaceholderAdaptor } from '../../../server/adaptors/placeholder/placeholder_adaptor';
import { importFile } from '../../../../../src/plugins/saved_objects_management/public/lib';
import { SavedObject } from '../../../../../src/plugins/data/common';
import {
  OpenSearchDashboardsResponse,
  OpenSearchDashboardsResponseFactory,
} from '../../../../../src/core/server/http/router';

export async function readNDJson(stream: Readable): Promise<any[]> {
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
}

let added = false;

const wrappedData = async (
  context: RequestHandlerContext,
  request: OpenSearchDashboardsRequest,
  response: OpenSearchDashboardsResponseFactory,
  callback: any
): Promise<any> => {
  const opensearchClient: ILegacyScopedClusterClient = context.observability_plugin.observabilityClient.asScoped(
    request
  );
  try {
    console.log(`Calling callback for path "${request.url.pathname}"`);
    const data = await callback(opensearchClient);
    console.log(`Callback returned ${data.toString().length} bytes`);
    return response.ok({
      body: {
        data,
      },
    });
  } catch (err: any) {
    console.error(`Callback failed with error "${err.message}"`);
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
        const stream = fs.createReadStream(__dirname + '/test.ndjson');
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
        return await fetch('http://127.0.0.1:4010/repository/id', {}).json();
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
        return await fetch('http://127.0.0.1:4010/store?limit=24', {}).json();
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

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ResponseError } from '@opensearch-project/opensearch/lib/errors';
import { schema } from '@osd/config-schema';
import fetch from 'node-fetch';
import { ApplicationType } from 'common/types/application_analytics';
import {
  ILegacyScopedClusterClient,
  IOpenSearchDashboardsResponse,
  IRouter,
} from '../../../../../src/core/server';
import { INTEGRATIONS_BASE, OBSERVABILITY_BASE } from '../../../common/constants/shared';
import { addClickToMetric, getMetrics } from '../../common/metrics/metrics_helper';
import { PlaceholderAdaptor } from '../../../server/adaptors/placeholder/placeholder_adaptor';
import { importFile } from '../../../../../src/plugins/saved_objects_management/public/lib';
import { SavedObject } from '../../../../../src/plugins/data/common';

import * as fs from 'fs';

async function readJSONFile(filePath: string): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    let assets: any[] = [];
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    stream.on('data', (data: string) => {
      let data_array = "[" + data.replace(/\}\s+\{/gi, "},{") + "]";
      assets = JSON.parse(data_array);
    });
    stream.on('end', () => {
      resolve(assets);
    });
    stream.on('error', (err: Error) => {
      reject(err);
    });
  });
}

export function registerPlaceholderRoute(router: IRouter) {
  const appAnalyticsBackend = new PlaceholderAdaptor();

  router.get(
    {
      path: `${INTEGRATIONS_BASE}/repository`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      const opensearchClient: ILegacyScopedClusterClient = context.observability_plugin.observabilityClient.asScoped(
        request
      );
      let applicationsData: ApplicationType[] = [];
      try {
        console.log('in get');
        applicationsData = await appAnalyticsBackend.fetchApps(opensearchClient);
        console.log(applicationsData);
        return response.ok({
          body: {
            data: applicationsData,
          },
        });
      } catch (err: any) {
        console.error('Error occurred while fetching applications', err);
        return response.custom({
          statusCode: err.statusCode || 500,
          body: err.message,
        });
      }
    }
  );

  router.post(
    {
      path: `${INTEGRATIONS_BASE}/store`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      const opensearchClient: ILegacyScopedClusterClient = context.observability_plugin.observabilityClient.asScoped(
        request
      );
      console.log('in post');
      const applicationsData: ApplicationType[] = [];
      try {
        const assets = await readJSONFile(__dirname + "/test.ndjson")
        const bulkCreateResponse = await context.core.savedObjects.client.bulkCreate(assets);
        return response.ok({
          body: {
            data: {},
          },
        });
      } catch (err: any) {
        console.error('Error occurred while fetching applications', err);
        return response.custom({
          statusCode: err.statusCode || 500,
          body: err.message,
        });
      }
    }
  );
  router.get(
    {
      path: `${OBSERVABILITY_BASE}/repository/id`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      try {
        const random = await fetch('http://127.0.0.1:4010/repository/id', {});
        return response.ok({
          body: {
            data: await random.json(),
          },
        });
      } catch (error) {}
    }
  );

  router.get(
    {
      path: `${OBSERVABILITY_BASE}/store`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      try {
        const random = await fetch('http://127.0.0.1:4010/store?limit=24', {});
        return response.ok({
          body: {
            data: await random.json(),
          },
        });
      } catch (error) {}
    }
  );

  router.get(
    {
      path: `${INTEGRATIONS_BASE}/store`,
      validate: false,
    },
    async (context, request, response): Promise<any> => {
      const opensearchClient: ILegacyScopedClusterClient = context.observability_plugin.observabilityClient.asScoped(
        request
      );
      let applicationsData: ApplicationType[] = [];
      try {
        applicationsData = await appAnalyticsBackend.fetchApps(opensearchClient);
        return response.ok({
          body: {
            data: applicationsData,
          },
        });
      } catch (err: any) {
        console.error('Error occurred while fetching applications', err);
        return response.custom({
          statusCode: err.statusCode || 500,
          body: err.message,
        });
      }
    }
  );
}

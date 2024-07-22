/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from '@osd/config-schema';
import { Readable } from 'stream';
import {
  IOpenSearchDashboardsResponse,
  IRouter,
  ResponseError,
} from '../../../../../src/core/server';
import { createSavedObjectsStreamFromNdJson } from '../../../../../src/core/server/saved_objects/routes/utils';
import { loadAssetsFromFile } from './helper';

export function registerGettingStartedRoutes(router: IRouter) {
  // Fetch the tutorial assets
  router.get(
    {
      path: `/api/observability/gettingStarted/{tutorialId}`,
      validate: {
        params: schema.object({
          tutorialId: schema.string(),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      try {
        const fileData = await loadAssetsFromFile(request.params.tutorialId);
        return response.ok({
          body: {
            data: fileData,
          },
        });
      } catch (error) {
        console.error(error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: 'Issue in fetching NDJSON file for tutorialId: ' + request.params.tutorialId,
        });
      }
    }
  );

  // Fetch the tutorial dashboards
  router.get(
    {
      path: `/api/observability/gettingStarted/dashboards/{tutorialId}`,
      validate: {
        params: schema.object({
          tutorialId: schema.string(),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      try {
        const fileData = await loadAssetsFromFile(request.params.tutorialId);

        const objects = await createSavedObjectsStreamFromNdJson(Readable.from(fileData));
        const loadedObjects = await objects.toArray();
        const loadDashboardIds = loadedObjects
          .filter((savedObject) => savedObject.type === 'dashboard')
          .map((dashboard) => ({
            id: dashboard.id,
            title: dashboard.attributes.title,
          }));

        return response.ok({
          body: {
            data: loadDashboardIds,
          },
        });
      } catch (error) {
        console.error(error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: 'Issue in fetching dashboards for tutorialId: ' + request.params.tutorialId,
        });
      }
    }
  );

  // Fetch the tutorial saved searches
  router.get(
    {
      path: `/api/observability/gettingStarted/indexPatterns/{tutorialId}`,
      validate: {
        params: schema.object({
          tutorialId: schema.string(),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      try {
        const fileData = await loadAssetsFromFile(request.params.tutorialId);

        const objects = await createSavedObjectsStreamFromNdJson(Readable.from(fileData));
        const loadedObjects = await objects.toArray();
        const loadDashboardIds = loadedObjects
          .filter((savedObject) => savedObject.type === 'index-pattern')
          .map((indexPattern) => ({
            id: indexPattern.id,
            title: indexPattern.attributes.title,
          }));

        return response.ok({
          body: {
            data: loadDashboardIds,
          },
        });
      } catch (error) {
        console.error(error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: 'Issue in fetching index-patterns for tutorialId: ' + request.params.tutorialId,
        });
      }
    }
  );
}

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

  router.post(
    {
      path: `/api/observability/gettingStarted/createAssets`,
      validate: {
        body: schema.object({
          mdsId: schema.string(),
          mdsLabel: schema.string(),
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
        const { mdsId, mdsLabel, tutorialId } = request.body;
        const fileData = await loadAssetsFromFile(tutorialId);

        const objects = await createSavedObjectsStreamFromNdJson(Readable.from(fileData));
        const loadedObjects = await objects.toArray();

        const updatedObjects = loadedObjects.map((obj) => {
          if (mdsId) {
            const newId = `mds-${mdsId}-objectId-${obj.id}`;

            const newReferences =
              obj.references?.map((ref: { type: string; id: any }) => {
                if (ref.type === 'visualization') {
                  return {
                    ...ref,
                    id: `mds-${mdsId}-objectId-${ref.id}`,
                  };
                }
                return ref;
              }) || [];

            newReferences.push({
              id: mdsId,
              type: 'data-source',
              name: mdsLabel,
            });

            return {
              ...obj,
              id: newId,
              references: newReferences,
            };
          } else {
            return obj;
          }
        });

        await context.core.savedObjects.client.bulkCreate(updatedObjects);

        return response.ok({
          body: {
            message: 'Objects loaded successfully',
          },
        });
      } catch (error) {
        console.error(error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: 'Issue in loading objects for mdsId:',
        });
      }
    }
  );
}

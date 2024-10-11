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
  SavedObject,
} from '../../../../../src/core/server';
import { createSavedObjectsStreamFromNdJson } from '../../../../../src/core/server/saved_objects/routes/utils';
import { loadAssetsFromFile } from './helper';
import { getWorkspaceState } from '../../../../../src/core/server/utils';
import { TutorialId } from '../../../common/constants/getting_started_routes';

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
        const fileData = await loadAssetsFromFile(request.params.tutorialId as TutorialId);
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
        const fileData = await loadAssetsFromFile(request.params.tutorialId as TutorialId);

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
        const { requestWorkspaceId } = getWorkspaceState(request);
        const fileData = await loadAssetsFromFile(tutorialId as TutorialId);

        const objects = await createSavedObjectsStreamFromNdJson(Readable.from(fileData));
        const loadedObjects = await objects.toArray();

        const updatedObjects = loadedObjects.map((obj) => {
          let newId = obj.id;
          let references: SavedObject['references'] | undefined = obj.references;

          if (requestWorkspaceId) {
            newId = `workspaceId-${requestWorkspaceId}-${newId}`;
            references = references?.map((ref) => {
              return {
                ...ref,
                id: `workspaceId-${requestWorkspaceId}-${ref.id}`,
              };
            });
          }

          if (mdsId) {
            newId = `mds-${mdsId}-objectId-${obj.id}`;
            references = references?.map((ref) => {
              return {
                ...ref,
                id: `mds-${mdsId}-objectId-${ref.id}`,
              };
            });

            if (obj.type === 'index-pattern' && references) {
              references.push({
                id: mdsId,
                type: 'data-source',
                name: mdsLabel,
              });
            }
          }

          return {
            ...obj,
            id: newId,
            ...(references && { references }),
          };
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

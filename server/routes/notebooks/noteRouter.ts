/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from '@osd/config-schema';
import {
  IOpenSearchDashboardsResponse,
  IRouter,
  ResponseError,
} from '../../../../../src/core/server';
import { SavedObjectsClientContract } from '../../../../../src/core/server/types';
import { NOTEBOOKS_API_PREFIX } from '../../../common/constants/notebooks';
import { NOTEBOOK_SAVED_OBJECT } from '../../../common/types/observability_saved_object_attributes';
import {
  addSampleNotes,
  cloneNotebook,
  createNotebook,
  fetchNotebooks,
  renameNotebook,
} from '../../adaptors/notebooks/saved_objects_notebooks_router';

export function registerNoteRoute(router: IRouter) {
  router.get(
    {
      path: `${NOTEBOOKS_API_PREFIX}/savedNotebook`,
      validate: {},
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      const opensearchNotebooksClient: SavedObjectsClientContract =
        context.core.savedObjects.client;
      try {
        const notebooksData = await opensearchNotebooksClient.find({
          type: NOTEBOOK_SAVED_OBJECT,
          perPage: 1000,
        });
        const fetchedNotebooks = fetchNotebooks(notebooksData.saved_objects);
        return response.ok({
          body: {
            data: fetchedNotebooks,
          },
        });
      } catch (error) {
        console.log('Notebook:', error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );

  router.post(
    {
      path: `${NOTEBOOKS_API_PREFIX}/note/savedNotebook`,
      validate: {
        body: schema.object({
          name: schema.string(),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      const opensearchNotebooksClient: SavedObjectsClientContract =
        context.core.savedObjects.client;
      let notebooksData;
      try {
        const newNotebookObject = createNotebook(request.body);
        notebooksData = await opensearchNotebooksClient.create(
          NOTEBOOK_SAVED_OBJECT,
          newNotebookObject
        );
        return response.ok({
          body: `${notebooksData.id}`,
        });
      } catch (error) {
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );
  router.get(
    {
      path: `${NOTEBOOKS_API_PREFIX}/note/savedNotebook/{noteId}`,
      validate: {
        params: schema.object({
          noteId: schema.string(),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      const opensearchNotebooksClient: SavedObjectsClientContract =
        context.core.savedObjects.client;
      try {
        const notebookinfo = await opensearchNotebooksClient.get(
          NOTEBOOK_SAVED_OBJECT,
          request.params.noteId
        );
        return response.ok({
          body: notebookinfo.attributes.savedNotebook,
        });
      } catch (error) {
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );

  router.post(
    {
      path: `${NOTEBOOKS_API_PREFIX}/note/savedNotebook/clone`,
      validate: {
        body: schema.object({
          name: schema.string(),
          noteId: schema.string(),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      const opensearchNotebooksClient: SavedObjectsClientContract =
        context.core.savedObjects.client;
      try {
        const getNotebook = await opensearchNotebooksClient.get(
          NOTEBOOK_SAVED_OBJECT,
          request.body.noteId
        );
        const createCloneNotebook = cloneNotebook(
          getNotebook.attributes.savedNotebook,
          request.body.name
        );
        const createdNotebook = await opensearchNotebooksClient.create(
          NOTEBOOK_SAVED_OBJECT,
          createCloneNotebook
        );
        return response.ok({
          body: createdNotebook,
        });
      } catch (error) {
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );
  router.put(
    {
      path: `${NOTEBOOKS_API_PREFIX}/note/savedNotebook/rename`,
      validate: {
        body: schema.object({
          name: schema.string(),
          noteId: schema.string(),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      const opensearchNotebooksClient: SavedObjectsClientContract =
        context.core.savedObjects.client;
      try {
        const renamedNotebook = renameNotebook(request.body);
        const updatedNotebook = await opensearchNotebooksClient.update(
          NOTEBOOK_SAVED_OBJECT,
          request.body.noteId,
          renamedNotebook
        );
        return response.ok({
          body: updatedNotebook,
        });
      } catch (error) {
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );

  router.delete(
    {
      path: `${NOTEBOOKS_API_PREFIX}/note/savedNotebook/{noteId}`,
      validate: {
        params: schema.object({
          noteId: schema.string(),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      const opensearchNotebooksClient: SavedObjectsClientContract =
        context.core.savedObjects.client;

      try {
        const deletedNotebooks = await opensearchNotebooksClient.delete(
          NOTEBOOK_SAVED_OBJECT,
          request.params.noteId
        );
        return response.ok({
          body: deletedNotebooks,
        });
      } catch (error) {
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );
  router.post(
    {
      path: `${NOTEBOOKS_API_PREFIX}/note/savedNotebook/addSampleNotebooks`,
      validate: {
        body: schema.object({
          visIds: schema.arrayOf(schema.string()),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      const opensearchNotebooksClient: SavedObjectsClientContract =
        context.core.savedObjects.client;
      try {
        const sampleNotebooks = await addSampleNotes(
          opensearchNotebooksClient,
          request.body.visIds
        );
        return response.ok({
          body: sampleNotebooks,
        });
      } catch (error) {
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );
}

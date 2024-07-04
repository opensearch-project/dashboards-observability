/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from '@osd/config-schema';
import {
  ILegacyScopedClusterClient,
  IOpenSearchDashboardsResponse,
  IRouter,
  ResponseError,
  SavedObjectsFindResponse,
} from '../../../../../src/core/server';
import { SavedObjectsClientContract } from '../../../../../src/core/server/types';
import { NOTEBOOKS_API_PREFIX, wreckOptions } from '../../../common/constants/notebooks';
import { NOTEBOOK_SAVED_OBJECT, NotebooksSavedObjectAttributes } from '../../../common/types/observability_saved_object_attributes';
import { BACKEND } from '../../adaptors/notebooks';
import { addSampleNotes, cloneNotebook, createNotebook, fetchNotebooks, renameNotebook } from '../../adaptors/notebooks/saved_object_notebook_adapter';


export function registerNoteRoute(router: IRouter) {
  // Fetch all the notebooks available
  router.get(
    {
      path: `${NOTEBOOKS_API_PREFIX}/`,
      validate: {},
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      const opensearchNotebooksClient: ILegacyScopedClusterClient = context.observability_plugin.observabilityClient.asScoped(
        request
      );
      let notebooksData = [];
      try {
        notebooksData = await BACKEND.viewNotes(opensearchNotebooksClient, wreckOptions);
        return response.ok({
          body: {
            data: notebooksData,
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

  // Get all paragraphs of notebooks
  router.get(
    {
      path: `${NOTEBOOKS_API_PREFIX}/note/{noteId}`,
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
      const opensearchNotebooksClient: ILegacyScopedClusterClient = context.observability_plugin.observabilityClient.asScoped(
        request
      );
      try {
        const notebookinfo = await BACKEND.fetchNote(
          opensearchNotebooksClient,
          request.params.noteId,
          wreckOptions
        );
        return response.ok({
          body: notebookinfo,
        });
      } catch (error) {
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );

  // Add a Notebook
  router.post(
    {
      path: `${NOTEBOOKS_API_PREFIX}/note`,
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
      const opensearchNotebooksClient: ILegacyScopedClusterClient = context.observability_plugin.observabilityClient.asScoped(
        request
      );
      try {
        const addResponse = await BACKEND.addNote(
          opensearchNotebooksClient,
          request.body,
          wreckOptions
        );
        return response.ok({
          body: addResponse.message.objectId,
        });
      } catch (error) {
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );

  // Rename a notebook
  router.put(
    {
      path: `${NOTEBOOKS_API_PREFIX}/note/rename`,
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
      const opensearchNotebooksClient: ILegacyScopedClusterClient = context.observability_plugin.observabilityClient.asScoped(
        request
      );
      try {
        const renameResponse = await BACKEND.renameNote(
          opensearchNotebooksClient,
          request.body,
          wreckOptions
        );
        return response.ok({
          body: renameResponse,
        });
      } catch (error) {
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );

  // Clone a notebook
  router.post(
    {
      path: `${NOTEBOOKS_API_PREFIX}/note/clone`,
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
      const opensearchNotebooksClient: ILegacyScopedClusterClient = context.observability_plugin.observabilityClient.asScoped(
        request
      );
      try {
        const cloneResponse = await BACKEND.cloneNote(
          opensearchNotebooksClient,
          request.body,
          wreckOptions
        );
        return response.ok({
          body: cloneResponse,
        });
      } catch (error) {
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );

  // Delete notebooks
  router.delete(
    {
      path: `${NOTEBOOKS_API_PREFIX}/note/{noteList}`,
      validate: {
        params: schema.object({
          noteList: schema.string(),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      const opensearchNotebooksClient: ILegacyScopedClusterClient = context.observability_plugin.observabilityClient.asScoped(
        request
      );
      try {
        const delResponse = await BACKEND.deleteNote(
          opensearchNotebooksClient,
          request.params.noteList,
          wreckOptions
        );
        return response.ok({
          body: delResponse,
        });
      } catch (error) {
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );

  // Add sample notebooks
  router.post(
    {
      path: `${NOTEBOOKS_API_PREFIX}/note/addSampleNotebooks`,
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
      const opensearchNotebooksClient: ILegacyScopedClusterClient = context.observability_plugin.observabilityClient.asScoped(
        request
      );
      try {
        const addSampleNotesResponse = await BACKEND.addSampleNotes(
          opensearchNotebooksClient,
          request.body.visIds,
          wreckOptions
        );
        return response.ok({
          body: addSampleNotesResponse,
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
      path: `${NOTEBOOKS_API_PREFIX}/savedNotebooks`,
      validate: {},
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      const opensearchNotebooksClient: SavedObjectsClientContract = context.core.savedObjects.client 
      let notebooksData : SavedObjectsFindResponse<NotebooksSavedObjectAttributes>
      try {
        notebooksData = await opensearchNotebooksClient.find({'type': NOTEBOOK_SAVED_OBJECT })
        // console.log(notebooksData)
        let books = fetchNotebooks(notebooksData.saved_objects)
        return response.ok({
          body: {
            data: books,
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
      path: `${NOTEBOOKS_API_PREFIX}/note/savedNotebooks`,
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
      const opensearchNotebooksClient: SavedObjectsClientContract = context.core.savedObjects.client 
      let notebooksData 
      try {
        let newNotebookObject = createNotebook(request.body)
        notebooksData = await opensearchNotebooksClient.create(NOTEBOOK_SAVED_OBJECT, newNotebookObject)
        // console.log(notebooksData)
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
      const opensearchNotebooksClient: SavedObjectsClientContract = context.core.savedObjects.client 
      try {
        const notebookinfo = await opensearchNotebooksClient.get(NOTEBOOK_SAVED_OBJECT,request.params.noteId)
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
      const opensearchNotebooksClient: SavedObjectsClientContract = context.core.savedObjects.client 
      try {
        let getNotebook = await opensearchNotebooksClient.get(NOTEBOOK_SAVED_OBJECT,request.body.noteId)
        // console.log(getNotebook)
        let createCloneNotebook = cloneNotebook(getNotebook.attributes.object, request.body.name)
        let createdNotebook = await opensearchNotebooksClient.create(NOTEBOOK_SAVED_OBJECT, createCloneNotebook)
        console.log(createdNotebook,'clone here')
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
      const opensearchNotebooksClient: SavedObjectsClientContract = context.core.savedObjects.client 
      try {
        let renamedNotebook = renameNotebook(request.body)
        let getNotebook = await opensearchNotebooksClient.update(NOTEBOOK_SAVED_OBJECT, request.body.noteId, renamedNotebook)
        console.log(getNotebook,'ren')
        return response.ok({
          body: getNotebook,
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
      const opensearchNotebooksClient: SavedObjectsClientContract = context.core.savedObjects.client 
      
      try {
        let delNotebooks = await opensearchNotebooksClient.delete(NOTEBOOK_SAVED_OBJECT, request.params.noteId) 
        console.log(delNotebooks)
        return response.ok({
          body: delNotebooks,
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
      path: `${NOTEBOOKS_API_PREFIX}/note/savedNotebooks/addSampleNotebooks`,
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
      const opensearchNotebooksClient: SavedObjectsClientContract = context.core.savedObjects.client 
      let notebooksData 
      try {
        let sampleNotebooks = await addSampleNotes(opensearchNotebooksClient, request.body.visIds)
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

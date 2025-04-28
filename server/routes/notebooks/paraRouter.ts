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
  clearParagraphs,
  createParagraphs,
  deleteParagraphs,
  updateFetchParagraph,
  updateRunFetchParagraph,
} from '../../adaptors/notebooks/saved_objects_paragraphs_router';
import {
  DefaultNotebooks,
  DefaultParagraph,
} from '../../common/helpers/notebooks/default_notebook_schema';
export function registerParaRoute(router: IRouter) {
  router.post(
    {
      path: `${NOTEBOOKS_API_PREFIX}/savedNotebook/paragraph`,
      validate: {
        body: schema.object({
          noteId: schema.string(),
          paragraphIndex: schema.number(),
          paragraphInput: schema.string(),
          inputType: schema.string(),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      try {
        const saveResponse = await createParagraphs(request.body, context.core.savedObjects.client);
        return response.ok({
          body: saveResponse,
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
      path: `${NOTEBOOKS_API_PREFIX}/savedNotebook/paragraph/clearall`,
      validate: {
        body: schema.object({
          noteId: schema.string(),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      try {
        const clearParaResponse = await clearParagraphs(
          request.body,
          context.core.savedObjects.client
        );
        return response.ok({
          body: clearParaResponse,
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
      path: `${NOTEBOOKS_API_PREFIX}/savedNotebook/paragraph`,
      validate: {
        query: schema.object({
          noteId: schema.string(),
          paragraphId: schema.maybe(schema.string()),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      const params = {
        noteId: request.query.noteId,
        paragraphId: request.query.paragraphId,
      };
      try {
        const deleteResponse = await deleteParagraphs(params, context.core.savedObjects.client);
        return response.ok({
          body: deleteResponse,
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
      path: `${NOTEBOOKS_API_PREFIX}/savedNotebook/paragraph/update/run`,
      validate: {
        body: schema.object({
          noteId: schema.string(),
          paragraphId: schema.string(),
          paragraphInput: schema.string(),
          paragraphType: schema.string(),
          dataSourceMDSId: schema.maybe(schema.string({ defaultValue: '' })),
          dataSourceMDSLabel: schema.maybe(schema.string({ defaultValue: '' })),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      try {
        const runResponse = await updateRunFetchParagraph(
          request.body,
          context.core.savedObjects.client
        );
        return response.ok({
          body: runResponse,
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
      path: `${NOTEBOOKS_API_PREFIX}/savedNotebook/paragraph`,
      validate: {
        body: schema.object({
          noteId: schema.string(),
          paragraphId: schema.string(),
          paragraphInput: schema.string(),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      try {
        const saveResponse = await updateFetchParagraph(
          request.body,
          context.core.savedObjects.client
        );
        return response.ok({
          body: saveResponse,
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
      path: `${NOTEBOOKS_API_PREFIX}/savedNotebook/set_paragraphs`,
      validate: {
        body: schema.object({
          noteId: schema.string(),
          paragraphs: schema.arrayOf(
            schema.object({
              output: schema.maybe(schema.arrayOf(schema.object({}, { unknowns: 'allow' }))),
              input: schema.object({
                inputText: schema.string(),
                inputType: schema.string(),
              }),
              dateCreated: schema.string(),
              dateModified: schema.string(),
              id: schema.string(),
              dataSourceMDSId: schema.maybe(schema.string({ defaultValue: '' })),
              dataSourceMDSLabel: schema.maybe(schema.string({ defaultValue: '' })),
            })
          ),
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
        const updateNotebook: Partial<DefaultNotebooks> = {
          paragraphs: request.body.paragraphs as DefaultParagraph[],
          dateModified: new Date().toISOString(),
        };
        const updateResponse = await opensearchNotebooksClient.update(
          NOTEBOOK_SAVED_OBJECT,
          request.body.noteId,
          {
            savedNotebook: updateNotebook,
          }
        );
        return response.ok({
          body: updateResponse,
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

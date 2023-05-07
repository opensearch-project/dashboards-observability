/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ResponseError } from '@opensearch-project/opensearch/lib/errors';
import { schema } from '@osd/config-schema';
import { IOpenSearchDashboardsResponse, IRouter } from '../../../../../src/core/server';
import { OBSERVABILITY_BASE } from '../../../common/constants/shared';
import {
  CHAT_SAVED_OBJECT,
  IChat,
  SAVED_OBJECT_VERSION,
} from '../../../common/types/observability_saved_object_attributes';
import { mdOutput, pplOutput, visOutput } from './mock';

export function registerChatRoute(router: IRouter) {
  // TODO split into three routes: request LLM, create chat, update chat
  router.post(
    {
      path: `${OBSERVABILITY_BASE}/chat/send`,
      validate: {
        body: schema.object({
          chatId: schema.maybe(schema.string()),
          // TODO finish schema
          localConversations: schema.arrayOf(schema.any()),
          input: schema.object({
            type: schema.string(),
            context: schema.object({
              appId: schema.maybe(schema.string()),
            }),
            content: schema.string(),
            contentType: schema.string(),
          }),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      try {
        const client = context.core.savedObjects.client;
        const chatId = request.body.chatId;
        const input = request.body.input;
        const localConversations = request.body.localConversations;
        const outputs = [mdOutput, visOutput, pplOutput];
        if (!chatId) {
          const createResponse = await client.create<IChat>(CHAT_SAVED_OBJECT, {
            title: input.content.substring(0, 50),
            version: SAVED_OBJECT_VERSION,
            createdTimeMs: new Date().getTime(),
            conversations: [...localConversations, input, ...outputs],
          });
          return response.ok({
            body: {
              chatId: chatId || createResponse.id,
              conversations: createResponse.attributes.conversations,
            },
          });
        }
        const updateResponse = await client.update<Partial<IChat>>(CHAT_SAVED_OBJECT, chatId, {
          conversations: [...localConversations, input, ...outputs],
        });
        return response.ok({
          body: {
            chatId,
            conversations: updateResponse.attributes.conversations,
          },
        });
      } catch (error) {
        console.error(error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );
}

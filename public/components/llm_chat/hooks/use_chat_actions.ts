/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useContext, useState } from 'react';
import {
  CHAT_SAVED_OBJECT,
  SAVED_OBJECT_VERSION,
} from '../../../../common/types/observability_saved_object_attributes';
import { ChatContext } from '../header_chat_button';
import { IChat, IConversation } from '../types';

export const useChatActions = () => {
  const chatContext = useContext(ChatContext)!;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();

  const requestLLM = async (input: IConversation) => {
    setLoading(true);
    if (input.type !== 'input') throw Error('Conversation sent must be user input.');

    const response = new Date().toString();
    const output: IConversation = {
      type: 'output',
      content: response,
    };
    setLoading(false);
    return output;
  };

  const send = async (localConversations: IConversation[], input: IConversation) => {
    const output = await requestLLM(input);

    setLoading(true);
    try {
      if (!chatContext.chatId) {
        const createResponse = await chatContext.savedObjectsClient.create<IChat>(
          CHAT_SAVED_OBJECT,
          {
            title: input.content.substring(0, 50),
            version: SAVED_OBJECT_VERSION,
            createdTimeMs: new Date().getTime(),
            conversations: [...localConversations, input, output],
          }
        );
        chatContext.setChatId(createResponse.id);
      } else {
        await chatContext.savedObjectsClient.update<Partial<IChat>>(
          CHAT_SAVED_OBJECT,
          chatContext.chatId,
          {
            conversations: [...localConversations, input, output],
          }
        );
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }

    return output;
  };

  return { send, requestLLM, loading, error };
};

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
    if (input.type !== 'input') throw Error('Conversation sent must be user input.');
    setLoading(true);

    const response = `
- list
- list

# title

inline \`code\` Conversation sent must be user input.');

\`\`\`
    code
    \`\`\`
`;

    const visResponse = `{"viewMode":"view","panels":{"1":{"gridData":{"x":0,"y":0,"w":50,"h":20,"i":"1"},"type":"visualization","explicitInput":{"id":"1","savedObjectId":"c8fc3d30-4c87-11e8-b3d7-01146121b73d"}}},"isFullScreenMode":false,"filters":[],"useMargins":false,"id":"i4a940a01-eaa6-11ed-8736-ed64a7c880d5","timeRange":{"to":"2023-05-04T18:05:41.966Z","from":"2023-04-04T18:05:41.966Z"},"title":"embed_viz_i4a940a01-eaa6-11ed-8736-ed64a7c880d5","query":{"query":"","language":"lucene"},"refreshConfig":{"pause":true,"value":15}}`;
    const output: IConversation = {
      type: 'output',
      content: visResponse,
      contentType: 'visualization',
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
      setError(undefined);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }

    return output;
  };

  return { send, requestLLM, loading, error };
};

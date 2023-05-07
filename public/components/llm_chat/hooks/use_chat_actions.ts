/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useContext, useState } from 'react';
import { OBSERVABILITY_BASE } from '../../../../common/constants/shared';
import { IConversation } from '../../../../common/types/observability_saved_object_attributes';
import { ChatContext, ConversationContext, CoreServicesContext } from '../header_chat_button';

export const useChatActions = () => {
  const chatContext = useContext(ChatContext)!;
  const coreServicesContext = useContext(CoreServicesContext)!;
  const conversationContext = useContext(ConversationContext)!;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();

  const send = async (input: IConversation) => {
    setLoading(true);
    conversationContext.setLocalConversations((prev) => [...prev, input]);
    try {
      const response = await coreServicesContext.http.post(`${OBSERVABILITY_BASE}/chat/send`, {
        body: JSON.stringify({
          chatId: chatContext.chatId,
          localConversations: conversationContext.localConversations,
          input,
        }),
      });
      console.log('❗response:', response);
      chatContext.setChatId(response.chatId);
      conversationContext.setLocalConversations(response.conversations);
      setError(undefined);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return { send, loading, error };
};

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { produce } from 'immer';
import { useContext } from 'react';
import { OBSERVABILITY_BASE } from '../../../../common/constants/shared';
import {
  IConversation,
  ISuggestedAction,
} from '../../../../common/types/observability_saved_object_attributes';
import { ChatContext, ConversationContext, CoreServicesContext } from '../header_chat_button';

interface SendResponse {
  chatId: string;
  conversations: IConversation[];
}

let abortControllerRef: AbortController;

export const useChatActions = () => {
  const chatContext = useContext(ChatContext)!;
  const coreServicesContext = useContext(CoreServicesContext)!;
  const conversationContext = useContext(ConversationContext)!;

  const send = async (input: IConversation) => {
    const abortController = new AbortController();
    abortControllerRef = abortController;
    conversationContext.setLocalConversation(
      produce((draft) => {
        draft.conversations.push(input);
        draft.llmError = undefined;
        draft.llmResponding = true;
      })
    );
    try {
      const response = await coreServicesContext.http.post<SendResponse>(
        `${OBSERVABILITY_BASE}/chat/send`,
        {
          body: JSON.stringify({
            chatId: chatContext.chatId,
            localConversations: conversationContext.localConversation.conversations,
            input,
          }),
        }
      );
      if (abortController.signal.aborted) return;
      chatContext.setChatId(response.chatId);
      conversationContext.setLocalConversation({
        llmError: undefined,
        llmResponding: false,
        conversations: response.conversations,
        persisted: true,
      });
    } catch (error) {
      if (abortController.signal.aborted) return;
      conversationContext.setLocalConversation(
        produce((draft) => {
          draft.llmError = error;
          draft.llmResponding = false;
        })
      );
    }
  };

  const openChat = (chatId?: string) => {
    abortControllerRef?.abort();
    chatContext.setChatId(chatId);
    chatContext.setSelectedTabId('chat');
    conversationContext.setLocalConversation({
      llmResponding: false,
      conversations: [
        {
          content: `Hello, I'm the Observability assistant.

How may I help you?`,
          contentType: 'markdown',
          type: 'output',
          suggestedActions: [
            { message: 'Answer questions about my system', actionType: 'send_as_input' },
            {
              message:
                "I'm noticing some issues in the error rate of a service, would you like to dive in?",
              actionType: 'send_as_input',
            },
          ],
        },
      ],
      persisted: false,
    });
  };

  const executeAction = (suggestAction: ISuggestedAction, conversation: IConversation) => {
    switch (suggestAction.actionType) {
      case 'send_as_input':
        send({
          type: 'input',
          content: suggestAction.message,
          contentType: 'text',
        });
        break;

      default:
        break;
    }
  };

  return { send, openChat, executeAction };
};

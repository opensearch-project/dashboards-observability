/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { produce } from 'immer';
import { useContext } from 'react';
import { OBSERVABILITY_BASE } from '../../../../common/constants/shared';
import {
  IMessage,
  ISuggestedAction,
} from '../../../../common/types/observability_saved_object_attributes';
import { ChatContext, ChatStateContext, CoreServicesContext } from '../chat_header_button';

interface SendResponse {
  chatId: string;
  messages: IMessage[];
}

let abortControllerRef: AbortController;

export const useChatActions = () => {
  const chatContext = useContext(ChatContext)!;
  const coreServicesContext = useContext(CoreServicesContext)!;
  const chatStateContext = useContext(ChatStateContext)!;

  const send = async (input: IMessage) => {
    const abortController = new AbortController();
    abortControllerRef = abortController;
    chatStateContext.setChatState(
      produce((draft) => {
        draft.messages.push(input);
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
            messages: chatStateContext.chatState.messages,
            input,
          }),
        }
      );
      if (abortController.signal.aborted) return;
      chatContext.setChatId(response.chatId);
      chatStateContext.setChatState({
        llmError: undefined,
        llmResponding: false,
        messages: response.messages,
        persisted: true,
      });
    } catch (error) {
      if (abortController.signal.aborted) return;
      chatStateContext.setChatState(
        produce((draft) => {
          draft.llmError = error as Error;
          draft.llmResponding = false;
        })
      );
    }
  };

  const openChat = (chatId?: string) => {
    abortControllerRef?.abort();
    chatContext.setChatId(chatId);
    chatContext.setSelectedTabId('chat');
    chatStateContext.setChatState({
      llmResponding: false,
      messages: [
        {
          content: `Hello, I'm the Observability assistant.\n\nHow may I help you?`,
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

  const executeAction = (suggestAction: ISuggestedAction, message: IMessage) => {
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

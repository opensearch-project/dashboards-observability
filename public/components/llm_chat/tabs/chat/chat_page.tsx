/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlyoutBody, EuiFlyoutFooter, EuiPage, EuiPageBody, EuiSpacer } from '@elastic/eui';
import React, { useContext, useEffect, useState } from 'react';
import { IConversation } from '../../../../../common/types/observability_saved_object_attributes';
import { ChatContext, ConversationContext } from '../../header_chat_button';
import { useChatActions } from '../../hooks/use_chat_actions';
import { useGetChat } from '../../hooks/use_get_chat';
import { ChatInputControls } from './chat_input_controls';
import { ChatPageContent } from './chat_page_content';

interface ChatPageProps {
  input: string;
  setInput: (input: string) => void;
}

export const ChatPage: React.FC<ChatPageProps> = (props) => {
  console.count('chat page rerender');
  const chatContext = useContext(ChatContext)!;
  const conversationContext = useContext(ConversationContext)!;
  const [showGreetings, setShowGreetings] = useState(true);
  const {
    data: chat,
    loading: conversationLoading,
    error: conversationLoadingError,
  } = useGetChat();
  const { send, loading: llmResponding, error: llmError } = useChatActions();

  useEffect(() => {
    if (chat) {
      conversationContext.setLocalConversations(chat.attributes.conversations);
    } else if (!chat && !chatContext.chatId) {
      conversationContext.setLocalConversations([]);
    }
  }, [chat]);

  const onSubmit = async () => {
    const userInput = props.input.trim();
    if (!userInput) return;
    const input: IConversation = {
      type: 'input',
      content: userInput,
      contentType: 'text',
      context: {
        appId: chatContext.appId,
      },
    };
    props.setInput('');
    send(input);
  };

  return (
    <>
      <EuiFlyoutBody>
        <EuiPage>
          <EuiPageBody component="div" className="llm-chat-page-body">
            <ChatPageContent
              showGreetings={showGreetings}
              setShowGreetings={setShowGreetings}
              conversationLoading={conversationLoading}
              conversationLoadingError={conversationLoadingError}
              llmResponding={llmResponding}
              llmError={llmError}
            />
          </EuiPageBody>
        </EuiPage>
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiSpacer />
        <ChatInputControls
          disabled={conversationLoading || llmResponding}
          input={props.input}
          setInput={props.setInput}
          onSumbit={onSubmit}
        />
        <EuiSpacer />
      </EuiFlyoutFooter>
    </>
  );
};

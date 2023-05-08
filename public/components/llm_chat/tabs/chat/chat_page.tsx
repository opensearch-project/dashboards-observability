/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlyoutBody, EuiFlyoutFooter, EuiPage, EuiPageBody, EuiSpacer } from '@elastic/eui';
import { produce } from 'immer';
import React, { useContext, useEffect, useState } from 'react';
import { ConversationContext } from '../../header_chat_button';
import { useGetChat } from '../../hooks/use_get_chat';
import { ChatInputControls } from './chat_input_controls';
import { ChatPageContent } from './chat_page_content';

interface ChatPageProps {
  input: string;
  setInput: (input: string) => void;
}

export const ChatPage: React.FC<ChatPageProps> = (props) => {
  console.count('chat page rerender');
  const conversationContext = useContext(ConversationContext)!;
  const [showGreetings, setShowGreetings] = useState(true);
  const {
    data: chat,
    loading: conversationLoading,
    error: conversationLoadingError,
  } = useGetChat();

  useEffect(() => {
    if (chat && !conversationContext.localConversation.persisted) {
      conversationContext.setLocalConversation(
        produce((draft) => {
          draft.conversations = chat.attributes.conversations;
          draft.persisted = true;
        })
      );
    }
  }, [chat]);

  const inputDisabled = conversationLoading || conversationContext.localConversation.llmResponding;

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
              inputDisabled={inputDisabled}
            />
          </EuiPageBody>
        </EuiPage>
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiSpacer />
        <ChatInputControls disabled={inputDisabled} input={props.input} setInput={props.setInput} />
        <EuiSpacer />
      </EuiFlyoutFooter>
    </>
  );
};

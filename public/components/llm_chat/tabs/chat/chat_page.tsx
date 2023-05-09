/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlyoutBody, EuiFlyoutFooter, EuiPage, EuiPageBody, EuiSpacer } from '@elastic/eui';
import { produce } from 'immer';
import React, { useContext, useEffect, useState } from 'react';
import { ChatStateContext } from '../../chat_header_button';
import { useGetChat } from '../../hooks/use_get_chat';
import { ChatInputControls } from './chat_input_controls';
import { ChatPageContent } from './chat_page_content';

interface ChatPageProps {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
}

export const ChatPage: React.FC<ChatPageProps> = (props) => {
  console.count('chat page rerender');
  const chatStateContext = useContext(ChatStateContext)!;
  const [showGreetings, setShowGreetings] = useState(true);
  const { data: chat, loading: messagesLoading, error: messagesLoadingError } = useGetChat();

  useEffect(() => {
    if (chat && !chatStateContext.chatState.persisted) {
      chatStateContext.setChatState(
        produce((draft) => {
          draft.messages = chat.attributes.messages;
          draft.persisted = true;
        })
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat]);

  const inputDisabled = messagesLoading || chatStateContext.chatState.llmResponding;

  return (
    <>
      <EuiFlyoutBody>
        <EuiPage>
          <EuiPageBody component="div" className="llm-chat-page-body">
            <ChatPageContent
              showGreetings={showGreetings}
              setShowGreetings={setShowGreetings}
              messagesLoading={messagesLoading}
              messagesLoadingError={messagesLoadingError}
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

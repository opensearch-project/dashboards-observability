/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlyoutBody, EuiFlyoutFooter, EuiPage, EuiPageBody, EuiSpacer } from '@elastic/eui';
import React, { useContext, useEffect, useState } from 'react';
import { LoadingButton } from '../../components/loading_button';
import { ChatContext } from '../../header_chat_button';
import { useChatActions } from '../../hooks/use_chat_actions';
import { useFetchChat } from '../../hooks/use_fetch_chat';
import { IConversation } from '../../types';
import { ChatInputControls } from './chat_input_controls';
import { ChatPageContent } from './chat_page_content';
import { ChatPageSuggestions } from './chat_page_suggestions';

interface ChatPageProps {
  input: string;
  setInput: (input: string) => void;
}

export const ChatPage: React.FC<ChatPageProps> = (props) => {
  const chatContext = useContext(ChatContext)!;
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [localConversations, setLocalConversations] = useState<IConversation[]>([]);
  const { chat, loading, error } = useFetchChat();
  const { send, loading: llmResponding, error: llmError } = useChatActions();

  useEffect(() => {
    if (chat && !localConversations.length) {
      setLocalConversations(chat.attributes.conversations);
    } else if (!chat && !chatContext.chatId) {
      setLocalConversations([]);
    }
  }, [chat]);

  const onSubmit = async () => {
    if (!props.input) return;
    const input: IConversation = {
      type: 'input',
      content: props.input,
    };
    setLocalConversations((prev) => [...prev, input]);
    props.setInput('');
    const output = await send(localConversations, input);
    setLocalConversations((prev) => [...prev, output]);
  };

  let pageContent;
  if (loading && !localConversations.length) {
    pageContent = <LoadingButton />;
  } else if (error) {
    pageContent = <div>error: {error.message}</div>;
  } else {
    pageContent = (
      <ChatPageContent
        localConversations={localConversations}
        llmResponding={llmResponding}
        llmError={llmError}
      />
    );
  }

  return (
    <>
      <EuiFlyoutBody>
        <EuiPage>
          <EuiPageBody component="div" className="llm-chat-page-body">
            {showSuggestions && (
              <ChatPageSuggestions closeSuggestions={() => setShowSuggestions(false)} />
            )}
            {pageContent}
          </EuiPageBody>
        </EuiPage>
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiSpacer />
        <ChatInputControls
          disabled={loading || llmResponding}
          input={props.input}
          setInput={props.setInput}
          onSumbit={onSubmit}
        />
        <EuiSpacer />
      </EuiFlyoutFooter>
    </>
  );
};

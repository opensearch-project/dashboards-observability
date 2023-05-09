/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiEmptyPrompt, EuiSpacer } from '@elastic/eui';
import React, { useContext, useEffect, useRef } from 'react';
import { LoadingButton } from '../../components/loading_button';
import { ChatStateContext } from '../../chat_header_button';
import { ChatPageGreetings } from './chat_page_greetings';
import { MessageBubble } from './message_bubble';
import { MessageContent } from './message_content';
import { SuggestionBubble } from './suggested_actions/suggestion_bubble';

interface ChatPageContentProps {
  showGreetings: boolean;
  setShowGreetings: React.Dispatch<React.SetStateAction<boolean>>;
  messagesLoading: boolean;
  messagesLoadingError?: Error;
  inputDisabled: boolean;
}

export const ChatPageContent: React.FC<ChatPageContentProps> = React.memo((props) => {
  console.count('chat page content rerender');
  const chatStateContext = useContext(ChatStateContext)!;
  const pageEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pageEndRef.current?.scrollIntoView();
  }, [chatStateContext.chatState.messages, chatStateContext.chatState.llmResponding]);

  if (props.messagesLoading && !chatStateContext.chatState.messages.length) {
    return <LoadingButton />;
  } else if (props.messagesLoadingError) {
    return (
      <EuiEmptyPrompt
        iconType="alert"
        iconColor="danger"
        title={<h2>Error loading chat history</h2>}
        body={props.messagesLoadingError.message}
      />
    );
  }

  return (
    <>
      {props.showGreetings && <ChatPageGreetings dismiss={() => props.setShowGreetings(false)} />}
      {chatStateContext.chatState.messages
        .flatMap((message) => [
          // TODO add id to message and add key properties
          <MessageBubble type={message.type} contentType={message.contentType}>
            <MessageContent message={message} />
          </MessageBubble>,
          message.suggestedActions?.flatMap((suggestedAction) => [
            <EuiSpacer size="m" />,
            <SuggestionBubble
              inputDisabled={props.inputDisabled}
              message={message}
              suggestedAction={suggestedAction}
            />,
          ]),
          <EuiSpacer />,
        ])
        .slice(0, -1)}
      {chatStateContext.chatState.llmResponding && <LoadingButton />}
      {chatStateContext.chatState.llmError && (
        <EuiEmptyPrompt
          iconType="alert"
          iconColor="danger"
          title={<h2>Error from response</h2>}
          body={chatStateContext.chatState.llmError.message}
        />
      )}
      <div ref={pageEndRef} />
    </>
  );
});
